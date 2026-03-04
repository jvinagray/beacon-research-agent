"""API-layer Pydantic request/response models."""
from typing import Literal

from pydantic import BaseModel, Field


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
