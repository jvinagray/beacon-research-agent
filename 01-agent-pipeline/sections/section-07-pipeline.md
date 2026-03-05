# Section 07 -- Pipeline: Main Orchestrator

## Overview

This section implements the main pipeline orchestrator (`beacon/pipeline.py`) that ties all modules together into a single async generator. The `run_research()` function is the entry point for the entire Beacon pipeline -- it takes a topic and depth setting, executes each stage in sequence (search, evaluate, extract, synthesize), and yields typed `PipelineEvent` objects in real-time for downstream SSE consumption.

After completing this section you will have:

- `beacon/pipeline.py` with the `run_research()` async generator
- `tests/test_pipeline.py` with both unit tests for orchestration logic and a full integration test with all dependencies mocked
- Producer-consumer pattern for real-time evaluation progress
- Task cancellation on generator close
- Structured error handling (recoverable vs. fatal)

## Dependencies

- **Section 01 (Foundation)**: `config.py` (`get_config`, `get_depth_settings`)
- **Section 02 (Models)**: All event types (`StatusEvent`, `SourcesFoundEvent`, `SourceEvaluatedEvent`, `ArtifactEvent`, `ErrorEvent`, `CompleteEvent`, `PipelineEvent`), `ResearchResult`, `Flashcard`
- **Section 03 (Search)**: `search()` from `beacon/search.py`
- **Section 04 (Evaluate)**: `evaluate_sources()` from `beacon/evaluate.py`
- **Section 05 (Extract)**: `extract_content()` from `beacon/extract.py`
- **Section 06 (Synthesize)**: `synthesize()` from `beacon/synthesize.py`

All other sections must be complete before implementing this one.

## Files Created

```
beacon/
  pipeline.py         # Main orchestrator (actual)
tests/
  test_pipeline.py    # Tests for pipeline.py (actual)
```

---

## Tests FIRST: `tests/test_pipeline.py`

