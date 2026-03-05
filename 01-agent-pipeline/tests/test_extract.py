"""Tests for beacon.extract -- write these FIRST."""
import asyncio
import pytest
from unittest.mock import AsyncMock, patch
from beacon.models import EvaluatedSource, IntelligenceSignals


def _make_evaluated_source(url: str, score: int = 8, snippet: str = "Default snippet.") -> EvaluatedSource:
    """Helper: create an EvaluatedSource for testing."""
    signals = IntelligenceSignals(
        learning_efficiency_score=score,
        content_type="tutorial",
        time_estimate_minutes=10,
        recency=None,
        key_insight="Good source.",
        coverage=["topic"],
    )
    return EvaluatedSource(
        url=url,
        title="Test Source",
        snippet=snippet,
        signals=signals,
        deep_read_content=None,
        extraction_method=None,
    )


@pytest.fixture
def sources():
    """Three EvaluatedSource objects for testing extraction."""
    return [
        _make_evaluated_source("https://example.com/page1"),
        _make_evaluated_source("https://example.com/page2"),
        _make_evaluated_source("https://example.com/page3"),
    ]


class TestTavilyExtractBatch:
    @pytest.mark.asyncio
    async def test_sends_all_urls_in_single_batch(self, sources):
        """extract_content sends all URLs to Tavily Extract in one batch call."""
        client = AsyncMock()
        long_content = "# Full Content\n\n" + "Detailed content. " * 50  # > 200 chars
        client.extract = AsyncMock(return_value={
            "results": [
                {"url": "https://example.com/page1", "raw_content": long_content},
                {"url": "https://example.com/page2", "raw_content": long_content},
                {"url": "https://example.com/page3", "raw_content": long_content},
            ],
            "failed_results": [],
        })
        from beacon.extract import extract_content
        results = await extract_content(sources, client=client)
        client.extract.assert_called_once()

    @pytest.mark.asyncio
    async def test_successful_tavily_sets_extraction_method(self, sources):
        """Successful Tavily Extract sets extraction_method='tavily_extract'."""
        client = AsyncMock()
        long_content = "Detailed content. " * 50
        client.extract = AsyncMock(return_value={
            "results": [{"url": s.url, "raw_content": long_content} for s in sources],
            "failed_results": [],
        })
        from beacon.extract import extract_content
        results = await extract_content(sources, client=client)
        for r in results:
            assert r.extraction_method == "tavily_extract"
            assert r.deep_read_content is not None


class TestTrafilaturaFallback:
    @pytest.mark.asyncio
    async def test_failed_tavily_url_falls_back_to_trafilatura(self):
        """URLs in Tavily's failed_results fall back to trafilatura."""
        client = AsyncMock()
        client.extract = AsyncMock(return_value={
            "results": [],
            "failed_results": [{"url": "https://example.com/page1"}],
        })
        source = _make_evaluated_source("https://example.com/page1")
        traf_content = "Trafilatura extracted content. " * 20  # > 200 chars

        with patch("beacon.extract.asyncio.to_thread", new_callable=AsyncMock) as mock_to_thread:
            mock_to_thread.return_value = traf_content
            from beacon.extract import extract_content
            results = await extract_content([source], client=client)

        assert results[0].extraction_method == "trafilatura"
        assert results[0].deep_read_content == traf_content

    @pytest.mark.asyncio
    async def test_entire_batch_failure_falls_back_to_trafilatura(self):
        """If the entire Tavily Extract call fails, fall back to trafilatura for all URLs."""
        client = AsyncMock()
        client.extract = AsyncMock(side_effect=Exception("Tavily Extract API down"))
        sources = [_make_evaluated_source(f"https://example.com/page{i}") for i in range(3)]
        traf_content = "Trafilatura content. " * 20

        with patch("beacon.extract.asyncio.to_thread", new_callable=AsyncMock) as mock_to_thread:
            mock_to_thread.return_value = traf_content
            from beacon.extract import extract_content
            results = await extract_content(sources, client=client)

        for r in results:
            assert r.extraction_method == "trafilatura"

    @pytest.mark.asyncio
    async def test_trafilatura_called_via_to_thread(self):
        """trafilatura must be called via asyncio.to_thread to avoid blocking."""
        client = AsyncMock()
        client.extract = AsyncMock(return_value={
            "results": [],
            "failed_results": [{"url": "https://example.com/page1"}],
        })
        source = _make_evaluated_source("https://example.com/page1")

        with patch("beacon.extract.asyncio.to_thread", new_callable=AsyncMock) as mock_to_thread:
            mock_to_thread.return_value = "Good content. " * 20
            from beacon.extract import extract_content
            await extract_content([source], client=client)
            mock_to_thread.assert_called()


