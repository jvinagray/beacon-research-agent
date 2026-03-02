diff --git a/01-agent-pipeline/beacon/extract.py b/01-agent-pipeline/beacon/extract.py
new file mode 100644
index 0000000..855fe29
--- /dev/null
+++ b/01-agent-pipeline/beacon/extract.py
@@ -0,0 +1,125 @@
+"""Beacon extract module: content extraction cascade."""
+import asyncio
+
+import trafilatura
+
+from beacon.config import CONTENT_MAX_LENGTH, CONTENT_MIN_LENGTH, EXTRACT_SEMAPHORE_LIMIT
+from beacon.models import EvaluatedSource
+
+
+def _validate_content(
+    content: str | None,
+    min_length: int = CONTENT_MIN_LENGTH,
+    max_length: int = CONTENT_MAX_LENGTH,
+) -> str | None:
+    """Validate and truncate extracted content.
+
+    Returns None if content is None or shorter than min_length.
+    Truncates to max_length if longer.
+    """
+    if content is None or len(content) < min_length:
+        return None
+    return content[:max_length]
+
+
+def _trafilatura_extract(url: str) -> str | None:
+    """Synchronous helper: fetch and extract content with trafilatura."""
+    downloaded = trafilatura.fetch_url(url)
+    if downloaded is None:
+        return None
+    return trafilatura.extract(
+        downloaded,
+        favor_precision=True,
+        output_format="markdown",
+        include_tables=True,
+        include_links=True,
+    )
+
+
+async def extract_content(
+    sources: list[EvaluatedSource],
+    client=None,
+) -> list[EvaluatedSource]:
+    """Extract full page content for a list of evaluated sources.
+
+    Uses a three-tier extraction cascade per source:
+    1. Tavily Extract API (batch call for all URLs)
+    2. trafilatura fallback (for URLs that Tavily failed on)
+    3. Original snippet fallback (if both methods fail)
+    """
+    if not sources:
+        return []
+
+    # Step 1: Try Tavily Extract batch call
+    tavily_results: dict[str, str | None] = {}
+    failed_urls: set[str] = set()
+
+    try:
+        response = await client.extract(
+            urls=[s.url for s in sources],
+        )
+        for item in response.get("results", []):
+            tavily_results[item["url"]] = item.get("raw_content")
+        for item in response.get("failed_results", []):
+            failed_urls.add(item["url"])
+    except Exception:
+        # Entire batch failed — all URLs need fallback
+        failed_urls = {s.url for s in sources}
+
+    # Step 2: Determine which URLs need trafilatura fallback
+    needs_fallback: list[str] = []
+    for source in sources:
+        if source.url in failed_urls:
+            needs_fallback.append(source.url)
+        elif source.url in tavily_results:
+            validated = _validate_content(tavily_results[source.url])
+            if validated is None:
+                needs_fallback.append(source.url)
+        else:
+            needs_fallback.append(source.url)
+
+    # Step 3: Run trafilatura fallbacks in parallel with semaphore
+    semaphore = asyncio.Semaphore(EXTRACT_SEMAPHORE_LIMIT)
+    traf_results: dict[str, str | None] = {}
+
+    async def _fetch_with_trafilatura(url: str) -> tuple[str, str | None]:
+        async with semaphore:
+            content = await asyncio.to_thread(_trafilatura_extract, url)
+            return url, content
+
+    if needs_fallback:
+        tasks = [_fetch_with_trafilatura(url) for url in needs_fallback]
+        results = await asyncio.gather(*tasks)
+        for url, content in results:
+            traf_results[url] = content
+
+    # Step 4: Build output list
+    output: list[EvaluatedSource] = []
+    for source in sources:
+        # Try Tavily first
+        if source.url in tavily_results and source.url not in failed_urls:
+            validated = _validate_content(tavily_results[source.url])
+            if validated is not None:
+                output.append(source.model_copy(update={
+                    "deep_read_content": validated,
+                    "extraction_method": "tavily_extract",
+                }))
+                continue
+
+        # Try trafilatura
+        if source.url in traf_results:
+            validated = _validate_content(traf_results[source.url])
+            if validated is not None:
+                output.append(source.model_copy(update={
+                    "deep_read_content": validated,
+                    "extraction_method": "trafilatura",
+                }))
+                continue
+
+        # Snippet-only fallback
+        output.append(source.model_copy(update={
+            "deep_read_content": source.snippet,
+            "extraction_method": "snippet_only",
+        }))
+
+    return output
diff --git a/01-agent-pipeline/tests/test_extract.py b/01-agent-pipeline/tests/test_extract.py
new file mode 100644
index 0000000..f3dfefb
--- /dev/null
+++ b/01-agent-pipeline/tests/test_extract.py
@@ -0,0 +1,206 @@
+"""Tests for beacon.extract -- write these FIRST."""
+import asyncio
+import pytest
+from unittest.mock import AsyncMock, MagicMock, patch
+from beacon.models import EvaluatedSource, IntelligenceSignals
+
+
+def _make_evaluated_source(url: str, score: int = 8, snippet: str = "Default snippet.") -> EvaluatedSource:
+    """Helper: create an EvaluatedSource for testing."""
+    signals = IntelligenceSignals(
+        learning_efficiency_score=score,
+        content_type="tutorial",
+        time_estimate_minutes=10,
+        recency=None,
+        key_insight="Good source.",
+        coverage=["topic"],
+    )
+    return EvaluatedSource(
+        url=url,
+        title="Test Source",
+        snippet=snippet,
+        signals=signals,
+        deep_read_content=None,
+        extraction_method=None,
+    )
+
+
+@pytest.fixture
+def sources():
+    """Three EvaluatedSource objects for testing extraction."""
+    return [
+        _make_evaluated_source("https://example.com/page1"),
+        _make_evaluated_source("https://example.com/page2"),
+        _make_evaluated_source("https://example.com/page3"),
+    ]
+
+
+class TestTavilyExtractBatch:
+    @pytest.mark.asyncio
+    async def test_sends_all_urls_in_single_batch(self, sources):
+        """extract_content sends all URLs to Tavily Extract in one batch call."""
+        client = AsyncMock()
+        long_content = "# Full Content\n\n" + "Detailed content. " * 50  # > 200 chars
+        client.extract = AsyncMock(return_value={
+            "results": [
+                {"url": "https://example.com/page1", "raw_content": long_content},
+                {"url": "https://example.com/page2", "raw_content": long_content},
+                {"url": "https://example.com/page3", "raw_content": long_content},
+            ],
+            "failed_results": [],
+        })
+        from beacon.extract import extract_content
+        results = await extract_content(sources, client=client)
+        client.extract.assert_called_once()
+
+    @pytest.mark.asyncio
+    async def test_successful_tavily_sets_extraction_method(self, sources):
+        """Successful Tavily Extract sets extraction_method='tavily_extract'."""
+        client = AsyncMock()
+        long_content = "Detailed content. " * 50
+        client.extract = AsyncMock(return_value={
+            "results": [{"url": s.url, "raw_content": long_content} for s in sources],
+            "failed_results": [],
+        })
+        from beacon.extract import extract_content
+        results = await extract_content(sources, client=client)
+        for r in results:
+            assert r.extraction_method == "tavily_extract"
+            assert r.deep_read_content is not None
+
+
+class TestTrafilaturaFallback:
+    @pytest.mark.asyncio
+    async def test_failed_tavily_url_falls_back_to_trafilatura(self):
+        """URLs in Tavily's failed_results fall back to trafilatura."""
+        client = AsyncMock()
+        client.extract = AsyncMock(return_value={
+            "results": [],
+            "failed_results": [{"url": "https://example.com/page1"}],
+        })
+        source = _make_evaluated_source("https://example.com/page1")
+        traf_content = "Trafilatura extracted content. " * 20  # > 200 chars
+
+        with patch("beacon.extract.asyncio.to_thread", new_callable=AsyncMock) as mock_to_thread:
+            mock_to_thread.return_value = traf_content
+            from beacon.extract import extract_content
+            results = await extract_content([source], client=client)
+
+        assert results[0].extraction_method == "trafilatura"
+        assert results[0].deep_read_content == traf_content
+
+    @pytest.mark.asyncio
+    async def test_entire_batch_failure_falls_back_to_trafilatura(self):
+        """If the entire Tavily Extract call fails, fall back to trafilatura for all URLs."""
+        client = AsyncMock()
+        client.extract = AsyncMock(side_effect=Exception("Tavily Extract API down"))
+        sources = [_make_evaluated_source(f"https://example.com/page{i}") for i in range(3)]
+        traf_content = "Trafilatura content. " * 20
+
+        with patch("beacon.extract.asyncio.to_thread", new_callable=AsyncMock) as mock_to_thread:
+            mock_to_thread.return_value = traf_content
+            from beacon.extract import extract_content
+            results = await extract_content(sources, client=client)
+
+        for r in results:
+            assert r.extraction_method == "trafilatura"
+
+    @pytest.mark.asyncio
+    async def test_trafilatura_called_via_to_thread(self):
+        """trafilatura must be called via asyncio.to_thread to avoid blocking."""
+        client = AsyncMock()
+        client.extract = AsyncMock(return_value={
+            "results": [],
+            "failed_results": [{"url": "https://example.com/page1"}],
+        })
+        source = _make_evaluated_source("https://example.com/page1")
+
+        with patch("beacon.extract.asyncio.to_thread", new_callable=AsyncMock) as mock_to_thread:
+            mock_to_thread.return_value = "Good content. " * 20
+            from beacon.extract import extract_content
+            await extract_content([source], client=client)
+            mock_to_thread.assert_called()
+
+
+class TestSnippetFallback:
+    @pytest.mark.asyncio
+    async def test_both_methods_fail_uses_snippet(self):
+        """When Tavily and trafilatura both fail, keep original snippet."""
+        client = AsyncMock()
+        client.extract = AsyncMock(return_value={
+            "results": [],
+            "failed_results": [{"url": "https://example.com/page1"}],
+        })
+        source = _make_evaluated_source("https://example.com/page1", snippet="Original snippet text.")
+
+        with patch("beacon.extract.asyncio.to_thread", new_callable=AsyncMock) as mock_to_thread:
+            mock_to_thread.return_value = None  # trafilatura also fails
+            from beacon.extract import extract_content
+            results = await extract_content([source], client=client)
+
+        assert results[0].extraction_method == "snippet_only"
+        assert results[0].deep_read_content == "Original snippet text."
+
+
+class TestContentValidation:
+    @pytest.mark.asyncio
+    async def test_content_under_200_chars_treated_as_failed(self):
+        """Extracted content shorter than 200 characters is treated as failed extraction."""
+        client = AsyncMock()
+        client.extract = AsyncMock(return_value={
+            "results": [{"url": "https://example.com/page1", "raw_content": "Too short."}],
+            "failed_results": [],
+        })
+        source = _make_evaluated_source("https://example.com/page1", snippet="Original snippet.")
+
+        with patch("beacon.extract.asyncio.to_thread", new_callable=AsyncMock) as mock_to_thread:
+            mock_to_thread.return_value = None  # trafilatura also fails
+            from beacon.extract import extract_content
+            results = await extract_content([source], client=client)
+
+        # Should fall through to snippet_only since content was too short
+        assert results[0].extraction_method == "snippet_only"
+
+    @pytest.mark.asyncio
+    async def test_content_over_8000_chars_is_truncated(self):
+        """Extracted content exceeding 8000 characters must be truncated to 8000."""
+        client = AsyncMock()
+        long_content = "A" * 10000  # 10,000 chars
+        client.extract = AsyncMock(return_value={
+            "results": [{"url": "https://example.com/page1", "raw_content": long_content}],
+            "failed_results": [],
+        })
+        source = _make_evaluated_source("https://example.com/page1")
+        from beacon.extract import extract_content
+        results = await extract_content([source], client=client)
+        assert len(results[0].deep_read_content) == 8000
+
+
+class TestConcurrency:
+    @pytest.mark.asyncio
+    async def test_extraction_respects_semaphore_limit(self):
+        """Extraction must respect Semaphore(5) concurrency limit for trafilatura fallbacks."""
+        max_concurrent = 0
+        current_concurrent = 0
+        lock = asyncio.Lock()
+
+        async def tracked_to_thread(func, *args, **kwargs):
+            nonlocal max_concurrent, current_concurrent
+            async with lock:
+                current_concurrent += 1
+                if current_concurrent > max_concurrent:
+                    max_concurrent = current_concurrent
+            await asyncio.sleep(0.01)
+            async with lock:
+                current_concurrent -= 1
+            return "Extracted content. " * 20
+
+        client = AsyncMock()
+        client.extract = AsyncMock(side_effect=Exception("Batch failed"))
+        sources = [_make_evaluated_source(f"https://example.com/{i}") for i in range(10)]
+
+        with patch("beacon.extract.asyncio.to_thread", side_effect=tracked_to_thread):
+            from beacon.extract import extract_content
+            await extract_content(sources, client=client)
+
+        assert max_concurrent <= 5
