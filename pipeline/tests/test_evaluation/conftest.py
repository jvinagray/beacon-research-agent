"""Golden dataset fixtures and mock judge helpers for evaluation tests."""
import json

import pytest
from unittest.mock import AsyncMock, MagicMock

from beacon.models import (
    EvaluatedSource,
    Flashcard,
    IntelligenceSignals,
    ResearchResult,
)


def make_judge_response(data: dict) -> MagicMock:
    """Create a mock Anthropic response returning the given dict as JSON."""
    response = MagicMock()
    response.content = [MagicMock()]
    response.content[0].text = json.dumps(data)
    return response


@pytest.fixture
def mock_judge_client():
    """AsyncMock Anthropic client that returns configurable JSON.

    Default response is a simple relevance judgment. Override
    client.messages.create.return_value or .side_effect as needed.
    """
    client = AsyncMock()
    default_response = make_judge_response({"relevant": True, "reason": "Directly related"})
    client.messages.create = AsyncMock(return_value=default_response)
    return client


@pytest.fixture
def golden_evaluated_sources() -> list[EvaluatedSource]:
    """5 sources with varied scores, types, and extraction methods."""
    return [
        EvaluatedSource(
            url="https://example.com/tutorial",
            title="Python Async Tutorial",
            snippet="Comprehensive guide to async/await patterns in Python.",
            signals=IntelligenceSignals(
                learning_efficiency_score=9,
                content_type="tutorial",
                time_estimate_minutes=20,
                recency="2025",
                key_insight="Thorough walkthrough of asyncio event loop and coroutines.",
                coverage=["asyncio", "coroutines", "event loop", "best practices"],
            ),
            deep_read_content="# Python Async Tutorial\n\nFull content about asyncio patterns...",
            extraction_method="tavily",
        ),
        EvaluatedSource(
            url="https://example.com/paper",
            title="Concurrency Research Paper",
            snippet="Academic analysis of concurrency models in modern languages.",
            signals=IntelligenceSignals(
                learning_efficiency_score=7,
                content_type="paper",
                time_estimate_minutes=45,
                recency="2024",
                key_insight="Compares green threads, coroutines, and OS threads across languages.",
                coverage=["concurrency models", "performance", "comparisons"],
            ),
            deep_read_content="# Concurrency Models\n\nAcademic content comparing approaches...",
            extraction_method="trafilatura",
        ),
        EvaluatedSource(
            url="https://example.com/docs",
            title="Official asyncio Documentation",
            snippet="Python standard library asyncio documentation.",
            signals=IntelligenceSignals(
                learning_efficiency_score=8,
                content_type="docs",
                time_estimate_minutes=30,
                recency="2025",
                key_insight="Definitive reference for asyncio APIs and usage patterns.",
                coverage=["API reference", "event loop", "tasks", "streams"],
            ),
            deep_read_content=None,
            extraction_method=None,
        ),
        EvaluatedSource(
            url="https://example.com/blog",
            title="Async Python Blog Post",
            snippet="Practical tips for async Python in production.",
            signals=IntelligenceSignals(
                learning_efficiency_score=6,
                content_type="opinion",
                time_estimate_minutes=10,
                recency="2024",
                key_insight="Real-world pitfalls and solutions for async in production apps.",
                coverage=["production", "pitfalls", "debugging"],
            ),
            deep_read_content="# Async in Production\n\nBlog content with practical tips...",
            extraction_method="tavily",
        ),
        EvaluatedSource(
            url="https://example.com/forum",
            title="Stack Overflow Discussion",
            snippet="Community Q&A about asyncio error handling.",
            signals=IntelligenceSignals(
                learning_efficiency_score=4,
                content_type="forum",
                time_estimate_minutes=5,
                recency=None,
                key_insight="Common error handling patterns discussed by the community.",
                coverage=["error handling"],
            ),
            deep_read_content=None,
            extraction_method=None,
        ),
    ]


