"""API-layer Pydantic request/response models."""
from typing import Literal

from pydantic import BaseModel, Field


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
