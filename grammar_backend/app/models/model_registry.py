from __future__ import annotations

from app.core.logging import get_logger

log = get_logger(__name__)


class ModelRegistry:
    """Keeps track of loaded models and their versions."""

    def __init__(self) -> None:
        self._models: dict[str, dict] = {}

    def register(self, name: str, version: str, model: object) -> None:
        self._models[name] = {"version": version, "model": model}
        log.info("Registered model %s v%s", name, version)

    def get(self, name: str) -> object | None:
        entry = self._models.get(name)
        return entry["model"] if entry else None

    def version(self, name: str) -> str | None:
        entry = self._models.get(name)
        return entry["version"] if entry else None

    def is_loaded(self, name: str) -> bool:
        return name in self._models

    def list_models(self) -> list[str]:
        return list(self._models.keys())
