from __future__ import annotations

from fastapi import HTTPException, status


class ValidationError(HTTPException):
    def __init__(self, detail: str) -> None:
        super().__init__(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=detail)


class TextTooLongError(ValidationError):
    def __init__(self, length: int, max_length: int) -> None:
        super().__init__(f"Text length {length} exceeds maximum {max_length}")


class PipelineError(HTTPException):
    def __init__(self, detail: str) -> None:
        super().__init__(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=detail)


class ModelUnavailableError(HTTPException):
    def __init__(self) -> None:
        super().__init__(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ML model is not available; rule-based corrections were applied instead.",
        )
