diff --git a/01-agent-pipeline/beacon/pipeline.py b/01-agent-pipeline/beacon/pipeline.py
new file mode 100644
index 0000000..4e5c717
--- /dev/null
+++ b/01-agent-pipeline/beacon/pipeline.py
@@ -0,0 +1,201 @@
+"""Beacon pipeline: main orchestrator tying all modules together."""
+import asyncio
+import json
+import logging
+import uuid
+from collections.abc import AsyncGenerator
+from datetime import datetime, timezone
+
+from beacon.config import get_config, get_depth_settings
+from beacon.evaluate import evaluate_sources
+from beacon.extract import extract_content
+from beacon.models import (
+    ArtifactEvent,
+    CompleteEvent,
+    ErrorEvent,
+    EvaluatedSource,
+    Flashcard,
+    PipelineEvent,
+    ResearchResult,
+    SourceEvaluatedEvent,
+    SourcesFoundEvent,
+    StatusEvent,
+)
+from beacon.search import search
+from beacon.synthesize import synthesize
+
+logger = logging.getLogger("beacon.pipeline")
+
+
+async def run_research(
+    topic: str,
+    depth: str,
+) -> AsyncGenerator[PipelineEvent, None]:
+    """Main pipeline entry point. Yields events as research progresses.
+
+    This is an async generator that orchestrates the full research pipeline:
+    1. Search for sources
+    2. Evaluate each source with Claude
+    3. Extract full content from top sources
+    4. Synthesize learning artifacts
+
+    Yields real-time progress events for SSE consumption.
+
+    Args:
+        topic: The research topic to investigate.
+        depth: One of 'quick', 'standard', 'deep'.
+
+    Yields:
+        PipelineEvent objects: StatusEvent, SourcesFoundEvent,
+        SourceEvaluatedEvent, ArtifactEvent, ErrorEvent, CompleteEvent.
+    """
+    session_id = str(uuid.uuid4())
+    timestamp = datetime.now(timezone.utc).isoformat()
+    tasks: list[asyncio.Task] = []
+
+    try:
+        # --- Validate inputs and load config ---
+        try:
+            get_config()
+            depth_config = get_depth_settings(depth)
+        except (ValueError, Exception) as e:
+            logger.error("[%s] Config/depth validation failed: %s", session_id, e)
+            yield ErrorEvent(message=str(e), recoverable=False)
+            return
+
+        # --- SEARCH STAGE ---
+        yield StatusEvent(message="Searching for sources...")
+        try:
+            sources = await search(topic, depth_config)
+        except Exception as e:
+            logger.error("[%s] Search failed: %s", session_id, e)
+            yield ErrorEvent(message=f"Search failed: {e}", recoverable=False)
+            return
+
+        yield SourcesFoundEvent(count=len(sources), sources=sources)
+
+        if not sources:
+            yield ErrorEvent(
+                message="No sources found for this topic.", recoverable=False
+            )
+            yield CompleteEvent(
+                session_id=session_id,
+                result=ResearchResult(
+                    topic=topic,
+                    depth=depth,
+                    sources=[],
+                    artifacts={},
+                    session_id=session_id,
+                    timestamp=timestamp,
+                ),
+            )
+            return
+
+        # --- EVALUATE STAGE ---
+        yield StatusEvent(message="Evaluating sources...")
+
+        queue: asyncio.Queue[EvaluatedSource] = asyncio.Queue()
+        eval_task = asyncio.create_task(
+            evaluate_sources(sources, topic, queue=queue)
+        )
+        tasks.append(eval_task)
+
+        # Yield to event loop so the task can start executing
+        await asyncio.sleep(0)
+
+        completed = 0
+        total = len(sources)
+        while completed < total:
+            # If the task already finished, drain remaining queue items without blocking
+            if eval_task.done():
+                try:
+                    evaluated_source = queue.get_nowait()
+                except asyncio.QueueEmpty:
+                    break
+            else:
+                try:
+                    evaluated_source = await asyncio.wait_for(queue.get(), timeout=60)
+                except asyncio.TimeoutError:
+                    break
+            completed += 1
+            yield SourceEvaluatedEvent(
+                index=completed,
+                total=total,
+                source=evaluated_source,
+            )
+
+        evaluated_sources = await eval_task
+        tasks.remove(eval_task)
+
+        # Select top N for deep-read
+        top_n = depth_config.get("deep_read_top_n", 3)
+        top_sources = evaluated_sources[:top_n]
+
+        # --- EXTRACT STAGE ---
+        yield StatusEvent(message="Reading top sources...")
+        try:
+            extracted_sources = await extract_content(top_sources)
+        except Exception as e:
+            logger.error("[%s] Extraction failed: %s", session_id, e)
+            yield ErrorEvent(
+                message=f"Content extraction failed: {e}", recoverable=True
+            )
+            extracted_sources = top_sources
+
+        # Merge extracted content back into the full evaluated list
+        extracted_by_url = {s.url: s for s in extracted_sources}
+        all_sources = []
+        for s in evaluated_sources:
+            if s.url in extracted_by_url:
+                all_sources.append(extracted_by_url[s.url])
+            else:
+                all_sources.append(s)
+
+        # --- SYNTHESIZE STAGE ---
+        yield StatusEvent(message="Generating learning artifacts...")
+        try:
+            artifacts = await synthesize(all_sources, topic, depth)
+        except Exception as e:
+            logger.error("[%s] Synthesis failed: %s", session_id, e)
+            yield ErrorEvent(
+                message=f"Synthesis failed: {e}", recoverable=True
+            )
+            artifacts = {}
+
+        # Yield individual artifact events
+        for artifact_type, data in artifacts.items():
+            if data is not None:
+                # Serialize non-string/non-Flashcard data (e.g. resources) to JSON
+                if isinstance(data, str) or (
+                    isinstance(data, list)
+                    and all(isinstance(item, Flashcard) for item in data)
+                ):
+                    event_data = data
+                else:
+                    event_data = json.dumps(data, default=str)
+                yield ArtifactEvent(artifact_type=artifact_type, data=event_data)
+
+        # --- COMPLETE ---
+        yield CompleteEvent(
+            session_id=session_id,
+            result=ResearchResult(
+                topic=topic,
+                depth=depth,
+                sources=all_sources,
+                artifacts=artifacts,
+                session_id=session_id,
+                timestamp=timestamp,
+            ),
+        )
+
+    except GeneratorExit:
+        pass
+    finally:
+        for task in tasks:
+            if not task.done():
+                task.cancel()
+        for task in tasks:
+            try:
+                await task
+            except (asyncio.CancelledError, Exception):
+                pass
diff --git a/01-agent-pipeline/tests/test_pipeline.py b/01-agent-pipeline/tests/test_pipeline.py
new file mode 100644
index 0000000..8814091
--- /dev/null
+++ b/01-agent-pipeline/tests/test_pipeline.py
@@ -0,0 +1,364 @@
+"""Tests for beacon.pipeline -- write these FIRST."""
+import asyncio
+import json
+import uuid
+from datetime import datetime
+import pytest
+from unittest.mock import AsyncMock, MagicMock, patch
+from beacon.models import (
+    Source, EvaluatedSource, IntelligenceSignals, Flashcard,
+    StatusEvent, SourcesFoundEvent, SourceEvaluatedEvent,
+    ArtifactEvent, ErrorEvent, CompleteEvent, ResearchResult,
+)
+
+
+def _make_sources(n: int = 3) -> list[Source]:
+    return [
+        Source(url=f"https://example.com/{i}", title=f"Source {i}", snippet=f"Snippet {i}")
+        for i in range(n)
+    ]
+
+
+def _make_evaluated_sources(n: int = 3) -> list[EvaluatedSource]:
+    sources = []
+    for i in range(n):
+        signals = IntelligenceSignals(
+            learning_efficiency_score=10 - i,
+            content_type="tutorial",
+            time_estimate_minutes=10,
+            recency="2025",
+            key_insight=f"Insight {i}.",
+            coverage=["topic"],
+        )
+        sources.append(EvaluatedSource(
+            url=f"https://example.com/{i}",
+            title=f"Source {i}",
+            snippet=f"Snippet {i}",
+            signals=signals,
+            deep_read_content=f"# Content {i}\n\nFull content here.",
+            extraction_method="tavily_extract",
+        ))
+    return sources
+
+
+def _make_artifacts():
+    return {
+        "summary": "# Summary\n\nKey findings.",
+        "concept_map": "# Concept Map\n\n- Topic A\n  - Subtopic B",
+        "flashcards": [Flashcard(question="Q1?", answer="A1.")],
+        "resources": [{"url": "https://example.com/0", "title": "Source 0"}],
+    }
+
+
+async def _collect_events(gen) -> list:
+    """Helper: collect all events from an async generator."""
+    events = []
+    async for event in gen:
+        events.append(event)
+    return events
+
+
+class TestRunResearchIsAsyncGenerator:
+    @pytest.mark.asyncio
+    async def test_is_async_generator(self):
+        """run_research must be an async generator yielding PipelineEvent types."""
+        with patch("beacon.pipeline.search", new_callable=AsyncMock) as mock_search, \
+             patch("beacon.pipeline.evaluate_sources", new_callable=AsyncMock) as mock_eval, \
+             patch("beacon.pipeline.extract_content", new_callable=AsyncMock) as mock_extract, \
+             patch("beacon.pipeline.synthesize", new_callable=AsyncMock) as mock_synth, \
+             patch("beacon.pipeline.get_config"), \
+             patch("beacon.pipeline.get_depth_settings") as mock_depth:
+
+            mock_depth.return_value = {"max_results": 10, "num_queries": 1, "deep_read_top_n": 3}
+            mock_search.return_value = _make_sources()
+            mock_eval.return_value = _make_evaluated_sources()
+            mock_extract.return_value = _make_evaluated_sources()
+            mock_synth.return_value = _make_artifacts()
+
+            from beacon.pipeline import run_research
+            gen = run_research("test topic", "quick")
+            # It should be an async generator
+            assert hasattr(gen, "__aiter__")
+            assert hasattr(gen, "__anext__")
+            events = await _collect_events(gen)
+            assert len(events) > 0
+
+
+class TestSessionMetadata:
+    @pytest.mark.asyncio
+    async def test_generates_uuid4_session_id(self):
+        """run_research must generate a valid UUID4 session_id."""
+        with patch("beacon.pipeline.search", new_callable=AsyncMock) as mock_search, \
+             patch("beacon.pipeline.evaluate_sources", new_callable=AsyncMock) as mock_eval, \
+             patch("beacon.pipeline.extract_content", new_callable=AsyncMock) as mock_extract, \
+             patch("beacon.pipeline.synthesize", new_callable=AsyncMock) as mock_synth, \
+             patch("beacon.pipeline.get_config"), \
+             patch("beacon.pipeline.get_depth_settings") as mock_depth:
+
+            mock_depth.return_value = {"max_results": 10, "num_queries": 1, "deep_read_top_n": 3}
+            mock_search.return_value = _make_sources()
+            mock_eval.return_value = _make_evaluated_sources()
+            mock_extract.return_value = _make_evaluated_sources()
+            mock_synth.return_value = _make_artifacts()
+
+            from beacon.pipeline import run_research
+            events = await _collect_events(run_research("topic", "quick"))
+            complete_events = [e for e in events if isinstance(e, CompleteEvent)]
+            assert len(complete_events) == 1
+            session_id = complete_events[0].session_id
+            # Validate it's a valid UUID
+            parsed = uuid.UUID(session_id, version=4)
+            assert str(parsed) == session_id
+
+    @pytest.mark.asyncio
+    async def test_generates_iso8601_timestamp(self):
+        """run_research must generate a timestamp in ISO 8601 format."""
+        with patch("beacon.pipeline.search", new_callable=AsyncMock) as mock_search, \
+             patch("beacon.pipeline.evaluate_sources", new_callable=AsyncMock) as mock_eval, \
+             patch("beacon.pipeline.extract_content", new_callable=AsyncMock) as mock_extract, \
+             patch("beacon.pipeline.synthesize", new_callable=AsyncMock) as mock_synth, \
+             patch("beacon.pipeline.get_config"), \
+             patch("beacon.pipeline.get_depth_settings") as mock_depth:
+
+            mock_depth.return_value = {"max_results": 10, "num_queries": 1, "deep_read_top_n": 3}
+            mock_search.return_value = _make_sources()
+            mock_eval.return_value = _make_evaluated_sources()
+            mock_extract.return_value = _make_evaluated_sources()
+            mock_synth.return_value = _make_artifacts()
+
+            from beacon.pipeline import run_research
+            events = await _collect_events(run_research("topic", "quick"))
+            complete_events = [e for e in events if isinstance(e, CompleteEvent)]
+            timestamp = complete_events[0].result.timestamp
+            # Should not throw
+            datetime.fromisoformat(timestamp)
+
+
+class TestEventSequence:
+    @pytest.mark.asyncio
+    async def test_yields_status_before_each_stage(self):
+        """Pipeline must yield StatusEvent before search, evaluate, extract, and synthesize."""
+        with patch("beacon.pipeline.search", new_callable=AsyncMock) as mock_search, \
+             patch("beacon.pipeline.evaluate_sources", new_callable=AsyncMock) as mock_eval, \
+             patch("beacon.pipeline.extract_content", new_callable=AsyncMock) as mock_extract, \
+             patch("beacon.pipeline.synthesize", new_callable=AsyncMock) as mock_synth, \
+             patch("beacon.pipeline.get_config"), \
+             patch("beacon.pipeline.get_depth_settings") as mock_depth:
+
+            mock_depth.return_value = {"max_results": 10, "num_queries": 1, "deep_read_top_n": 3}
+            mock_search.return_value = _make_sources()
+            mock_eval.return_value = _make_evaluated_sources()
+            mock_extract.return_value = _make_evaluated_sources()
+            mock_synth.return_value = _make_artifacts()
+
+            from beacon.pipeline import run_research
+            events = await _collect_events(run_research("topic", "quick"))
+            status_events = [e for e in events if isinstance(e, StatusEvent)]
+            # At minimum 4 status events: searching, evaluating, extracting, synthesizing
+            assert len(status_events) >= 4
+
+    @pytest.mark.asyncio
+    async def test_yields_sources_found_after_search(self):
+        """Pipeline must yield SourcesFoundEvent after the search stage."""
+        with patch("beacon.pipeline.search", new_callable=AsyncMock) as mock_search, \
+             patch("beacon.pipeline.evaluate_sources", new_callable=AsyncMock) as mock_eval, \
+             patch("beacon.pipeline.extract_content", new_callable=AsyncMock) as mock_extract, \
+             patch("beacon.pipeline.synthesize", new_callable=AsyncMock) as mock_synth, \
+             patch("beacon.pipeline.get_config"), \
+             patch("beacon.pipeline.get_depth_settings") as mock_depth:
+
+            mock_depth.return_value = {"max_results": 10, "num_queries": 1, "deep_read_top_n": 3}
+            mock_search.return_value = _make_sources(5)
+            mock_eval.return_value = _make_evaluated_sources(5)
+            mock_extract.return_value = _make_evaluated_sources(5)
+            mock_synth.return_value = _make_artifacts()
+
+            from beacon.pipeline import run_research
+            events = await _collect_events(run_research("topic", "quick"))
+            found_events = [e for e in events if isinstance(e, SourcesFoundEvent)]
+            assert len(found_events) == 1
+            assert found_events[0].count == 5
+
+    @pytest.mark.asyncio
+    async def test_yields_artifact_events(self):
+        """Pipeline must yield ArtifactEvent for summary, concept_map, flashcards, resources."""
+        with patch("beacon.pipeline.search", new_callable=AsyncMock) as mock_search, \
+             patch("beacon.pipeline.evaluate_sources", new_callable=AsyncMock) as mock_eval, \
+             patch("beacon.pipeline.extract_content", new_callable=AsyncMock) as mock_extract, \
+             patch("beacon.pipeline.synthesize", new_callable=AsyncMock) as mock_synth, \
+             patch("beacon.pipeline.get_config"), \
+             patch("beacon.pipeline.get_depth_settings") as mock_depth:
+
+            mock_depth.return_value = {"max_results": 10, "num_queries": 1, "deep_read_top_n": 3}
+            mock_search.return_value = _make_sources()
+            mock_eval.return_value = _make_evaluated_sources()
+            mock_extract.return_value = _make_evaluated_sources()
+            mock_synth.return_value = _make_artifacts()
+
+            from beacon.pipeline import run_research
+            events = await _collect_events(run_research("topic", "quick"))
+            artifact_events = [e for e in events if isinstance(e, ArtifactEvent)]
+            artifact_types = {e.artifact_type for e in artifact_events}
+            assert "summary" in artifact_types
+            assert "concept_map" in artifact_types
+            assert "flashcards" in artifact_types
+            assert "resources" in artifact_types
+
+    @pytest.mark.asyncio
+    async def test_yields_complete_event_at_end(self):
+        """Pipeline must yield CompleteEvent with full ResearchResult at the end."""
+        with patch("beacon.pipeline.search", new_callable=AsyncMock) as mock_search, \
+             patch("beacon.pipeline.evaluate_sources", new_callable=AsyncMock) as mock_eval, \
+             patch("beacon.pipeline.extract_content", new_callable=AsyncMock) as mock_extract, \
+             patch("beacon.pipeline.synthesize", new_callable=AsyncMock) as mock_synth, \
+             patch("beacon.pipeline.get_config"), \
+             patch("beacon.pipeline.get_depth_settings") as mock_depth:
+
+            mock_depth.return_value = {"max_results": 10, "num_queries": 1, "deep_read_top_n": 3}
+            mock_search.return_value = _make_sources()
+            mock_eval.return_value = _make_evaluated_sources()
+            mock_extract.return_value = _make_evaluated_sources()
+            mock_synth.return_value = _make_artifacts()
+
+            from beacon.pipeline import run_research
+            events = await _collect_events(run_research("topic", "quick"))
+            complete_events = [e for e in events if isinstance(e, CompleteEvent)]
+            assert len(complete_events) == 1
+            result = complete_events[0].result
+            assert isinstance(result, ResearchResult)
+            assert result.topic == "topic"
+            assert result.depth == "quick"
+
+
+class TestErrorHandling:
+    @pytest.mark.asyncio
+    async def test_recoverable_error_continues_pipeline(self):
+        """Non-fatal errors should yield ErrorEvent(recoverable=True) and continue."""
+        with patch("beacon.pipeline.search", new_callable=AsyncMock) as mock_search, \
+             patch("beacon.pipeline.evaluate_sources", new_callable=AsyncMock) as mock_eval, \
+             patch("beacon.pipeline.extract_content", new_callable=AsyncMock) as mock_extract, \
+             patch("beacon.pipeline.synthesize", new_callable=AsyncMock) as mock_synth, \
+             patch("beacon.pipeline.get_config"), \
+             patch("beacon.pipeline.get_depth_settings") as mock_depth:
+
+            mock_depth.return_value = {"max_results": 10, "num_queries": 1, "deep_read_top_n": 3}
+            mock_search.return_value = _make_sources()
+            mock_eval.return_value = _make_evaluated_sources()
+            # Extract fails but is non-fatal
+            mock_extract.side_effect = Exception("Extraction error")
+            mock_synth.return_value = _make_artifacts()
+
+            from beacon.pipeline import run_research
+            events = await _collect_events(run_research("topic", "quick"))
+            error_events = [e for e in events if isinstance(e, ErrorEvent)]
+            # Should have at least one recoverable error
+            assert any(e.recoverable for e in error_events)
+            # Pipeline should still complete (may have partial results)
+            complete_events = [e for e in events if isinstance(e, CompleteEvent)]
+            assert len(complete_events) == 1
+
+    @pytest.mark.asyncio
+    async def test_fatal_error_no_search_results(self):
+        """If search returns no results, yield ErrorEvent(recoverable=False)."""
+        with patch("beacon.pipeline.search", new_callable=AsyncMock) as mock_search, \
+             patch("beacon.pipeline.evaluate_sources", new_callable=AsyncMock) as mock_eval, \
+             patch("beacon.pipeline.extract_content", new_callable=AsyncMock) as mock_extract, \
+             patch("beacon.pipeline.synthesize", new_callable=AsyncMock) as mock_synth, \
+             patch("beacon.pipeline.get_config"), \
+             patch("beacon.pipeline.get_depth_settings") as mock_depth:
+
+            mock_depth.return_value = {"max_results": 10, "num_queries": 1, "deep_read_top_n": 3}
+            mock_search.return_value = []  # No results
+
+            from beacon.pipeline import run_research
+            events = await _collect_events(run_research("topic", "quick"))
+            error_events = [e for e in events if isinstance(e, ErrorEvent)]
+            assert any(not e.recoverable for e in error_events)
+
+    @pytest.mark.asyncio
+    async def test_invalid_depth_yields_error(self):
+        """An invalid depth value should yield an ErrorEvent."""
+        with patch("beacon.pipeline.get_config"), \
+             patch("beacon.pipeline.get_depth_settings", side_effect=ValueError("Invalid depth")):
+
+            from beacon.pipeline import run_research
+            events = await _collect_events(run_research("topic", "ultra"))
+            error_events = [e for e in events if isinstance(e, ErrorEvent)]
+            assert len(error_events) >= 1
+
+
+class TestTaskCancellation:
+    @pytest.mark.asyncio
+    async def test_cancels_tasks_on_generator_close(self):
+        """When the generator is closed, in-flight tasks must be cancelled."""
+        with patch("beacon.pipeline.search", new_callable=AsyncMock) as mock_search, \
+             patch("beacon.pipeline.evaluate_sources", new_callable=AsyncMock) as mock_eval, \
+             patch("beacon.pipeline.extract_content", new_callable=AsyncMock) as mock_extract, \
+             patch("beacon.pipeline.synthesize", new_callable=AsyncMock) as mock_synth, \
+             patch("beacon.pipeline.get_config"), \
+             patch("beacon.pipeline.get_depth_settings") as mock_depth:
+
+            mock_depth.return_value = {"max_results": 10, "num_queries": 1, "deep_read_top_n": 3}
+            mock_search.return_value = _make_sources()
+
+            # Make evaluate_sources hang so we can close the generator mid-pipeline
+            async def slow_evaluate(*args, **kwargs):
+                await asyncio.sleep(10)
+                return _make_evaluated_sources()
+
+            mock_eval.side_effect = slow_evaluate
+
+            from beacon.pipeline import run_research
+            gen = run_research("topic", "quick")
+
+            # Collect a few events then close
+            events = []
+            async for event in gen:
+                events.append(event)
+                if isinstance(event, SourcesFoundEvent):
+                    break  # Close after search completes
+
+            await gen.aclose()
+            # The slow evaluate should have been cancelled, not hanging
+
+
+class TestFullIntegration:
+    @pytest.mark.asyncio
+    async def test_full_pipeline_produces_complete_event_stream(self):
+        """Full integration test: all mocked deps, verify complete event stream."""
+        with patch("beacon.pipeline.search", new_callable=AsyncMock) as mock_search, \
+             patch("beacon.pipeline.evaluate_sources", new_callable=AsyncMock) as mock_eval, \
+             patch("beacon.pipeline.extract_content", new_callable=AsyncMock) as mock_extract, \
+             patch("beacon.pipeline.synthesize", new_callable=AsyncMock) as mock_synth, \
+             patch("beacon.pipeline.get_config"), \
+             patch("beacon.pipeline.get_depth_settings") as mock_depth:
+
+            mock_depth.return_value = {"max_results": 10, "num_queries": 1, "deep_read_top_n": 3}
+            mock_search.return_value = _make_sources(5)
+            mock_eval.return_value = _make_evaluated_sources(5)
+            mock_extract.return_value = _make_evaluated_sources(5)
+            mock_synth.return_value = _make_artifacts()
+
+            from beacon.pipeline import run_research
+            events = await _collect_events(run_research("agentic RAG patterns", "standard"))
+
+            # Verify event type sequence
+            event_types = [type(e).__name__ for e in events]
+
+            # Must start with StatusEvent
+            assert event_types[0] == "StatusEvent"
+
+            # Must contain at least one of each expected type
+            assert "SourcesFoundEvent" in event_types
+            assert "ArtifactEvent" in event_types
+            assert "CompleteEvent" in event_types
+
+            # CompleteEvent must be last
+            assert event_types[-1] == "CompleteEvent"
+
+            # Verify the final result
+            complete = events[-1]
+            assert complete.result.topic == "agentic RAG patterns"
+            assert complete.result.depth == "standard"
+            assert len(complete.result.sources) == 5
+            assert "summary" in complete.result.artifacts