```python
"""Tests for beacon.pipeline -- write these FIRST."""
import asyncio
import json
import uuid
from datetime import datetime
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from beacon.models import (
    Source, EvaluatedSource, IntelligenceSignals, Flashcard,
    StatusEvent, SourcesFoundEvent, SourceEvaluatedEvent,
    ArtifactEvent, ErrorEvent, CompleteEvent, ResearchResult,
)


def _make_sources(n: int = 3) -> list[Source]:
    return [
        Source(url=f"https://example.com/{i}", title=f"Source {i}", snippet=f"Snippet {i}")
        for i in range(n)
    ]


def _make_evaluated_sources(n: int = 3) -> list[EvaluatedSource]:
    sources = []
    for i in range(n):
        signals = IntelligenceSignals(
            learning_efficiency_score=10 - i,
            content_type="tutorial",
            time_estimate_minutes=10,
            recency="2025",
            key_insight=f"Insight {i}.",
            coverage=["topic"],
        )
        sources.append(EvaluatedSource(
            url=f"https://example.com/{i}",
            title=f"Source {i}",
            snippet=f"Snippet {i}",
            signals=signals,
            deep_read_content=f"# Content {i}\n\nFull content here.",
            extraction_method="tavily_extract",
        ))
    return sources


def _make_artifacts():
    return {
        "summary": "# Summary\n\nKey findings.",
        "concept_map": "# Concept Map\n\n- Topic A\n  - Subtopic B",
        "flashcards": [Flashcard(question="Q1?", answer="A1.")],
        "resources": [{"url": "https://example.com/0", "title": "Source 0"}],
    }


async def _collect_events(gen) -> list:
    """Helper: collect all events from an async generator."""
    events = []
    async for event in gen:
        events.append(event)
    return events


class TestRunResearchIsAsyncGenerator:
    @pytest.mark.asyncio
    async def test_is_async_generator(self):
        """run_research must be an async generator yielding PipelineEvent types."""
        with patch("beacon.pipeline.search", new_callable=AsyncMock) as mock_search, \
             patch("beacon.pipeline.evaluate_sources", new_callable=AsyncMock) as mock_eval, \
             patch("beacon.pipeline.extract_content", new_callable=AsyncMock) as mock_extract, \
             patch("beacon.pipeline.synthesize", new_callable=AsyncMock) as mock_synth, \
             patch("beacon.pipeline.get_config"), \
             patch("beacon.pipeline.get_depth_settings") as mock_depth:

            mock_depth.return_value = {"max_results": 10, "num_queries": 1, "deep_read_top_n": 3}
            mock_search.return_value = _make_sources()
            mock_eval.return_value = _make_evaluated_sources()
            mock_extract.return_value = _make_evaluated_sources()
            mock_synth.return_value = _make_artifacts()

            from beacon.pipeline import run_research
            gen = run_research("test topic", "quick")
            # It should be an async generator
            assert hasattr(gen, "__aiter__")
            assert hasattr(gen, "__anext__")
            events = await _collect_events(gen)
            assert len(events) > 0


class TestSessionMetadata:
    @pytest.mark.asyncio
    async def test_generates_uuid4_session_id(self):
        """run_research must generate a valid UUID4 session_id."""
        with patch("beacon.pipeline.search", new_callable=AsyncMock) as mock_search, \
             patch("beacon.pipeline.evaluate_sources", new_callable=AsyncMock) as mock_eval, \
             patch("beacon.pipeline.extract_content", new_callable=AsyncMock) as mock_extract, \
             patch("beacon.pipeline.synthesize", new_callable=AsyncMock) as mock_synth, \
             patch("beacon.pipeline.get_config"), \
             patch("beacon.pipeline.get_depth_settings") as mock_depth:

            mock_depth.return_value = {"max_results": 10, "num_queries": 1, "deep_read_top_n": 3}
            mock_search.return_value = _make_sources()
            mock_eval.return_value = _make_evaluated_sources()
            mock_extract.return_value = _make_evaluated_sources()
            mock_synth.return_value = _make_artifacts()

            from beacon.pipeline import run_research
            events = await _collect_events(run_research("topic", "quick"))
            complete_events = [e for e in events if isinstance(e, CompleteEvent)]
            assert len(complete_events) == 1
            session_id = complete_events[0].session_id
            # Validate it's a valid UUID
            parsed = uuid.UUID(session_id, version=4)
            assert str(parsed) == session_id

    @pytest.mark.asyncio
    async def test_generates_iso8601_timestamp(self):
        """run_research must generate a timestamp in ISO 8601 format."""
        with patch("beacon.pipeline.search", new_callable=AsyncMock) as mock_search, \
             patch("beacon.pipeline.evaluate_sources", new_callable=AsyncMock) as mock_eval, \
             patch("beacon.pipeline.extract_content", new_callable=AsyncMock) as mock_extract, \
             patch("beacon.pipeline.synthesize", new_callable=AsyncMock) as mock_synth, \
             patch("beacon.pipeline.get_config"), \
             patch("beacon.pipeline.get_depth_settings") as mock_depth:

            mock_depth.return_value = {"max_results": 10, "num_queries": 1, "deep_read_top_n": 3}
            mock_search.return_value = _make_sources()
            mock_eval.return_value = _make_evaluated_sources()
            mock_extract.return_value = _make_evaluated_sources()
            mock_synth.return_value = _make_artifacts()

            from beacon.pipeline import run_research
            events = await _collect_events(run_research("topic", "quick"))
            complete_events = [e for e in events if isinstance(e, CompleteEvent)]
            timestamp = complete_events[0].result.timestamp
            # Should not throw
            datetime.fromisoformat(timestamp)


class TestEventSequence:
    @pytest.mark.asyncio
    async def test_yields_status_before_each_stage(self):
        """Pipeline must yield StatusEvent before search, evaluate, extract, and synthesize."""
        with patch("beacon.pipeline.search", new_callable=AsyncMock) as mock_search, \
             patch("beacon.pipeline.evaluate_sources", new_callable=AsyncMock) as mock_eval, \
             patch("beacon.pipeline.extract_content", new_callable=AsyncMock) as mock_extract, \
             patch("beacon.pipeline.synthesize", new_callable=AsyncMock) as mock_synth, \
             patch("beacon.pipeline.get_config"), \
             patch("beacon.pipeline.get_depth_settings") as mock_depth:

            mock_depth.return_value = {"max_results": 10, "num_queries": 1, "deep_read_top_n": 3}
            mock_search.return_value = _make_sources()
            mock_eval.return_value = _make_evaluated_sources()
            mock_extract.return_value = _make_evaluated_sources()
            mock_synth.return_value = _make_artifacts()

            from beacon.pipeline import run_research
            events = await _collect_events(run_research("topic", "quick"))
            status_events = [e for e in events if isinstance(e, StatusEvent)]
            # At minimum 4 status events: searching, evaluating, extracting, synthesizing
            assert len(status_events) >= 4

    @pytest.mark.asyncio
    async def test_yields_sources_found_after_search(self):
        """Pipeline must yield SourcesFoundEvent after the search stage."""
        with patch("beacon.pipeline.search", new_callable=AsyncMock) as mock_search, \
             patch("beacon.pipeline.evaluate_sources", new_callable=AsyncMock) as mock_eval, \
             patch("beacon.pipeline.extract_content", new_callable=AsyncMock) as mock_extract, \
             patch("beacon.pipeline.synthesize", new_callable=AsyncMock) as mock_synth, \
             patch("beacon.pipeline.get_config"), \
             patch("beacon.pipeline.get_depth_settings") as mock_depth:

            mock_depth.return_value = {"max_results": 10, "num_queries": 1, "deep_read_top_n": 3}
            mock_search.return_value = _make_sources(5)
            mock_eval.return_value = _make_evaluated_sources(5)
            mock_extract.return_value = _make_evaluated_sources(5)
            mock_synth.return_value = _make_artifacts()

            from beacon.pipeline import run_research
            events = await _collect_events(run_research("topic", "quick"))
            found_events = [e for e in events if isinstance(e, SourcesFoundEvent)]
            assert len(found_events) == 1
            assert found_events[0].count == 5

    @pytest.mark.asyncio
    async def test_yields_artifact_events(self):
        """Pipeline must yield ArtifactEvent for summary, concept_map, flashcards, resources."""
        with patch("beacon.pipeline.search", new_callable=AsyncMock) as mock_search, \
             patch("beacon.pipeline.evaluate_sources", new_callable=AsyncMock) as mock_eval, \
             patch("beacon.pipeline.extract_content", new_callable=AsyncMock) as mock_extract, \
             patch("beacon.pipeline.synthesize", new_callable=AsyncMock) as mock_synth, \
             patch("beacon.pipeline.get_config"), \
             patch("beacon.pipeline.get_depth_settings") as mock_depth:

            mock_depth.return_value = {"max_results": 10, "num_queries": 1, "deep_read_top_n": 3}
            mock_search.return_value = _make_sources()
            mock_eval.return_value = _make_evaluated_sources()
            mock_extract.return_value = _make_evaluated_sources()
            mock_synth.return_value = _make_artifacts()

            from beacon.pipeline import run_research
            events = await _collect_events(run_research("topic", "quick"))
            artifact_events = [e for e in events if isinstance(e, ArtifactEvent)]
            artifact_types = {e.artifact_type for e in artifact_events}
            assert "summary" in artifact_types
            assert "concept_map" in artifact_types
            assert "flashcards" in artifact_types
            assert "resources" in artifact_types

    @pytest.mark.asyncio
    async def test_yields_complete_event_at_end(self):
        """Pipeline must yield CompleteEvent with full ResearchResult at the end."""
        with patch("beacon.pipeline.search", new_callable=AsyncMock) as mock_search, \
             patch("beacon.pipeline.evaluate_sources", new_callable=AsyncMock) as mock_eval, \
             patch("beacon.pipeline.extract_content", new_callable=AsyncMock) as mock_extract, \
             patch("beacon.pipeline.synthesize", new_callable=AsyncMock) as mock_synth, \
             patch("beacon.pipeline.get_config"), \
             patch("beacon.pipeline.get_depth_settings") as mock_depth:

            mock_depth.return_value = {"max_results": 10, "num_queries": 1, "deep_read_top_n": 3}
            mock_search.return_value = _make_sources()
            mock_eval.return_value = _make_evaluated_sources()
            mock_extract.return_value = _make_evaluated_sources()
            mock_synth.return_value = _make_artifacts()

            from beacon.pipeline import run_research
            events = await _collect_events(run_research("topic", "quick"))
            complete_events = [e for e in events if isinstance(e, CompleteEvent)]
            assert len(complete_events) == 1
            result = complete_events[0].result
            assert isinstance(result, ResearchResult)
            assert result.topic == "topic"
            assert result.depth == "quick"


class TestErrorHandling:
    @pytest.mark.asyncio
    async def test_recoverable_error_continues_pipeline(self):
        """Non-fatal errors should yield ErrorEvent(recoverable=True) and continue."""
        with patch("beacon.pipeline.search", new_callable=AsyncMock) as mock_search, \
             patch("beacon.pipeline.evaluate_sources", new_callable=AsyncMock) as mock_eval, \
             patch("beacon.pipeline.extract_content", new_callable=AsyncMock) as mock_extract, \
             patch("beacon.pipeline.synthesize", new_callable=AsyncMock) as mock_synth, \
             patch("beacon.pipeline.get_config"), \
             patch("beacon.pipeline.get_depth_settings") as mock_depth:

            mock_depth.return_value = {"max_results": 10, "num_queries": 1, "deep_read_top_n": 3}
            mock_search.return_value = _make_sources()
            mock_eval.return_value = _make_evaluated_sources()
            # Extract fails but is non-fatal
            mock_extract.side_effect = Exception("Extraction error")
            mock_synth.return_value = _make_artifacts()

            from beacon.pipeline import run_research
            events = await _collect_events(run_research("topic", "quick"))
            error_events = [e for e in events if isinstance(e, ErrorEvent)]
            # Should have at least one recoverable error
            assert any(e.recoverable for e in error_events)
            # Pipeline should still complete (may have partial results)
            complete_events = [e for e in events if isinstance(e, CompleteEvent)]
            assert len(complete_events) == 1

    @pytest.mark.asyncio
    async def test_fatal_error_no_search_results(self):
        """If search returns no results, yield ErrorEvent(recoverable=False)."""
        with patch("beacon.pipeline.search", new_callable=AsyncMock) as mock_search, \
             patch("beacon.pipeline.evaluate_sources", new_callable=AsyncMock) as mock_eval, \
             patch("beacon.pipeline.extract_content", new_callable=AsyncMock) as mock_extract, \
             patch("beacon.pipeline.synthesize", new_callable=AsyncMock) as mock_synth, \
             patch("beacon.pipeline.get_config"), \
             patch("beacon.pipeline.get_depth_settings") as mock_depth:

            mock_depth.return_value = {"max_results": 10, "num_queries": 1, "deep_read_top_n": 3}
            mock_search.return_value = []  # No results

            from beacon.pipeline import run_research
            events = await _collect_events(run_research("topic", "quick"))
            error_events = [e for e in events if isinstance(e, ErrorEvent)]
            assert any(not e.recoverable for e in error_events)

    @pytest.mark.asyncio
    async def test_invalid_depth_yields_error(self):
        """An invalid depth value should yield an ErrorEvent."""
        with patch("beacon.pipeline.get_config"), \
             patch("beacon.pipeline.get_depth_settings", side_effect=ValueError("Invalid depth")):

            from beacon.pipeline import run_research
            events = await _collect_events(run_research("topic", "ultra"))
            error_events = [e for e in events if isinstance(e, ErrorEvent)]
            assert len(error_events) >= 1


class TestTaskCancellation:
    @pytest.mark.asyncio
    async def test_cancels_tasks_on_generator_close(self):
        """When the generator is closed, in-flight tasks must be cancelled."""
        with patch("beacon.pipeline.search", new_callable=AsyncMock) as mock_search, \
             patch("beacon.pipeline.evaluate_sources", new_callable=AsyncMock) as mock_eval, \
             patch("beacon.pipeline.extract_content", new_callable=AsyncMock) as mock_extract, \
             patch("beacon.pipeline.synthesize", new_callable=AsyncMock) as mock_synth, \
             patch("beacon.pipeline.get_config"), \
             patch("beacon.pipeline.get_depth_settings") as mock_depth:

            mock_depth.return_value = {"max_results": 10, "num_queries": 1, "deep_read_top_n": 3}
            mock_search.return_value = _make_sources()

            # Make evaluate_sources hang so we can close the generator mid-pipeline
            async def slow_evaluate(*args, **kwargs):
                await asyncio.sleep(10)
                return _make_evaluated_sources()

            mock_eval.side_effect = slow_evaluate

            from beacon.pipeline import run_research
            gen = run_research("topic", "quick")

            # Collect a few events then close
            events = []
            async for event in gen:
                events.append(event)
                if isinstance(event, SourcesFoundEvent):
                    break  # Close after search completes

            await gen.aclose()
            # The slow evaluate should have been cancelled, not hanging


class TestFullIntegration:
    @pytest.mark.asyncio
    async def test_full_pipeline_produces_complete_event_stream(self):
        """Full integration test: all mocked deps, verify complete event stream."""
        with patch("beacon.pipeline.search", new_callable=AsyncMock) as mock_search, \
             patch("beacon.pipeline.evaluate_sources", new_callable=AsyncMock) as mock_eval, \
             patch("beacon.pipeline.extract_content", new_callable=AsyncMock) as mock_extract, \
             patch("beacon.pipeline.synthesize", new_callable=AsyncMock) as mock_synth, \
             patch("beacon.pipeline.get_config"), \
             patch("beacon.pipeline.get_depth_settings") as mock_depth:

            mock_depth.return_value = {"max_results": 10, "num_queries": 1, "deep_read_top_n": 3}
            mock_search.return_value = _make_sources(5)
            mock_eval.return_value = _make_evaluated_sources(5)
            mock_extract.return_value = _make_evaluated_sources(5)
            mock_synth.return_value = _make_artifacts()

            from beacon.pipeline import run_research
            events = await _collect_events(run_research("agentic RAG patterns", "standard"))

            # Verify event type sequence
            event_types = [type(e).__name__ for e in events]

            # Must start with StatusEvent
            assert event_types[0] == "StatusEvent"

            # Must contain at least one of each expected type
            assert "SourcesFoundEvent" in event_types
            assert "ArtifactEvent" in event_types
            assert "CompleteEvent" in event_types

            # CompleteEvent must be last
            assert event_types[-1] == "CompleteEvent"

            # Verify the final result
            complete = events[-1]
            assert complete.result.topic == "agentic RAG patterns"
            assert complete.result.depth == "standard"
            assert len(complete.result.sources) == 5
            assert "summary" in complete.result.artifacts
```

