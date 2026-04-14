from __future__ import annotations

import asyncio
from typing import Any

from app.core.config import get_settings
from app.core.constants import EDIT_GRAMMAR, CONFIDENCE_MEDIUM
from app.core.logging import get_logger
from app.schemas.edit import Edit
from app.services.protected_spans import ProtectedSpan

log = get_logger(__name__)


class MLCorrector:
    """Sentence-level GEC tagging model (GECToR-style).

    Loads a HuggingFace tagging model and runs sentence-level inference.
    ML acts as an optional second pass — only invoked when rules are
    insufficient or the sentence looks problematic.
    Falls back gracefully when the model is unavailable.
    """

    def __init__(self) -> None:
        self.model: Any = None
        self.tokenizer: Any = None
        self.model_loaded = False
        self._settings = get_settings()
        self._total_calls = 0
        self._total_skipped = 0
        self._use_onnx = False
        self._onnx_session: Any = None

    @property
    def stats(self) -> dict:
        return {
            "total_calls": self._total_calls,
            "total_skipped": self._total_skipped,
            "model_loaded": self.model_loaded,
            "backend": "onnx" if self._use_onnx else "pytorch",
        }

    async def load(self) -> None:
        if not self._settings.ml_enabled:
            log.info("ML corrector disabled by config")
            return

        # Try ONNX first if configured
        if self._settings.use_onnx:
            loaded = await self._load_onnx()
            if loaded:
                return

        # Fall back to standard HuggingFace
        try:
            from transformers import AutoTokenizer, AutoModelForSeq2SeqLM  # type: ignore[import-untyped]

            model_name = self._settings.gec_model_name
            log.info("Loading GEC model: %s", model_name)

            loop = asyncio.get_running_loop()
            self.tokenizer = await loop.run_in_executor(
                None, lambda: AutoTokenizer.from_pretrained(model_name)
            )
            self.model = await loop.run_in_executor(
                None, lambda: AutoModelForSeq2SeqLM.from_pretrained(model_name)
            )
            self.model.eval()
            self.model_loaded = True
            self._use_onnx = False
            log.info("GEC model loaded successfully (PyTorch)")
        except Exception:
            log.exception("Failed to load GEC model — ML corrections will be skipped")
            self.model_loaded = False

    async def _load_onnx(self) -> bool:
        """Try to load ONNX Runtime model for faster inference."""
        try:
            import onnxruntime as ort  # type: ignore[import-untyped]
            from transformers import AutoTokenizer  # type: ignore[import-untyped]

            model_name = self._settings.gec_model_name
            onnx_path = self._settings.models_dir / "model.onnx"

            if not onnx_path.exists():
                log.info("ONNX model not found at %s, skipping ONNX", onnx_path)
                return False

            log.info("Loading ONNX model from %s", onnx_path)
            loop = asyncio.get_running_loop()

            self.tokenizer = await loop.run_in_executor(
                None, lambda: AutoTokenizer.from_pretrained(model_name)
            )
            self._onnx_session = await loop.run_in_executor(
                None,
                lambda: ort.InferenceSession(
                    str(onnx_path),
                    providers=["CPUExecutionProvider"],
                ),
            )
            self.model_loaded = True
            self._use_onnx = True
            log.info("GEC model loaded successfully (ONNX)")
            return True
        except ImportError:
            log.info("onnxruntime not installed, skipping ONNX")
            return False
        except Exception:
            log.exception("Failed to load ONNX model")
            return False

    def should_run(
        self,
        original: str,
        rule_corrected: str,
        rule_edits: list[Edit],
        strict_minimal: bool = False,
    ) -> bool:
        """Decide whether ML should run as a second pass.

        ML is invoked only when:
        - Model is loaded and enabled
        - Not in strict_minimal mode
        - Rules produced no edits (sentence may still have errors)
        - OR sentence is short and looks potentially malformed
        """
        if not self.model_loaded or strict_minimal:
            return False

        # If rules already made corrections, trust them — skip ML
        applied_rule_edits = [e for e in rule_edits if e.applied]
        if len(applied_rule_edits) >= 2:
            return False

        # If no rules fired at all, ML might catch something rules missed
        if not applied_rule_edits:
            return True

        # If the sentence is short (< 15 words) and only 1 rule fired,
        # give ML a chance to find additional issues
        if len(original.split()) < 15 and len(applied_rule_edits) <= 1:
            return True

        return False

    async def correct(
        self,
        sentence: str,
        protected_spans: list[ProtectedSpan] | None = None,
    ) -> tuple[str, list[Edit]]:
        """Return (corrected_sentence, list_of_edits)."""
        self._total_calls += 1

        if not self.model_loaded or self.model is None or self.tokenizer is None:
            return sentence, []

        if len(sentence.split()) > self._settings.ml_max_sentence_length:
            self._total_skipped += 1
            return sentence, []

        try:
            loop = asyncio.get_running_loop()
            corrected = await asyncio.wait_for(
                loop.run_in_executor(None, self._infer, sentence),
                timeout=self._settings.ml_timeout_seconds,
            )
        except asyncio.TimeoutError:
            log.warning("ML inference timed out for sentence (len=%d)", len(sentence))
            self._total_skipped += 1
            return sentence, []
        except Exception:
            log.exception("ML inference failed")
            self._total_skipped += 1
            return sentence, []

        if corrected == sentence:
            return sentence, []

        edits = self._diff_to_edits(sentence, corrected, protected_spans or [])
        if edits:
            return corrected, edits
        return sentence, []

    def _infer(self, sentence: str) -> str:
        if self._use_onnx and self._onnx_session is not None:
            return self._infer_onnx(sentence)
        inputs = self.tokenizer(sentence, return_tensors="pt", truncation=True, max_length=256)
        outputs = self.model.generate(
            **inputs,
            max_new_tokens=256,
            num_beams=4,
            early_stopping=True,
        )
        return self.tokenizer.decode(outputs[0], skip_special_tokens=True)

    def _infer_onnx(self, sentence: str) -> str:
        """ONNX Runtime inference path."""
        import numpy as np  # type: ignore[import-untyped]

        inputs = self.tokenizer(sentence, return_tensors="np", truncation=True, max_length=256)
        ort_inputs = {k: v for k, v in inputs.items() if k in [i.name for i in self._onnx_session.get_inputs()]}
        outputs = self._onnx_session.run(None, ort_inputs)
        # Decode the first output sequence
        token_ids = np.argmax(outputs[0], axis=-1) if outputs[0].ndim == 3 else outputs[0]
        return self.tokenizer.decode(token_ids[0], skip_special_tokens=True)

    def _diff_to_edits(
        self,
        original: str,
        corrected: str,
        protected: list[ProtectedSpan],
    ) -> list[Edit]:
        """Simple word-level diff to produce edits."""
        orig_tokens = original.split()
        corr_tokens = corrected.split()

        edits: list[Edit] = []
        char_pos = 0
        for i in range(min(len(orig_tokens), len(corr_tokens))):
            ot = orig_tokens[i]
            ct = corr_tokens[i]
            start = original.find(ot, char_pos)
            if start == -1:
                start = char_pos
            end = start + len(ot)

            if ot != ct:
                overlaps = any(s.start < end and start < s.end for s in protected)
                if overlaps:
                    char_pos = end + 1
                    continue

                edits.append(
                    Edit(
                        type=EDIT_GRAMMAR,
                        original=ot,
                        corrected=ct,
                        char_offset_start=start,
                        char_offset_end=end,
                        confidence=CONFIDENCE_MEDIUM,
                        applied=True,
                        source="ml",
                    )
                )
            char_pos = end + 1

        return edits
