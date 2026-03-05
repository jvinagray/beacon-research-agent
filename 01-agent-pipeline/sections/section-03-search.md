# Section 03 -- Search: Tavily Search Integration

## Overview

This section implements the search module (`beacon/search.py`) that takes a research topic and depth configuration, queries the Tavily Search API, and returns a deduplicated list of `Source` objects. It handles single-query mode (quick/standard depth) and dual-query mode (deep depth) with URL normalization and deduplication.

After completing this section you will have:

- `beacon/search.py` with the `search()` async function
- `tests/test_search.py` with full test coverage using mocked Tavily responses
- URL normalization and deduplication logic for deep-mode multi-query merging

## Dependencies

- **Section 01 (Foundation)**: `pyproject.toml`, `config.py`, `conftest.py`
- **Section 02 (Models)**: `Source` model from `beacon/models.py`

## Files to Create

```
beacon/
  search.py          # Tavily search integration
tests/
  test_search.py     # Tests for search.py
```

---

## Tests FIRST: `tests/test_search.py`

```python
"""Tests for beacon.search -- write these FIRST."""
import pytest
from unittest.mock import AsyncMock, patch
from beacon.models import Source


@pytest.fixture
def mock_tavily():
    """Mock AsyncTavilyClient with configurable search responses."""
    client = AsyncMock()
    client.search = AsyncMock(return_value={
        "results": [
            {"url": "https://example.com/result1", "title": "Result 1", "content": "Snippet 1."},
            {"url": "https://example.com/result2", "title": "Result 2", "content": "Snippet 2."},
            {"url": "https://example.com/result3", "title": "Result 3", "content": "Snippet 3."},
        ]
    })
    return client


class TestSearchReturnsSourceObjects:
    @pytest.mark.asyncio
    async def test_search_returns_list_of_source_objects(self, mock_tavily):
        """search() must return a list of Source model instances."""
        from beacon.search import search
        results = await search("test topic", {"max_results": 10, "num_queries": 1, "deep_read_top_n": 3}, client=mock_tavily)
        assert isinstance(results, list)
        assert all(isinstance(s, Source) for s in results)
        assert len(results) == 3

    @pytest.mark.asyncio
    async def test_search_maps_tavily_fields_correctly(self, mock_tavily):
        """Each Source should have url, title, snippet mapped from Tavily response."""
        from beacon.search import search
        results = await search("test", {"max_results": 10, "num_queries": 1, "deep_read_top_n": 3}, client=mock_tavily)
        assert results[0].url == "https://example.com/result1"
        assert results[0].title == "Result 1"
        assert results[0].snippet == "Snippet 1."


class TestSearchParameters:
    @pytest.mark.asyncio
    async def test_search_passes_correct_params(self, mock_tavily):
        """search() must pass search_depth='basic', topic='general', max_results from config."""
        from beacon.search import search
        await search("AI agents", {"max_results": 10, "num_queries": 1, "deep_read_top_n": 3}, client=mock_tavily)
        mock_tavily.search.assert_called_once()
        call_kwargs = mock_tavily.search.call_args[1]
        assert call_kwargs.get("search_depth") == "basic"
        assert call_kwargs.get("topic") == "general"
        assert call_kwargs.get("max_results") == 10

    @pytest.mark.asyncio
    async def test_search_does_not_include_raw_content(self, mock_tavily):
        """search() must NOT pass include_raw_content to Tavily (that is done in extract stage)."""
        from beacon.search import search
        await search("topic", {"max_results": 10, "num_queries": 1, "deep_read_top_n": 3}, client=mock_tavily)
        call_kwargs = mock_tavily.search.call_args[1]
        assert "include_raw_content" not in call_kwargs or call_kwargs["include_raw_content"] is False


class TestSingleQueryMode:
    @pytest.mark.asyncio
    async def test_quick_depth_makes_one_call(self, mock_tavily):
        """With num_queries=1 (quick/standard), search makes exactly 1 Tavily call."""
        from beacon.search import search
        await search("topic", {"max_results": 10, "num_queries": 1, "deep_read_top_n": 3}, client=mock_tavily)
        assert mock_tavily.search.call_count == 1


class TestDeepModeMultiQuery:
    @pytest.mark.asyncio
    async def test_deep_mode_makes_two_calls(self):
        """With num_queries=2 (deep), search makes exactly 2 Tavily calls."""
        client = AsyncMock()
        client.search = AsyncMock(return_value={
            "results": [
                {"url": "https://example.com/a", "title": "A", "content": "Snippet A."},
            ]
        })
        from beacon.search import search
        await search("topic", {"max_results": 20, "num_queries": 2, "deep_read_top_n": 10}, client=client)
        assert client.search.call_count == 2

    @pytest.mark.asyncio
    async def test_deep_mode_deduplicates_by_normalized_url(self):
        """Duplicate URLs (after normalization) should be removed."""
        client = AsyncMock()
        # First query returns URL with trailing slash
        # Second query returns same URL without trailing slash
        client.search = AsyncMock(side_effect=[
            {"results": [
                {"url": "https://example.com/page/", "title": "Page", "content": "Short."},
            ]},
            {"results": [
                {"url": "https://example.com/page", "title": "Page", "content": "Longer snippet here."},
            ]},
        ])
        from beacon.search import search
        results = await search("topic", {"max_results": 20, "num_queries": 2, "deep_read_top_n": 10}, client=client)
        assert len(results) == 1

    @pytest.mark.asyncio
    async def test_dedup_keeps_longer_snippet(self):
        """When deduplicating, keep the result with the longer snippet."""
        client = AsyncMock()
        client.search = AsyncMock(side_effect=[
            {"results": [
                {"url": "https://example.com/page/", "title": "Page", "content": "Short."},
            ]},
            {"results": [
                {"url": "https://example.com/page", "title": "Page", "content": "This is a much longer snippet with more detail."},
            ]},
        ])
        from beacon.search import search
        results = await search("topic", {"max_results": 20, "num_queries": 2, "deep_read_top_n": 10}, client=client)
        assert results[0].snippet == "This is a much longer snippet with more detail."

    @pytest.mark.asyncio
    async def test_dedup_normalizes_utm_params(self):
        """URL normalization must strip utm_* query parameters."""
        client = AsyncMock()
        client.search = AsyncMock(side_effect=[
            {"results": [
                {"url": "https://example.com/page?utm_source=google&utm_medium=cpc", "title": "Page", "content": "Snippet A."},
            ]},
            {"results": [
                {"url": "https://example.com/page", "title": "Page", "content": "Snippet B, longer version."},
            ]},
        ])
        from beacon.search import search
        results = await search("topic", {"max_results": 20, "num_queries": 2, "deep_read_top_n": 10}, client=client)
        assert len(results) == 1

    @pytest.mark.asyncio
    async def test_dedup_normalizes_fragments(self):
        """URL normalization must remove URL fragments (#...)."""
        client = AsyncMock()
        client.search = AsyncMock(side_effect=[
            {"results": [
                {"url": "https://example.com/page#section1", "title": "Page", "content": "Snippet A."},
            ]},
            {"results": [
                {"url": "https://example.com/page", "title": "Page", "content": "Longer snippet B."},
            ]},
        ])
        from beacon.search import search
        results = await search("topic", {"max_results": 20, "num_queries": 2, "deep_read_top_n": 10}, client=client)
        assert len(results) == 1


class TestEdgeCases:
    @pytest.mark.asyncio
    async def test_empty_results_returns_empty_list(self):
        """When Tavily returns no results, search returns an empty list."""
        client = AsyncMock()
        client.search = AsyncMock(return_value={"results": []})
        from beacon.search import search
        results = await search("obscure topic", {"max_results": 10, "num_queries": 1, "deep_read_top_n": 3}, client=client)
        assert results == []

    @pytest.mark.asyncio
    async def test_tavily_api_failure_raises(self):
        """When Tavily API throws an exception, search should propagate it."""
        client = AsyncMock()
        client.search = AsyncMock(side_effect=Exception("API error"))
        from beacon.search import search
        with pytest.raises(Exception, match="API error"):
            await search("topic", {"max_results": 10, "num_queries": 1, "deep_read_top_n": 3}, client=client)
```