---

## Implementation: `beacon/pipeline.py`

### Function signature

```python
async def run_research(
    topic: str,
    depth: str,
) -> AsyncGenerator[PipelineEvent, None]:
    """Main pipeline entry point. Yields events as research progresses.

    This is an async generator that orchestrates the full research pipeline:
    1. Search for sources
    2. Evaluate each source with Claude
    3. Extract full content from top sources
    4. Synthesize learning artifacts

    Yields real-time progress events for SSE consumption.

    Args:
        topic: The research topic to investigate.
        depth: One of 'quick', 'standard', 'deep'.

    Yields:
        PipelineEvent objects: StatusEvent, SourcesFoundEvent,
        SourceEvaluatedEvent, ArtifactEvent, ErrorEvent, CompleteEvent.
    """
```

### Orchestration flow

The function must follow this exact sequence:

```
1. Generate session_id (uuid4) and timestamp (ISO 8601)
2. Validate inputs and load config
   - Call get_config() to get API keys
   - Call get_depth_settings(depth) to get depth config
   - If either fails, yield ErrorEvent(recoverable=False) and return

3. SEARCH STAGE
   - yield StatusEvent("Searching for sources...")
   - Call search(topic, depth_config)
   - yield SourcesFoundEvent(count=len(sources), sources=sources)
   - If no sources found: yield ErrorEvent(recoverable=False), yield CompleteEvent with empty result, return

4. EVALUATE STAGE
   - yield StatusEvent("Evaluating sources...")
   - Create asyncio.Queue
   - Launch evaluate_sources(sources, topic, queue=queue) as background task
   - Drain queue: for each item, yield SourceEvaluatedEvent(index, total, source)
   - Await the background task to get sorted results
   - Sort by score, select top N for deep-read

5. EXTRACT STAGE
   - yield StatusEvent("Reading top sources...")
   - Call extract_content(top_n_sources)
   - Merge extracted sources back into the full list

6. SYNTHESIZE STAGE
   - yield StatusEvent("Generating learning artifacts...")
   - Call synthesize(all_sources, topic, depth)
   - For each artifact: yield ArtifactEvent(artifact_type, data)

7. COMPLETE
   - Build ResearchResult with all data
   - yield CompleteEvent(session_id, result)
```