class TestSnippetFallback:
    @pytest.mark.asyncio
    async def test_both_methods_fail_uses_snippet(self):
        """When Tavily and trafilatura both fail, keep original snippet."""
        client = AsyncMock()
        client.extract = AsyncMock(return_value={
            "results": [],
            "failed_results": [{"url": "https://example.com/page1"}],
        })
        source = _make_evaluated_source("https://example.com/page1", snippet="Original snippet text.")

        with patch("beacon.extract.asyncio.to_thread", new_callable=AsyncMock) as mock_to_thread:
            mock_to_thread.return_value = None  # trafilatura also fails
            from beacon.extract import extract_content
            results = await extract_content([source], client=client)

        assert results[0].extraction_method == "snippet_only"
        assert results[0].deep_read_content == "Original snippet text."


class TestContentValidation:
    @pytest.mark.asyncio
    async def test_content_under_200_chars_treated_as_failed(self):
        """Extracted content shorter than 200 characters is treated as failed extraction."""
        client = AsyncMock()
        client.extract = AsyncMock(return_value={
            "results": [{"url": "https://example.com/page1", "raw_content": "Too short."}],
            "failed_results": [],
        })
        source = _make_evaluated_source("https://example.com/page1", snippet="Original snippet.")

        with patch("beacon.extract.asyncio.to_thread", new_callable=AsyncMock) as mock_to_thread:
            mock_to_thread.return_value = None  # trafilatura also fails
            from beacon.extract import extract_content
            results = await extract_content([source], client=client)

        # Should fall through to snippet_only since content was too short
        assert results[0].extraction_method == "snippet_only"

    @pytest.mark.asyncio
    async def test_content_over_8000_chars_is_truncated(self):
        """Extracted content exceeding 8000 characters must be truncated to 8000."""
        client = AsyncMock()
        long_content = "A" * 10000  # 10,000 chars
        client.extract = AsyncMock(return_value={
            "results": [{"url": "https://example.com/page1", "raw_content": long_content}],
            "failed_results": [],
        })
        source = _make_evaluated_source("https://example.com/page1")
        from beacon.extract import extract_content
        results = await extract_content([source], client=client)
        assert len(results[0].deep_read_content) == 8000


class TestConcurrency:
    @pytest.mark.asyncio
    async def test_extraction_respects_semaphore_limit(self):
        """Extraction must respect Semaphore(5) concurrency limit for trafilatura fallbacks."""
        max_concurrent = 0
        current_concurrent = 0
        lock = asyncio.Lock()

        async def tracked_to_thread(func, *args, **kwargs):
            nonlocal max_concurrent, current_concurrent
            async with lock:
                current_concurrent += 1
                if current_concurrent > max_concurrent:
                    max_concurrent = current_concurrent
            await asyncio.sleep(0.01)
            async with lock:
                current_concurrent -= 1
            return "Extracted content. " * 20

        client = AsyncMock()
        client.extract = AsyncMock(side_effect=Exception("Batch failed"))
        sources = [_make_evaluated_source(f"https://example.com/{i}") for i in range(10)]

        with patch("beacon.extract.asyncio.to_thread", side_effect=tracked_to_thread):
            from beacon.extract import extract_content
            await extract_content(sources, client=client)

        assert max_concurrent <= 5


class TestMixedResults:
    @pytest.mark.asyncio
    async def test_mixed_tavily_success_and_failure(self):
        """Some URLs succeed via Tavily, others fall back to trafilatura."""
        client = AsyncMock()
        long_content = "Detailed content. " * 50
        traf_content = "Trafilatura content. " * 20
        client.extract = AsyncMock(return_value={
            "results": [
                {"url": "https://example.com/page1", "raw_content": long_content},
            ],
            "failed_results": [
                {"url": "https://example.com/page2"},
            ],
        })
        sources = [
            _make_evaluated_source("https://example.com/page1"),
            _make_evaluated_source("https://example.com/page2"),
        ]

        with patch("beacon.extract.asyncio.to_thread", new_callable=AsyncMock) as mock_to_thread:
            mock_to_thread.return_value = traf_content
            from beacon.extract import extract_content
            results = await extract_content(sources, client=client)

        assert results[0].extraction_method == "tavily_extract"
        assert results[1].extraction_method == "trafilatura"

    @pytest.mark.asyncio
    async def test_trafilatura_exception_falls_back_to_snippet(self):
        """If trafilatura raises an exception for a URL, fall back to snippet."""
        client = AsyncMock()
        client.extract = AsyncMock(return_value={
            "results": [],
            "failed_results": [{"url": "https://example.com/page1"}],
        })
        source = _make_evaluated_source("https://example.com/page1", snippet="My snippet.")

        with patch("beacon.extract.asyncio.to_thread", new_callable=AsyncMock) as mock_to_thread:
            mock_to_thread.side_effect = Exception("trafilatura crashed")
            from beacon.extract import extract_content
            results = await extract_content([source], client=client)

        assert results[0].extraction_method == "snippet_only"
        assert results[0].deep_read_content == "My snippet."
