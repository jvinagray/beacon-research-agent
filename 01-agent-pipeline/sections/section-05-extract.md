# Section 05 -- Extract: Content Extraction Cascade

## Overview

This section implements the extraction module (`beacon/extract.py`) that takes the top-N evaluated sources (sorted by learning efficiency score) and retrieves full page content for each. It uses a three-tier cascade: Tavily Extract API first (batch call), trafilatura as fallback for failures, and original snippet as a last resort. Extracted content is validated for minimum length and truncated to a maximum length.

After completing this section you will have:

- `beacon/extract.py` with the `extract_content()` async function and supporting helpers
- `tests/test_extract.py` with full test coverage using mocked Tavily Extract and patched trafilatura
- A robust extraction cascade that always returns content (never fails the pipeline)

## Implementation Notes (Actual)

**Files created:**
- `beacon/extract.py` - Content extraction cascade (logging, per-URL exception safety)
- `tests/test_extract.py` - 11 tests across 6 test classes

**Deviations from plan:**
- Added `logging` module with `logger.warning()` for Tavily batch failures and per-URL trafilatura errors, and `logger.info()` for fallback counts (reviewer recommendation, user approved)
- Added try/except in `_fetch_with_trafilatura` so individual URL failures don't crash `asyncio.gather` (reviewer recommendation, auto-fixed)
- Dropped `test_uses_correct_tavily_params` and `test_trafilatura_called_with_correct_params` since plan hedges on exact Tavily SDK param names
- Added `TestMixedResults` class with 2 tests: mixed Tavily success/failure and trafilatura exception fallback to snippet (reviewer recommendation)
- Did not implement auto-creation of Tavily client when `client=None` (pipeline always passes client)

## Dependencies

- **Section 01 (Foundation)**: `config.py` constants (`EXTRACT_SEMAPHORE_LIMIT`, `CONTENT_MIN_LENGTH`, `CONTENT_MAX_LENGTH`), `conftest.py`
- **Section 02 (Models)**: `EvaluatedSource` from `beacon/models.py`

## Files to Create

```
beacon/
  extract.py          # Content extraction cascade
tests/
  test_extract.py     # Tests for extract.py
```

---

## Tests FIRST: `tests/test_extract.py`

```python
"""Tests for beacon.extract -- write these FIRST."""
import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
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
    async def test_uses_correct_tavily_params(self, sources):
        """Tavily Extract must be called with format='markdown' and extract_depth='basic'."""
        client = AsyncMock()
        long_content = "Detailed content. " * 50
        client.extract = AsyncMock(return_value={
            "results": [{"url": s.url, "raw_content": long_content} for s in sources],
            "failed_results": [],
        })
        from beacon.extract import extract_content
        await extract_content(sources, client=client)
        call_kwargs = client.extract.call_args[1]
        # Check the parameters that were passed
        assert "urls" in call_kwargs or len(client.extract.call_args[0]) > 0

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

        with patch("beacon.extract.trafilatura") as mock_traf:
            mock_traf.extract.return_value = traf_content
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

        with patch("beacon.extract.trafilatura") as mock_traf:
            mock_traf.extract.return_value = traf_content
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

        with patch("beacon.extract.trafilatura") as mock_traf:
            mock_traf.extract.return_value = "Good content. " * 20
            with patch("beacon.extract.asyncio.to_thread", new_callable=AsyncMock) as mock_to_thread:
                mock_to_thread.return_value = "Good content. " * 20
                from beacon.extract import extract_content
                await extract_content([source], client=client)
                mock_to_thread.assert_called()

    @pytest.mark.asyncio
    async def test_trafilatura_called_with_correct_params(self):
        """trafilatura.extract must be called with favor_precision=True, output_format='markdown', include_tables=True, include_links=True."""
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
            # Verify trafilatura.extract was called with correct kwargs
            call_args = mock_to_thread.call_args
            # The kwargs should include favor_precision, output_format, etc.


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

        with patch("beacon.extract.trafilatura") as mock_traf:
            mock_traf.extract.return_value = None  # trafilatura also fails
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

        with patch("beacon.extract.trafilatura") as mock_traf:
            mock_traf.extract.return_value = None  # trafilatura also fails
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
```

---

## Implementation: `beacon/extract.py`

### Function signature

```python
async def extract_content(
    sources: list[EvaluatedSource],
    client: AsyncTavilyClient | None = None,
) -> list[EvaluatedSource]:
    """Extract full page content for a list of evaluated sources.

    Uses a three-tier extraction cascade per source:
    1. Tavily Extract API (batch call for all URLs)
    2. trafilatura fallback (for URLs that Tavily failed on)
    3. Original snippet fallback (if both methods fail)

    Content validation:
    - Content < 200 chars is treated as failed (likely paywall/error page)
    - Content > 8000 chars is truncated to 8000

    Args:
        sources: List of EvaluatedSource objects to extract content for.
        client: Optional AsyncTavilyClient (dependency injection for tests).
                If None, creates one using TAVILY_API_KEY from environment.

    Returns:
        The same list of EvaluatedSource objects, with deep_read_content
        and extraction_method updated on each.
    """
```

