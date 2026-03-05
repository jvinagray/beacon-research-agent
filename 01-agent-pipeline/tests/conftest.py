"""Shared test fixtures for the Beacon pipeline test suite."""
import pytest
from unittest.mock import AsyncMock, MagicMock


# ---------------------------------------------------------------------------
# Sample data fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def sample_sources():
    """List of 5 Source objects for testing. Imports from beacon.models."""
    from beacon.models import Source
    return [
        Source(url="https://example.com/tutorial", title="Tutorial Guide", snippet="A comprehensive tutorial on the topic."),
        Source(url="https://example.com/paper", title="Research Paper", snippet="An academic paper exploring the fundamentals."),
        Source(url="https://example.com/docs", title="Official Documentation", snippet="The official docs for the framework."),
        Source(url="https://example.com/blog", title="Blog Post", snippet="A blog post with practical examples."),
        Source(url="https://example.com/forum", title="Forum Discussion", snippet="Community discussion with multiple perspectives."),
    ]


@pytest.fixture
def sample_intelligence_signals():
    """A single IntelligenceSignals instance with typical values."""
    from beacon.models import IntelligenceSignals
    return IntelligenceSignals(
        learning_efficiency_score=8,
        content_type="tutorial",
        time_estimate_minutes=15,
        recency="2025",
        key_insight="Comprehensive walkthrough of core concepts with practical examples.",
        coverage=["fundamentals", "best practices", "examples"],
        evaluation_failed=False,
    )


@pytest.fixture
def sample_evaluated_sources(sample_sources, sample_intelligence_signals):
    """List of 5 EvaluatedSource objects with signals attached."""
    from beacon.models import EvaluatedSource
    evaluated = []
    for i, src in enumerate(sample_sources):
        from beacon.models import IntelligenceSignals
        signals = IntelligenceSignals(
            learning_efficiency_score=10 - i * 2,  # 10, 8, 6, 4, 2
            content_type="tutorial",
            time_estimate_minutes=10 + i * 5,
            recency="2025",
            key_insight=f"Key insight for source {i + 1}.",
            coverage=["topic"],
            evaluation_failed=False,
        )
        evaluated.append(EvaluatedSource(
            url=src.url,
            title=src.title,
            snippet=src.snippet,
            signals=signals,
            deep_read_content=None,
            extraction_method=None,
        ))
    return evaluated


@pytest.fixture
def sample_deep_read_content():
    """Realistic markdown content string representing extracted page content."""
    return (
        "# Understanding the Topic\n\n"
        "This guide covers the fundamentals of the topic in depth.\n\n"
        "## Key Concepts\n\n"
        "- Concept A: The foundational building block.\n"
        "- Concept B: Builds on Concept A with additional patterns.\n"
        "- Concept C: Advanced technique for production use.\n\n"
        "## Best Practices\n\n"
        "1. Always start with a clear problem statement.\n"
        "2. Use iterative refinement to improve results.\n"
        "3. Test with diverse inputs to ensure robustness.\n\n"
        "## Conclusion\n\n"
        "By following these practices, you can effectively apply these concepts."
    )


# ---------------------------------------------------------------------------
# Mock client fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_anthropic_client():
    """Returns an AsyncMock mimicking the anthropic.AsyncAnthropic client.

    Pre-configured to return a valid JSON response from messages.create().
    Override the return value in individual tests as needed.
    """
    client = AsyncMock()
    mock_response = MagicMock()
    mock_response.content = [MagicMock()]
    mock_response.content[0].text = '{"learning_efficiency_score": 8, "content_type": "tutorial", "time_estimate_minutes": 15, "recency": "2025", "key_insight": "Great resource.", "coverage": ["topic"]}'
    client.messages.create = AsyncMock(return_value=mock_response)
    return client


@pytest.fixture
def mock_tavily_client():
    """Returns an AsyncMock mimicking the tavily.AsyncTavilyClient.

    Pre-configured with search() and extract() responses.
    Override in individual tests as needed.
    """
    client = AsyncMock()

    # Default search response
    client.search = AsyncMock(return_value={
        "results": [
            {"url": "https://example.com/result1", "title": "Result 1", "content": "Snippet for result 1."},
            {"url": "https://example.com/result2", "title": "Result 2", "content": "Snippet for result 2."},
            {"url": "https://example.com/result3", "title": "Result 3", "content": "Snippet for result 3."},
        ]
    })

    # Default extract response
    client.extract = AsyncMock(return_value={
        "results": [
            {"url": "https://example.com/result1", "raw_content": "# Full Content\n\nDetailed markdown content for result 1." * 10},
        ],
        "failed_results": [],
    })

    return client