---

## Implementation: `beacon/search.py`

### Function signature

```python
async def search(
    topic: str,
    depth_config: dict,
    client: AsyncTavilyClient | None = None,
) -> list[Source]:
    """Search for sources on a topic using the Tavily Search API.

    Args:
        topic: The research topic to search for.
        depth_config: Dict with keys 'max_results', 'num_queries', 'deep_read_top_n'
                      (from config.get_depth_settings).
        client: Optional pre-configured AsyncTavilyClient (for dependency injection in tests).
                If None, creates one using TAVILY_API_KEY from environment.

    Returns:
        List of Source objects. May be empty if no results found.
        For deep mode (num_queries=2), results are deduplicated by normalized URL.

    Raises:
        Exception: If the Tavily API call fails.
    """
```

### Internal helper: `normalize_url(url: str) -> str`

Normalizes a URL for deduplication comparison:

1. Strip trailing slashes from the path
2. Remove URL fragments (`#...` and everything after)
3. Parse query parameters, remove any starting with `utm_`
4. Reconstruct the URL

Use `urllib.parse.urlparse`, `urllib.parse.parse_qs`, `urllib.parse.urlencode`, `urllib.parse.urlunparse` from the standard library.

### Internal helper: `generate_complementary_query(topic: str) -> str`

