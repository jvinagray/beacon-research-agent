"""Tests for beacon.search."""
import pytest
from unittest.mock import AsyncMock
from beacon.models import Source
from beacon.search import normalize_url


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


class TestNormalizeUrl:
    def test_strips_trailing_slash(self):
        assert normalize_url("https://example.com/page/") == "https://example.com/page"

    def test_removes_fragment(self):
        assert normalize_url("https://example.com/page#section") == "https://example.com/page"

    def test_removes_utm_params(self):
        result = normalize_url("https://example.com/page?utm_source=google&utm_medium=cpc")
        assert result == "https://example.com/page"

    def test_combined_normalization(self):
        result = normalize_url("https://example.com/page/?utm_source=x#section")
        assert result == "https://example.com/page"

    def test_preserves_non_utm_params(self):
        result = normalize_url("https://example.com/page?id=42&ref=home")
        assert "id=42" in result
        assert "ref=home" in result


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
