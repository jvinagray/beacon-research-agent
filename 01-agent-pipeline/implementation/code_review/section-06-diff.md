diff --git a/01-agent-pipeline/beacon/synthesize.py b/01-agent-pipeline/beacon/synthesize.py
new file mode 100644
index 0000000..64c97d4
--- /dev/null
+++ b/01-agent-pipeline/beacon/synthesize.py
@@ -0,0 +1,114 @@
+"""Beacon synthesize module: artifact generation."""
+import asyncio
+import json
+import logging
+from typing import Any
+
+from anthropic import AsyncAnthropic
+
+from beacon.config import SYNTH_MODEL, SYNTH_TIMEOUT
+from beacon.models import EvaluatedSource, Flashcard
+from beacon.prompts import (
+    GENERATE_CONCEPT_MAP_PROMPT,
+    GENERATE_FLASHCARDS_PROMPT,
+    GENERATE_SUMMARY_PROMPT,
+    build_synthesis_context,
+)
+
+logger = logging.getLogger(__name__)
+
+
+async def _generate_summary(context: str, client: AsyncAnthropic) -> str:
+    """Generate executive summary. max_tokens=4096, timeout=SYNTH_TIMEOUT."""
+    prompt = GENERATE_SUMMARY_PROMPT.replace("{context}", context)
+    response = await asyncio.wait_for(
+        client.messages.create(
+            model=SYNTH_MODEL,
+            max_tokens=4096,
+            messages=[{"role": "user", "content": prompt}],
+        ),
+        timeout=SYNTH_TIMEOUT,
+    )
+    return response.content[0].text
+
+
+async def _generate_concept_map(context: str, client: AsyncAnthropic) -> str:
+    """Generate concept map/outline. max_tokens=2048, timeout=SYNTH_TIMEOUT."""
+    prompt = GENERATE_CONCEPT_MAP_PROMPT.replace("{context}", context)
+    response = await asyncio.wait_for(
+        client.messages.create(
+            model=SYNTH_MODEL,
+            max_tokens=2048,
+            messages=[{"role": "user", "content": prompt}],
+        ),
+        timeout=SYNTH_TIMEOUT,
+    )
+    return response.content[0].text
+
+
+async def _generate_flashcards(context: str, client: AsyncAnthropic) -> list[Flashcard]:
+    """Generate flashcards. max_tokens=2048, timeout=SYNTH_TIMEOUT.
+
+    Parses JSON array from Claude response, validates each as Flashcard.
+    """
+    prompt = GENERATE_FLASHCARDS_PROMPT.replace("{context}", context)
+    response = await asyncio.wait_for(
+        client.messages.create(
+            model=SYNTH_MODEL,
+            max_tokens=2048,
+            messages=[{"role": "user", "content": prompt}],
+        ),
+        timeout=SYNTH_TIMEOUT,
+    )
+    text = response.content[0].text
+    try:
+        items = json.loads(text)
+        return [Flashcard(**item) for item in items]
+    except (json.JSONDecodeError, TypeError, ValueError):
+        logger.warning("Failed to parse flashcards JSON, returning empty list")
+        return []
+
+
+async def synthesize(
+    sources: list[EvaluatedSource],
+    topic: str,
+    depth: str,
+    client: AsyncAnthropic | None = None,
+) -> dict[str, Any]:
+    """Generate learning artifacts from evaluated sources.
+
+    Makes 3 parallel Claude Opus calls for summary, concept_map, and flashcards.
+    Assembles a 4th artifact (resources) directly from the source data.
+    """
+    # Build shared context once
+    context = build_synthesis_context(topic, depth, sources)
+
+    # Launch three calls in parallel
+    results = await asyncio.gather(
+        _generate_summary(context, client),
+        _generate_concept_map(context, client),
+        _generate_flashcards(context, client),
+        return_exceptions=True,
+    )
+
+    # Process results, handling exceptions
+    summary = results[0] if not isinstance(results[0], Exception) else None
+    concept_map = results[1] if not isinstance(results[1], Exception) else None
+    flashcards = results[2] if not isinstance(results[2], Exception) else []
+
+    if isinstance(results[0], Exception):
+        logger.warning("Summary generation failed: %s", results[0])
+    if isinstance(results[1], Exception):
+        logger.warning("Concept map generation failed: %s", results[1])
+    if isinstance(results[2], Exception):
+        logger.warning("Flashcards generation failed: %s", results[2])
+
+    # Resources artifact: assembled directly from source data
+    resources = [source.model_dump() for source in sources]
+
+    return {
+        "summary": summary,
+        "concept_map": concept_map,
+        "flashcards": flashcards,
+        "resources": resources,
+    }
diff --git a/01-agent-pipeline/tests/test_synthesize.py b/01-agent-pipeline/tests/test_synthesize.py
new file mode 100644
index 0000000..2a7a8a5
--- /dev/null
+++ b/01-agent-pipeline/tests/test_synthesize.py
@@ -0,0 +1,239 @@
+"""Tests for beacon.synthesize -- write these FIRST."""
+import json
+import pytest
+from unittest.mock import AsyncMock, MagicMock
+from beacon.models import EvaluatedSource, IntelligenceSignals, Flashcard
+
+
+def _make_source(url: str, score: int, has_content: bool = True) -> EvaluatedSource:
+    """Helper: create an EvaluatedSource for testing."""
+    signals = IntelligenceSignals(
+        learning_efficiency_score=score,
+        content_type="tutorial",
+        time_estimate_minutes=10,
+        recency="2025",
+        key_insight=f"Insight for {url}.",
+        coverage=["topic"],
+    )
+    return EvaluatedSource(
+        url=url,
+        title=f"Source at {url}",
+        snippet="Original snippet.",
+        signals=signals,
+        deep_read_content="# Full Content\n\nDetailed article content here. " * 20 if has_content else None,
+        extraction_method="tavily_extract" if has_content else None,
+    )
+
+
+@pytest.fixture
+def sources():
+    """Mix of deep-read and snippet-only sources."""
+    return [
+        _make_source("https://example.com/a", 9, has_content=True),
+        _make_source("https://example.com/b", 7, has_content=True),
+        _make_source("https://example.com/c", 5, has_content=False),
+    ]
+
+
+def _mock_claude_text_response(text: str) -> MagicMock:
+    """Create a mock Claude response with the given text."""
+    response = MagicMock()
+    response.content = [MagicMock()]
+    response.content[0].text = text
+    return response
+
+
+class TestSynthesizeMakesThreeParallelCalls:
+    @pytest.mark.asyncio
+    async def test_three_parallel_claude_calls(self, sources):
+        """synthesize() must make exactly 3 Claude API calls (summary, concept_map, flashcards)."""
+        client = AsyncMock()
+        flashcards_json = json.dumps([
+            {"question": "What is X?", "answer": "X is Y."},
+            {"question": "What is Z?", "answer": "Z is W."},
+        ])
+        client.messages.create = AsyncMock(side_effect=[
+            _mock_claude_text_response("# Executive Summary\n\nSummary content."),
+            _mock_claude_text_response("# Concept Map\n\n- Topic A\n  - Subtopic B"),
+            _mock_claude_text_response(flashcards_json),
+        ])
+        from beacon.synthesize import synthesize
+        result = await synthesize(sources, "test topic", "standard", client=client)
+        assert client.messages.create.call_count == 3
+
+
+class TestModelSelection:
+    @pytest.mark.asyncio
+    async def test_all_calls_use_opus_model(self, sources):
+        """All synthesis calls must use claude-opus-4-6."""
+        client = AsyncMock()
+        flashcards_json = json.dumps([{"question": "Q", "answer": "A"}])
+        client.messages.create = AsyncMock(side_effect=[
+            _mock_claude_text_response("Summary"),
+            _mock_claude_text_response("Concept map"),
+            _mock_claude_text_response(flashcards_json),
+        ])
+        from beacon.synthesize import synthesize
+        await synthesize(sources, "test topic", "standard", client=client)
+        for c in client.messages.create.call_args_list:
+            assert c[1]["model"] == "claude-opus-4-6"
+
+
+class TestMaxTokens:
+    @pytest.mark.asyncio
+    async def test_summary_max_tokens_4096(self, sources):
+        """Summary call must set max_tokens=4096."""
+        client = AsyncMock()
+        flashcards_json = json.dumps([{"question": "Q", "answer": "A"}])
+        client.messages.create = AsyncMock(side_effect=[
+            _mock_claude_text_response("Summary"),
+            _mock_claude_text_response("Concept map"),
+            _mock_claude_text_response(flashcards_json),
+        ])
+        from beacon.synthesize import synthesize
+        await synthesize(sources, "test topic", "standard", client=client)
+        summary_call = client.messages.create.call_args_list[0]
+        assert summary_call[1]["max_tokens"] == 4096
+
+    @pytest.mark.asyncio
+    async def test_concept_map_max_tokens_2048(self, sources):
+        """Concept map call must set max_tokens=2048."""
+        client = AsyncMock()
+        flashcards_json = json.dumps([{"question": "Q", "answer": "A"}])
+        client.messages.create = AsyncMock(side_effect=[
+            _mock_claude_text_response("Summary"),
+            _mock_claude_text_response("Concept map"),
+            _mock_claude_text_response(flashcards_json),
+        ])
+        from beacon.synthesize import synthesize
+        await synthesize(sources, "test topic", "standard", client=client)
+        concept_call = client.messages.create.call_args_list[1]
+        assert concept_call[1]["max_tokens"] == 2048
+
+    @pytest.mark.asyncio
+    async def test_flashcards_max_tokens_2048(self, sources):
+        """Flashcards call must set max_tokens=2048."""
+        client = AsyncMock()
+        flashcards_json = json.dumps([{"question": "Q", "answer": "A"}])
+        client.messages.create = AsyncMock(side_effect=[
+            _mock_claude_text_response("Summary"),
+            _mock_claude_text_response("Concept map"),
+            _mock_claude_text_response(flashcards_json),
+        ])
+        from beacon.synthesize import synthesize
+        await synthesize(sources, "test topic", "standard", client=client)
+        fc_call = client.messages.create.call_args_list[2]
+        assert fc_call[1]["max_tokens"] == 2048
+
+
+class TestArtifactOutputs:
+    @pytest.mark.asyncio
+    async def test_summary_returns_markdown_string(self, sources):
+        """Summary artifact must be a markdown string."""
+        client = AsyncMock()
+        flashcards_json = json.dumps([{"question": "Q", "answer": "A"}])
+        client.messages.create = AsyncMock(side_effect=[
+            _mock_claude_text_response("# Executive Summary\n\nKey findings..."),
+            _mock_claude_text_response("# Concept Map"),
+            _mock_claude_text_response(flashcards_json),
+        ])
+        from beacon.synthesize import synthesize
+        result = await synthesize(sources, "topic", "standard", client=client)
+        assert isinstance(result["summary"], str)
+        assert "Executive Summary" in result["summary"]
+
+    @pytest.mark.asyncio
+    async def test_concept_map_returns_markdown_string(self, sources):
+        """Concept map artifact must be a markdown string."""
+        client = AsyncMock()
+        flashcards_json = json.dumps([{"question": "Q", "answer": "A"}])
+        client.messages.create = AsyncMock(side_effect=[
+            _mock_claude_text_response("Summary"),
+            _mock_claude_text_response("# Concept Map\n\n- Topic\n  - Subtopic"),
+            _mock_claude_text_response(flashcards_json),
+        ])
+        from beacon.synthesize import synthesize
+        result = await synthesize(sources, "topic", "standard", client=client)
+        assert isinstance(result["concept_map"], str)
+
+    @pytest.mark.asyncio
+    async def test_flashcards_returns_list_of_flashcard_objects(self, sources):
+        """Flashcards artifact must be a list of Flashcard objects."""
+        client = AsyncMock()
+        flashcards_json = json.dumps([
+            {"question": "What is X?", "answer": "X is Y."},
+            {"question": "What is Z?", "answer": "Z is W."},
+        ])
+        client.messages.create = AsyncMock(side_effect=[
+            _mock_claude_text_response("Summary"),
+            _mock_claude_text_response("Concept map"),
+            _mock_claude_text_response(flashcards_json),
+        ])
+        from beacon.synthesize import synthesize
+        result = await synthesize(sources, "topic", "standard", client=client)
+        assert isinstance(result["flashcards"], list)
+        assert all(isinstance(fc, Flashcard) for fc in result["flashcards"])
+        assert len(result["flashcards"]) == 2
+
+
+class TestResourcesArtifact:
+    @pytest.mark.asyncio
+    async def test_resources_assembled_without_claude_call(self, sources):
+        """Resources artifact is built from source data, no Claude call needed."""
+        client = AsyncMock()
+        flashcards_json = json.dumps([{"question": "Q", "answer": "A"}])
+        client.messages.create = AsyncMock(side_effect=[
+            _mock_claude_text_response("Summary"),
+            _mock_claude_text_response("Concept map"),
+            _mock_claude_text_response(flashcards_json),
+        ])
+        from beacon.synthesize import synthesize
+        result = await synthesize(sources, "topic", "standard", client=client)
+        assert "resources" in result
+        assert client.messages.create.call_count == 3
+
+    @pytest.mark.asyncio
+    async def test_resources_contains_all_sources_with_signals(self, sources):
+        """Resources artifact must include all sources with their IntelligenceSignals."""
+        client = AsyncMock()
+        flashcards_json = json.dumps([{"question": "Q", "answer": "A"}])
+        client.messages.create = AsyncMock(side_effect=[
+            _mock_claude_text_response("Summary"),
+            _mock_claude_text_response("Concept map"),
+            _mock_claude_text_response(flashcards_json),
+        ])
+        from beacon.synthesize import synthesize
+        result = await synthesize(sources, "topic", "standard", client=client)
+        resources = result["resources"]
+        assert isinstance(resources, list)
+        assert len(resources) == len(sources)
+
+
+class TestSynthesisContextBlock:
+    @pytest.mark.asyncio
+    async def test_context_includes_deep_read_and_snippet_sources(self, sources):
+        """The shared context block must include deep-read content and snippet-only sources."""
+        from beacon.prompts import build_synthesis_context
+        context = build_synthesis_context("test topic", "standard", sources)
+        assert "Full Content" in context
+        assert "snippet" in context.lower()
+        for s in sources:
+            assert s.url in context
+
+
+class TestPartialFailure:
+    @pytest.mark.asyncio
+    async def test_one_artifact_failure_does_not_block_others(self, sources):
+        """If one synthesis call fails, the other artifacts should still be returned."""
+        client = AsyncMock()
+        flashcards_json = json.dumps([{"question": "Q", "answer": "A"}])
+        client.messages.create = AsyncMock(side_effect=[
+            Exception("Summary generation failed"),
+            _mock_claude_text_response("# Concept Map\n\nContent."),
+            _mock_claude_text_response(flashcards_json),
+        ])
+        from beacon.synthesize import synthesize
+        result = await synthesize(sources, "topic", "standard", client=client)
+        assert result.get("concept_map") is not None
+        assert result.get("flashcards") is not None
+        assert result.get("summary") is None