### Producer-consumer pattern for evaluation events

The evaluation stage needs special handling because we want to yield `SourceEvaluatedEvent` for each source as it completes, but we cannot yield from inside `asyncio.gather` tasks.

```python
# Create queue for real-time progress
queue: asyncio.Queue[EvaluatedSource] = asyncio.Queue()

# Launch evaluation in background
eval_task = asyncio.create_task(
    evaluate_sources(sources, topic, queue=queue)
)

# Track tasks for cancellation
tasks.append(eval_task)

# Drain queue, yielding events as results arrive
completed = 0
total = len(sources)
while completed < total:
    try:
        evaluated_source = await asyncio.wait_for(queue.get(), timeout=60)
        completed += 1
        yield SourceEvaluatedEvent(
            index=completed,
            total=total,
            source=evaluated_source,
        )
    except asyncio.TimeoutError:
        # Safety valve: if queue stalls, break out
        break

# Await the task to get the final sorted results
evaluated_sources = await eval_task
```

### Task cancellation pattern

```python
tasks: list[asyncio.Task] = []

try:
    # ... pipeline stages ...
    # Each stage that creates asyncio.Task adds it to `tasks`

except GeneratorExit:
    # Generator was closed by consumer
    pass
finally:
    # Cancel any remaining in-flight tasks
    for task in tasks:
        if not task.done():
            task.cancel()
    # Await cancellation to ensure cleanup
    for task in tasks:
        try:
            await task
        except (asyncio.CancelledError, Exception):
            pass
```