@pytest.fixture
def golden_summary() -> str:
    """Markdown summary with valid cite:1-5 references and one invalid cite:99."""
    return """\
# Python Async Patterns

## Overview

Python's asyncio library provides powerful tools for concurrent programming \
[Python Async Tutorial](cite:1). The event loop is the core mechanism that \
drives all async operations [Official asyncio Documentation](cite:3).

## Key Concepts

Modern concurrency approaches include coroutines, green threads, and OS-level \
threads [Concurrency Research Paper](cite:2). In production environments, \
developers face specific challenges with error handling and debugging \
[Async Python Blog Post](cite:4)[Stack Overflow Discussion](cite:5).

## Common Pitfalls

One often-cited issue is the complexity of error propagation in async code \
[Invalid Source](cite:99). Proper structured concurrency helps mitigate these \
risks [Python Async Tutorial](cite:1).
"""


@pytest.fixture
def golden_flashcards() -> list[dict[str, str]]:
    """Flashcard dicts for testing."""
    return [
        {"question": "What is the asyncio event loop?", "answer": "The event loop is the core of asyncio that runs async tasks, callbacks, and I/O operations."},
        {"question": "What is a coroutine in Python?", "answer": "A coroutine is a function defined with async def that can be paused and resumed."},
        {"question": "How do you run multiple tasks concurrently?", "answer": "Use asyncio.gather() or asyncio.create_task() to run multiple coroutines concurrently."},
    ]


@pytest.fixture
def golden_timeline() -> list[dict]:
    """Timeline events for testing."""
    return [
        {"date": "2015-09", "title": "asyncio in stdlib", "description": "asyncio became part of the Python standard library.", "source_title": "Official asyncio Documentation", "significance": "high"},
        {"date": "2018-05", "title": "async/await syntax", "description": "PEP 492 async/await syntax became mainstream.", "source_title": "Python Async Tutorial", "significance": "high"},
        {"date": "2024-01", "title": "Performance improvements", "description": "Major event loop performance improvements in CPython.", "source_title": "Concurrency Research Paper", "significance": "medium"},
    ]


@pytest.fixture
def golden_conflicts() -> list[dict]:
    """Conflict dicts for testing."""
    return [
        {
            "topic": "Thread vs coroutine performance",
            "source_a": {"title": "Python Async Tutorial", "claim": "Coroutines are always faster than threads for I/O"},
            "source_b": {"title": "Concurrency Research Paper", "claim": "Threads can outperform coroutines in CPU-bound scenarios"},
            "assessment": "Different contexts — I/O vs CPU bound workloads",
        },
    ]


@pytest.fixture
def golden_assumptions() -> list[dict]:
    """Assumption dicts for testing."""
    return [
        {
            "assumption": "I/O-bound workloads dominate modern applications",
            "why_it_matters": "If CPU-bound work is dominant, async patterns provide little benefit",
            "sources_relying": ["Python Async Tutorial", "Async Python Blog Post"],
            "risk_level": "medium",
        },
    ]


@pytest.fixture
def golden_artifacts(
    golden_summary,
    golden_flashcards,
    golden_timeline,
    golden_conflicts,
    golden_assumptions,
    golden_evaluated_sources,
) -> dict:
    """Complete artifact dict with all types."""
    return {
        "summary": golden_summary,
        "concept_map": "- **Asyncio**\n  - Event loop\n  - Coroutines",
        "flashcards": [Flashcard(**fc) for fc in golden_flashcards],
        "timeline": golden_timeline,
        "conflicts": golden_conflicts,
        "assumptions": golden_assumptions,
        "resources": [s.model_dump() for s in golden_evaluated_sources],
    }


@pytest.fixture
def golden_research_result(
    golden_evaluated_sources,
    golden_artifacts,
) -> ResearchResult:
    """Assembled ResearchResult for evaluation testing."""
    return ResearchResult(
        topic="Python async patterns",
        depth="standard",
        sources=golden_evaluated_sources,
        artifacts=golden_artifacts,
        session_id="test-session-001",
        timestamp="2025-01-01T00:00:00Z",
    )