For deep mode, generate a second search query that covers different angles. Use a simple heuristic approach (no Claude call needed):

- Append `"best practices tutorial guide"` to the topic
- Or prepend `"how to"` and append the current year
- The exact heuristic is up to the implementer; the key requirement is that the second query uses different keywords to surface different results

### Core logic

1. If `client` is None, instantiate `AsyncTavilyClient` using the Tavily API key from the environment
2. Execute the first search call with parameters: `query=topic`, `search_depth="basic"`, `topic="general"`, `max_results=depth_config["max_results"]`
3. Do NOT pass `include_raw_content` (extraction happens in a separate stage)
4. Convert each result dict to a `Source(url=r["url"], title=r["title"], snippet=r["content"])`
5. If `depth_config["num_queries"] >= 2`:
   - Generate a complementary query
   - Execute a second search call with the same parameters but the new query
   - Merge both result lists
   - Deduplicate by normalized URL, keeping the result with the longer snippet
6. Return the final list of `Source` objects

### Deduplication logic detail

```python
def _deduplicate_sources(sources: list[Source]) -> list[Source]:
    """Deduplicate sources by normalized URL, keeping longest snippet."""
    seen: dict[str, Source] = {}
    for source in sources:
        key = normalize_url(source.url)
        if key not in seen or len(source.snippet) > len(seen[key].snippet):
            seen[key] = source
    return list(seen.values())
```

---

## Verification Steps

```bash
uv run pytest tests/test_search.py -v
```

All tests should pass. Additionally verify:

1. `from beacon.search import search, normalize_url` imports cleanly
2. `normalize_url("https://example.com/page/?utm_source=x#section")` returns `"https://example.com/page"`
3. The mock_tavily fixture from conftest.py is usable in search tests

---

## Design Decisions

- **Heuristic complementary query (not Claude)**: Using a simple string manipulation for the second query is preferred over a Claude API call for speed and cost. The second query just needs different keywords to surface different results.
- **Dependency injection for the client**: The `client` parameter allows tests to pass a mock without patching imports. If None, a real client is created from the environment.
- **`include_raw_content` intentionally omitted**: Raw content extraction is handled by the extract module (Section 05). The search stage only retrieves URLs, titles, and snippets to minimize API cost (1 credit per basic search).
- **Dedup preserves insertion order**: Using a dict preserves the order results were encountered, which keeps the first query's results prioritized.
- **Tavily field mapping**: Tavily returns `content` for the snippet text, which we map to `Source.snippet`. This naming mismatch is intentional -- `snippet` better describes its role in our domain model.

---

## Implementation Notes (Post-Build)

**Deviations from plan:**
- API key loading uses `get_config().tavily_api_key` instead of raw `os.environ` for consistent error handling and `.env` support (code review fix).
- Deep-mode queries run concurrently via `asyncio.gather()` instead of sequentially (code review fix).
- Timeout/retry logic deferred to pipeline orchestrator (section-07) per user decision.

**Tests:** 17 tests total (12 original + 5 direct `normalize_url` unit tests added during code review).

**Files created:**
- `beacon/search.py` (93 lines)
- `tests/test_search.py` (186 lines)