### Error handling pattern

Each stage is wrapped in try/except:

```python
# Non-fatal error (e.g., extraction fails)
try:
    extracted_sources = await extract_content(top_n_sources)
except Exception as e:
    logger.error(f"[{session_id}] Extraction failed: {e}")
    yield ErrorEvent(message=f"Content extraction failed: {e}", recoverable=True)
    extracted_sources = top_n_sources  # Continue with un-extracted sources

# Fatal error (e.g., no search results)
if not sources:
    yield ErrorEvent(message="No sources found for this topic.", recoverable=False)
    yield CompleteEvent(session_id=session_id, result=ResearchResult(
        topic=topic, depth=depth, sources=[], artifacts={},
        session_id=session_id, timestamp=timestamp,
    ))
    return
```

### Logging

Use Python's `logging` module:

```python
import logging

logger = logging.getLogger("beacon.pipeline")
```

Key log points:
- Stage entry/exit with timing: `logger.info(f"[{session_id}] Search completed: {len(sources)} sources in {elapsed:.1f}s")`
- Individual task completion: `logger.debug(f"[{session_id}] Evaluated source: {source.url} (score={score})")`
- Errors and retries: `logger.error(f"[{session_id}] Extraction failed for {url}: {e}")`

---

## Verification Steps

```bash
uv run pytest tests/test_pipeline.py -v
```

