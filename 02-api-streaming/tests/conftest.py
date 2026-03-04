"""Shared test fixtures for the Beacon API test suite."""
import json
from collections.abc import AsyncGenerator
from unittest.mock import patch

import pytest

from beacon.models import (
    ArtifactEvent,
    CompleteEvent,
    ErrorEvent,
    EvaluatedSource,
    Flashcard,
    IntelligenceSignals,
    PipelineEvent,
    Source,
    SourceEvaluatedEvent,
    SourcesFoundEvent,
    StatusEvent,
    ResearchResult,
)
from beacon.pipeline import run_research  # noqa: F401


@pytest.fixture
def sample_sources() -> list[EvaluatedSource]:
    """Realistic evaluated sources with intelligence signals."""
    return [
        EvaluatedSource(
            url="https://example.com/tutorial",
            title="Python Async Tutorial",
            snippet="A comprehensive guide to async programming in Python.",
            signals=IntelligenceSignals(
                learning_efficiency_score=8,
                content_type="tutorial",
                time_estimate_minutes=15,
                recency="2024",
                key_insight="Covers modern async/await patterns with practical examples",
                coverage=["asyncio", "coroutines"],
            ),
            deep_read_content="Full tutorial content about async patterns...",
        ),
        EvaluatedSource(
            url="https://example.com/docs",
            title="FastAPI Documentation",
            snippet="Official FastAPI framework documentation.",
            signals=IntelligenceSignals(
                learning_efficiency_score=6,
                content_type="docs",
                time_estimate_minutes=30,
                recency="2024",
                key_insight="Comprehensive API design patterns with automatic validation",
                coverage=["fastapi", "pydantic"],
            ),
        ),
    ]


@pytest.fixture
def sample_flashcards() -> list[Flashcard]:
    """Sample flashcards for testing."""
    return [
        Flashcard(
            question="What is an async generator?",
            answer="A function that uses both async/await and yield to produce values asynchronously.",
        ),
        Flashcard(
            question="What does SSE stand for?",
            answer="Server-Sent Events, a standard for pushing real-time updates from server to client over HTTP.",
        ),
    ]


@pytest.fixture
def sample_research_result(
    sample_sources: list[EvaluatedSource],
    sample_flashcards: list[Flashcard],
) -> ResearchResult:
    """Fully populated research result for testing."""
    return ResearchResult(
        topic="async programming in Python",
        depth="standard",
        sources=sample_sources,
        session_id="test-session-123",
        timestamp="2024-01-15T10:30:00Z",
        artifacts={
            "summary": "## Research Summary\n\nThis research covers async programming patterns in Python.",
            "concept_map": "- Async Programming\n  - asyncio\n  - coroutines\n  - event loop",
            "flashcards": sample_flashcards,
            "resources": json.dumps([
                {
                    "title": "Python Async Tutorial",
                    "url": "https://example.com/tutorial",
                    "description": "Comprehensive async guide",
                }
            ]),
        },
    )


@pytest.fixture
def empty_research_result() -> ResearchResult:
    """Research result with empty data (failed pipeline run)."""
    return ResearchResult(
        topic="empty topic",
        depth="quick",
        sources=[],
        artifacts={},
        session_id="empty-session-456",
        timestamp="2024-01-15T10:30:00Z",
    )


@pytest.fixture
def session_store():
    """Fresh SessionStore with short TTL and small capacity for testing."""
    from server.sessions import SessionStore

    return SessionStore(ttl_seconds=5, max_sessions=3)


@pytest.fixture
def mock_pipeline(
    sample_research_result: ResearchResult,
    sample_sources: list[EvaluatedSource],
):
    """Factory that creates mock pipeline async generators.

    Returns a function that accepts an optional list of events.
    If no events are provided, yields a realistic happy-path sequence.
    """

    def _make_pipeline(events: list[PipelineEvent] | None = None):
        async def _generator(topic: str, depth: str) -> AsyncGenerator[PipelineEvent, None]:
            if events is not None:
                for event in events:
                    yield event
                return

            # Default happy-path sequence
            yield StatusEvent(message="Searching...")
            yield SourcesFoundEvent(
                count=2,
                sources=[
                    Source(url=s.url, title=s.title, snippet=s.snippet)
                    for s in sample_sources
                ],
            )
            yield SourceEvaluatedEvent(index=1, total=2, source=sample_sources[0])
            yield SourceEvaluatedEvent(index=2, total=2, source=sample_sources[1])
            yield ArtifactEvent(artifact_type="summary", data="# Summary...")
            yield ArtifactEvent(artifact_type="concept_map", data="- Concepts...")
            yield ArtifactEvent(artifact_type="flashcards", data=sample_research_result.artifacts["flashcards"])
            yield ArtifactEvent(
                artifact_type="resources",
                data=sample_research_result.artifacts["resources"],
            )
            yield CompleteEvent(
                session_id="test-session-123",
                result=sample_research_result,
            )

        return _generator

    return _make_pipeline


@pytest.fixture
def app(mock_pipeline):
    """FastAPI app with run_research patched to use mock pipeline."""
    from server.app import create_app

    with patch("server.sse.run_research", mock_pipeline()):
        yield create_app()


@pytest.fixture
async def client(app):
    """httpx AsyncClient wired to the test FastAPI app."""
    from httpx import AsyncClient, ASGITransport

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
