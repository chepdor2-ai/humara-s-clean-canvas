from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

import yaml

from app.core.config import get_settings
from app.core.constants import CONFIDENCE_HIGH
from app.core.logging import get_logger
from app.schemas.edit import Edit
from app.services.protected_spans import ProtectedSpan

log = get_logger(__name__)


@dataclass
class Rule:
    id: str
    name: str
    pattern: str
    replacement: str
    category: str
    description: str = ""
    priority: int = 50
    confidence: float = CONFIDENCE_HIGH
    enabled: bool = True
    domain: list[str] = field(default_factory=lambda: ["general"])
    block_if_protected_span: bool = True
    _compiled: re.Pattern[str] | None = field(default=None, repr=False)

    @property
    def compiled(self) -> re.Pattern[str]:
        if self._compiled is None:
            self._compiled = re.compile(self.pattern)
        return self._compiled


class RuleEngine:
    def __init__(self) -> None:
        self._rules: list[Rule] = []
        self.load_rules()

    @property
    def rule_count(self) -> int:
        return len(self._rules)

    def load_rules(self) -> int:
        settings = get_settings()
        rules_dir = settings.rules_dir
        self._rules = []

        if not rules_dir.exists():
            log.warning("Rules directory %s does not exist", rules_dir)
            return 0

        for yaml_path in sorted(rules_dir.glob("*.yaml")):
            try:
                raw = yaml.safe_load(yaml_path.read_text(encoding="utf-8"))
                if not isinstance(raw, dict):
                    continue
                for rule_data in raw.get("rules", []):
                    rule = Rule(
                        id=rule_data["id"],
                        name=rule_data["name"],
                        pattern=rule_data["pattern"],
                        replacement=rule_data["replacement"],
                        category=rule_data.get("category", "grammar"),
                        description=rule_data.get("description", ""),
                        priority=rule_data.get("priority", 50),
                        confidence=rule_data.get("confidence", CONFIDENCE_HIGH),
                        enabled=rule_data.get("enabled", True),
                        domain=rule_data.get("domain", ["general"]),
                        block_if_protected_span=rule_data.get("block_if_protected_span", True),
                    )
                    self._rules.append(rule)
            except Exception:
                log.exception("Failed to load rules from %s", yaml_path)

        # Sort by priority (higher = runs first)
        self._rules.sort(key=lambda r: -r.priority)
        log.info("Loaded %d grammar rules", len(self._rules))
        return len(self._rules)

    def apply(
        self,
        text: str,
        domain: str = "general",
        protected_spans: list[ProtectedSpan] | None = None,
    ) -> tuple[str, list[Edit]]:
        edits: list[Edit] = []
        result = text
        protected = protected_spans or []

        for rule in self._rules:
            if not rule.enabled:
                continue
            if domain not in rule.domain and "general" not in rule.domain:
                continue

            needs_upper = "\\U" in rule.replacement
            # Build a replacement function if uppercase conversion is needed
            if needs_upper:
                clean_repl = rule.replacement.replace("\\U", "")
                def _make_replacer(repl: str):
                    def _replacer(m: re.Match) -> str:
                        return m.expand(repl).upper()
                    return _replacer
                replacer = _make_replacer(clean_repl)
            else:
                replacer = None

            for m in rule.compiled.finditer(result):
                # Check protected spans
                if rule.block_if_protected_span:
                    overlaps = any(
                        s.start < m.end() and m.start() < s.end for s in protected
                    )
                    if overlaps:
                        continue

                replaced = replacer(m) if replacer else m.expand(rule.replacement)
                if replaced != m.group():
                    edits.append(
                        Edit(
                            type=rule.category,
                            original=m.group(),
                            corrected=replaced,
                            char_offset_start=m.start(),
                            char_offset_end=m.end(),
                            confidence=rule.confidence,
                            applied=True,
                            source="rule",
                            rule_id=rule.id,
                        )
                    )

            if replacer:
                result = rule.compiled.sub(replacer, result)
            else:
                result = rule.compiled.sub(rule.replacement, result)

        return result, edits