All tests should pass. Additionally verify:

1. `from beacon.pipeline import run_research` imports cleanly
2. The full event stream starts with `StatusEvent` and ends with `CompleteEvent`
3. All intermediate event types appear in the correct order
4. Closing the generator mid-pipeline does not hang or leak tasks
5. Invalid depth yields an error event (not an unhandled exception)

For a comprehensive check, run all tests:
```bash
uv run pytest tests/ -v
```

---

## Design Decisions

- **Async generator (not callback/websocket)**: The async generator pattern provides natural backpressure -- the consumer controls the pace. It also integrates cleanly with FastAPI's `StreamingResponse` for SSE in the downstream API layer.
- **Producer-consumer Queue for evaluation**: You cannot `yield` from inside a callback or `asyncio.gather` task. The Queue pattern decouples the evaluation workers from the generator's yield loop, enabling real-time progress events.
- **try/finally for task cancellation**: When the consumer disconnects (generator is closed), any in-flight Claude API calls should be cancelled immediately to avoid wasting API credits. The finally block ensures cleanup happens regardless of how the generator exits.
- **Recoverable vs. fatal errors**: Fatal errors (no search results, invalid config) stop the pipeline. Recoverable errors (extraction failure, partial synthesis failure) emit an error event and continue with degraded results. The pipeline always yields a `CompleteEvent` so the consumer knows the stream is done.
- **Session ID and timestamp at the top**: Generated once at the start of `run_research()` and used throughout for logging and in the final `ResearchResult`. The session_id is a UUID4 string; the timestamp is ISO 8601.
- **Imports at module level**: The pipeline module imports `search`, `evaluate_sources`, `extract_content`, and `synthesize` at module level. Tests mock these with `patch("beacon.pipeline.search", ...)` which is clean and avoids import-time side effects.

