"""Beacon data models: all Pydantic models and pipeline event types."""
from pydantic import BaseModel, Field
from typing import Literal, Any


class Source(BaseModel):
    """Raw search result from Tavily."""
    url: str
    title: str
    snippet: str


class IntelligenceSignals(BaseModel):
    """Claude's evaluation of a source's learning value."""
    learning_efficiency_score: int = Field(ge=0, le=10)
    content_type: Literal[
        "tutorial", "paper", "docs", "opinion", "video",
        "forum", "repository", "course", "other"
    ]
    time_estimate_minutes: int
    recency: str | None
    key_insight: str
    coverage: list[str]
    evaluation_failed: bool = False


class EvaluatedSource(BaseModel):
    """Source with intelligence signals and optional deep-read content."""
    url: str
    title: str
    snippet: str
    signals: IntelligenceSignals
    deep_read_content: str | None = None
    extraction_method: str | None = None


class Flashcard(BaseModel):
    """A single question/answer pair for study."""
    question: str
    answer: str


class ResearchResult(BaseModel):
    """Complete output of a research run."""
    topic: str
    depth: str
    sources: list[EvaluatedSource]
    artifacts: dict[str, Any]
    session_id: str
    timestamp: str


class StatusEvent(BaseModel):
    """Pipeline status update event."""
    type: Literal["status"] = "status"
    message: str


class SourcesFoundEvent(BaseModel):
    """Emitted when search results are found."""
    type: Literal["sources_found"] = "sources_found"
    count: int
    sources: list[Source]


class SourceEvaluatedEvent(BaseModel):
    """Emitted when a single source has been evaluated."""
    type: Literal["source_evaluated"] = "source_evaluated"
    index: int
    total: int
    source: EvaluatedSource


class ArtifactEvent(BaseModel):
    """Emitted when a synthesis artifact is generated."""
    type: Literal["artifact"] = "artifact"
    artifact_type: Literal["summary", "concept_map", "flashcards", "resources"]
    data: str | list[Flashcard]


class ErrorEvent(BaseModel):
    """Emitted when a recoverable or fatal error occurs."""
    type: Literal["error"] = "error"
    message: str
    recoverable: bool


class CompleteEvent(BaseModel):
    """Emitted when the pipeline has finished."""
    type: Literal["complete"] = "complete"
    session_id: str
    result: ResearchResult


PipelineEvent = StatusEvent | SourcesFoundEvent | SourceEvaluatedEvent | ArtifactEvent | ErrorEvent | CompleteEvent
