"""API-layer Pydantic request/response models."""
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class ChatMessage(BaseModel):
    """A single message in a chat conversation."""

    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    """POST /api/chat/{session_id} request body."""

    message: str = Field(..., max_length=4000)
    history: list[ChatMessage] = Field(default=[], max_length=40)


class RewriteRequest(BaseModel):
    """POST /api/rewrite/{session_id} request body."""

    level: int = Field(..., ge=1, le=5)


class DrillDownRequest(BaseModel):
    """POST /api/drilldown/{session_id} request body."""

    concept: str = Field(..., min_length=1, max_length=500)

    @field_validator("concept")
    @classmethod
    def concept_not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("concept must not be blank")
        return v


class ResearchRequest(BaseModel):
    """POST /api/research request body."""

    topic: str
    depth: Literal["quick", "standard", "deep"]


class ResearchSummary(BaseModel):
    """Nested summary within complete event."""

    topic: str
    depth: str
    source_count: int = Field(ge=0)
    artifact_types: list[str]


class CompleteSummary(BaseModel):
    """Sent as SSE complete event data."""

    type: Literal["complete"] = "complete"
    session_id: str
    summary: ResearchSummary