## Deviations from Plan

1. **Client creation in pipeline**: The plan did not specify where API clients (AsyncAnthropic, AsyncTavilyClient) are created. During code review, we identified that synthesize() and extract_content() expect client arguments but were called without them. The pipeline now creates clients after get_config() and passes them to all downstream modules.
2. **Top-level exception handler**: Added `except Exception` in the outer try block to guarantee a CompleteEvent is always yielded, even on unexpected errors. The plan implied this in the Design Decisions but did not include it in the code patterns.
3. **Queue drain with event loop yield**: Added `await asyncio.sleep(0)` before the queue-draining loop and `eval_task.done()` check to handle cases where the evaluate task completes before the consumer starts draining. This prevents deadlocks when evaluate_sources finishes instantly (e.g., in tests with mocks).
4. **eval_task await wrapped in try/except**: The plan showed `evaluated_sources = await eval_task` without error handling. We wrapped it to handle evaluation failures gracefully instead of crashing the pipeline.
5. **Resources artifact serialization**: The resources artifact from synthesize() is a list[dict], which doesn't match ArtifactEvent.data (str | list[Flashcard]). The pipeline serializes non-string/non-Flashcard data to JSON strings.

## Test Results

```
12 tests pass in tests/test_pipeline.py
100 tests pass across the full test suite
```