### Extraction cascade logic

**Step 1: Tavily Extract batch call**

Send ALL source URLs in a single Tavily Extract API call:
```python
response = await client.extract(
    urls=[s.url for s in sources],
    # Note: check tavily-python docs for exact parameter names
    # The intent is format="markdown" and extract_depth="basic"
)
```

Build a dict mapping `url -> raw_content` from the `results` list. Track which URLs appear in `failed_results`.

**Step 2: Process results and apply fallbacks**

For each source:
1. Check if Tavily returned content for this URL
2. If yes, validate content length (>= 200 chars)
3. If content is valid, set `extraction_method = "tavily_extract"` and `deep_read_content = content` (truncated to 8000 chars)
4. If Tavily failed or content too short, fall back to trafilatura

**Step 3: trafilatura fallback**

For each URL that needs fallback, use trafilatura. Because trafilatura is synchronous, wrap it with `asyncio.to_thread`:

```python
import trafilatura

content = await asyncio.to_thread(
    trafilatura.extract,
    trafilatura.fetch_url(url),  # Also synchronous -- must be in to_thread
    favor_precision=True,
    output_format="markdown",
    include_tables=True,
    include_links=True,
)
```

Actually, both `trafilatura.fetch_url` and `trafilatura.extract` are synchronous. Wrap the entire operation in a single `asyncio.to_thread` call using a helper function:

```python
def _trafilatura_extract(url: str) -> str | None:
    """Synchronous helper: fetch and extract content with trafilatura."""
    downloaded = trafilatura.fetch_url(url)
    if downloaded is None:
        return None
    return trafilatura.extract(
        downloaded,
        favor_precision=True,
        output_format="markdown",
        include_tables=True,
        include_links=True,
    )

# Then in async code:
content = await asyncio.to_thread(_trafilatura_extract, url)
```

Run trafilatura fallbacks in parallel with `asyncio.gather` and `Semaphore(5)`.

**Step 4: Snippet-only fallback**

If both Tavily Extract and trafilatura fail (return None or content < 200 chars), set:
- `extraction_method = "snippet_only"`
- `deep_read_content = source.snippet`

### Content validation helper

```python
def _validate_content(content: str | None, min_length: int = 200, max_length: int = 8000) -> str | None:
    """Validate and truncate extracted content.

    Returns None if content is None or shorter than min_length.
    Truncates to max_length if longer.
    """
    if content is None or len(content) < min_length:
        return None
    return content[:max_length]
```

### Handling the entire batch failure

If the Tavily Extract batch call raises an exception (network error, API down), catch it and fall back to trafilatura for ALL URLs individually. Log the error but do not re-raise.

---

## Verification Steps

```bash
uv run pytest tests/test_extract.py -v
```

All tests should pass. Additionally verify:

1. `from beacon.extract import extract_content` imports cleanly
2. The cascade correctly prioritizes Tavily > trafilatura > snippet
3. Content shorter than 200 chars triggers fallback
4. Content longer than 8000 chars is truncated
5. trafilatura is never called on the event loop directly (always via `asyncio.to_thread`)

---

## Design Decisions

- **Batch Tavily Extract call**: Sending all URLs in one call (up to 20) is more efficient than one-per-source. The API supports batch and it reduces network round trips.
- **trafilatura via asyncio.to_thread**: trafilatura uses its own HTTP internals (not httpx), so it cannot be mocked with respx. It is also synchronous, so wrapping in `to_thread` prevents blocking the event loop. In tests, mock `trafilatura.extract` directly with `unittest.mock.patch`.
- **200-char minimum**: Very short extracted content is likely a paywall login page, cookie consent page, or error page. Treating it as failed extraction and falling through to the next cascade step is safer.
- **8000-char maximum**: Prevents any single massive page from dominating the synthesis prompt context window. trafilatura's `favor_precision=True` already aggressively filters boilerplate, so most pages will be well under this limit.
- **Semaphore(5) for extraction**: Limits concurrent trafilatura calls (which each make an HTTP request) to avoid overwhelming targets or running out of connections.
- **Returning the same list**: The function mutates (or more precisely, creates copies of) the input `EvaluatedSource` objects with updated `deep_read_content` and `extraction_method`. Since Pydantic models are immutable by default, use `source.model_copy(update={...})` to create updated copies.
