# Section 05: SSE Streaming

## Overview

This section implements the core SSE streaming logic in `server/sse.py` and its corresponding tests in `tests/test_sse.py`. The module converts pipeline events from `beacon.pipeline.run_research()` into Server-Sent Events using the `sse-starlette` library. It contains two primary functions:

- **`format_sse_event()`** -- converts individual `PipelineEvent` objects into `ServerSentEvent` instances with proper event types, sequential IDs, and JSON data payloads.
- **`stream_research()`** -- an async generator that wraps the full pipeline execution, formatting each yielded event, handling client disconnects, and storing meaningful results in the session store on completion.

This section also covers the error handling strategy at the SSE layer.

**Files to create:**
- `C:\git_repos\playground\hackathon\02-api-streaming\server\sse.py`
- `C:\git_repos\playground\hackathon\02-api-streaming\tests\test_sse.py`

**Dependencies (must be implemented first):**
- **section-02-models**: Provides `ResearchRequest`, `CompleteSummary`, and `ResearchSummary` Pydantic models in `server/models.py`
- **section-03-sessions**: Provides `SessionStore` class in `server/sessions.py`
- **section-01-foundation**: Provides `pyproject.toml`, `conftest.py` with shared fixtures

---

## Pipeline Event Types (Background Context)

The pipeline module (`beacon.models`) defines the following event types that flow through the SSE layer. All are Pydantic `BaseModel` subclasses with a `type` literal field:

```python
# From beacon.models (01-agent-pipeline) -- DO NOT create these, they already exist

class StatusEvent(BaseModel):
    type: Literal["status"] = "status"
    message: str

class SourcesFoundEvent(BaseModel):
    type: Literal["sources_found"] = "sources_found"
    count: int
    sources: list[Source]

class SourceEvaluatedEvent(BaseModel):
    type: Literal["source_evaluated"] = "source_evaluated"
    index: int
    total: int
    source: EvaluatedSource

class ArtifactEvent(BaseModel):
    type: Literal["artifact"] = "artifact"
    artifact_type: Literal["summary", "concept_map", "flashcards", "resources"]
    data: str | list[Flashcard]

class ErrorEvent(BaseModel):
    type: Literal["error"] = "error"
    message: str
    recoverable: bool

class CompleteEvent(BaseModel):
    type: Literal["complete"] = "complete"
    session_id: str
    result: ResearchResult

PipelineEvent = StatusEvent | SourcesFoundEvent | SourceEvaluatedEvent | ArtifactEvent | ErrorEvent | CompleteEvent
```

The `ResearchResult` model:
```python
class ResearchResult(BaseModel):
    topic: str
    depth: str
    sources: list[EvaluatedSource]
    artifacts: dict[str, Any]
    session_id: str
    timestamp: str
```

---

## API-Specific Models (From section-02-models)

These models are defined in `server/models.py` by section-02. This section imports and uses them:

```python
# From server/models.py -- created by section-02-models

class ResearchRequest(BaseModel):
    """POST /api/research request body."""
    topic: str
    depth: Literal["quick", "standard", "deep"]

class ResearchSummary(BaseModel):
    """Nested summary within complete event."""
    topic: str
    depth: str
    source_count: int
    artifact_types: list[str]

class CompleteSummary(BaseModel):
    """Sent as SSE complete event data."""
    type: Literal["complete"] = "complete"
    session_id: str
    summary: ResearchSummary
```

---

## Tests First: `tests/test_sse.py`

Write all tests before implementing `server/sse.py`. Tests use `pytest-asyncio` with `asyncio_mode = "auto"` (configured in `pyproject.toml`), so no `@pytest.mark.asyncio` decorators are needed. Use fixtures from `tests/conftest.py` (created by section-01-foundation) for sample data.

### format_sse_event Tests

These tests validate that each pipeline event type is correctly converted to a `ServerSentEvent` with the right `event` name, JSON `data`, and sequential `id`.

```python
# tests/test_sse.py

from server.sse import format_sse_event, stream_research

# Test: StatusEvent formats with event="status", sequential id, JSON data
#   Create a StatusEvent(message="Searching..."), call format_sse_event(event, event_id=1).
#   Assert returned ServerSentEvent has event="status", id=1,
#   and data is the JSON serialization of the StatusEvent.

# Test: SourcesFoundEvent formats with event="sources_found"
#   Create a SourcesFoundEvent with count=5 and a list of Source objects.
#   Assert event="sources_found" and data contains the JSON payload.

# Test: SourceEvaluatedEvent formats with event="source_evaluated"
#   Create a SourceEvaluatedEvent with index=0, total=5, and an EvaluatedSource.
#   Assert event="source_evaluated".

# Test: ArtifactEvent formats with event="artifact"
#   Create an ArtifactEvent(artifact_type="summary", data="Some summary text").
#   Assert event="artifact".

# Test: ErrorEvent formats with event="error"
#   Create an ErrorEvent(message="Something failed", recoverable=True).
#   Assert event="error" and data includes recoverable=true.

# Test: CompleteEvent formats with event="complete" and CompleteSummary (not full result)
#   Create a CompleteEvent with a full ResearchResult (containing sources, artifacts).
#   Call format_sse_event(). Assert:
#     - event="complete"
#     - data is a CompleteSummary JSON (NOT the full ResearchResult)
#     - data contains "session_id" and "summary" keys
#     - data does NOT contain "sources" or "artifacts" or "deep_read_content"

# Test: CompleteEvent summary includes correct source_count and artifact_types
#   Create a CompleteEvent with result having 3 sources and artifacts {"summary": "...", "flashcards": [...]}.
#   Assert the CompleteSummary's summary.source_count == 3
#   and summary.artifact_types == ["summary", "flashcards"] (sorted list of artifact keys).

# Test: event id increments sequentially
#   Call format_sse_event with event_id=1, then event_id=2, then event_id=3.
#   Assert each returned ServerSentEvent has the matching id value.
```

### stream_research Generator Tests

These tests validate the async generator behavior. They mock `run_research` to yield controlled event sequences and use a mock `Request` object (with `is_disconnected()` returning `False` by default).

```python
# Test: yields SSE events for each pipeline event in order
#   Mock run_research to yield [StatusEvent, SourcesFoundEvent, CompleteEvent].
#   Collect all events from stream_research().
#   Assert 3 ServerSentEvent objects are yielded, in the correct order
#   (matching event names: "status", "sources_found", "complete").

# Test: maintains sequential event IDs across all events
#   Mock run_research to yield 5 events.
#   Collect all yielded ServerSentEvent objects.
#   Assert their IDs are 1, 2, 3, 4, 5.

# Test: stores ResearchResult in session store on CompleteEvent with non-empty sources
#   Mock run_research to yield a CompleteEvent whose result has non-empty sources.
#   Pass a real SessionStore instance.
#   After consuming the generator, assert session_store.get(session_id) returns the result.

# Test: does NOT store result when CompleteEvent has empty sources and empty artifacts
#   Mock run_research to yield a CompleteEvent whose result has sources=[] and artifacts={}.
#   After consuming the generator, assert session_store.get(session_id) returns None.

# Test: forwards ErrorEvent(recoverable=True) and continues streaming
#   Mock run_research to yield [StatusEvent, ErrorEvent(recoverable=True), StatusEvent, CompleteEvent].
#   Collect all events. Assert 4 events are yielded (error does not stop the stream).

# Test: forwards ErrorEvent(recoverable=False) and continues to CompleteEvent
#   Mock run_research to yield [StatusEvent, ErrorEvent(recoverable=False), CompleteEvent].
#   Collect all events. Assert 3 events are yielded (the stream continues to the CompleteEvent).

# Test: stops yielding when request is disconnected
#   Mock run_research to yield [StatusEvent, StatusEvent, CompleteEvent].
#   Mock request.is_disconnected() to return True after the first event.
#   Collect events. Assert only 1 event is yielded (the generator exits early).

# Test: handles pipeline that yields only ErrorEvent + CompleteEvent (fatal failure)
#   Mock run_research to yield [ErrorEvent(recoverable=False), CompleteEvent(result=empty)].
#   Collect events. Assert 2 events yielded.
#   Assert session store does NOT contain the result (empty result not stored).

# Test: handles pipeline with no errors (happy path through all event types)
#   Mock run_research to yield the full happy-path sequence:
#   [StatusEvent, SourcesFoundEvent, SourceEvaluatedEvent x N, ArtifactEvent x 4, CompleteEvent].
#   Collect events. Assert all events are yielded in order with correct event names.
```

### Error Handling Tests (also in test_sse.py)

These overlap with the stream_research tests above but specifically validate the error handling strategy described in the plan:

```python
# Test: recoverable ErrorEvent is forwarded as SSE event, stream continues
#   (Same scenario as "forwards ErrorEvent(recoverable=True)" above)

# Test: fatal ErrorEvent is forwarded, followed by CompleteEvent
#   (Same scenario as "forwards ErrorEvent(recoverable=False)" above)

# Test: empty result from fatal error is not stored in session
#   (Same scenario as "does NOT store result when CompleteEvent has empty sources" above)

# Test: pipeline CancelledError (from client disconnect) is handled gracefully
#   Mock run_research so its async iteration raises asyncio.CancelledError.
#   Assert stream_research does not propagate the exception
#   (the generator simply ends).
```

### Test Helper: Mocking the Request Object

For `stream_research` tests, create a simple mock `Request` object. The generator checks `await request.is_disconnected()`:

```python
# In test_sse.py or conftest.py

class MockRequest:
    """Minimal mock of starlette.requests.Request for testing stream_research."""
    def __init__(self, disconnect_after: int | None = None):
        self._call_count = 0
        self._disconnect_after = disconnect_after

    async def is_disconnected(self) -> bool:
        self._call_count += 1
        if self._disconnect_after is not None and self._call_count > self._disconnect_after:
            return True
        return False
```

### Test Helper: Mocking run_research

Mock `beacon.pipeline.run_research` by patching it where it is imported in `server.sse`. The mock should be an async generator that yields the desired sequence of `PipelineEvent` objects:

```python
# Example fixture pattern (can be inline in tests or in conftest.py)

async def mock_pipeline(*events):
    """Create an async generator that yields the given events."""
    async def _gen(topic, depth):
        for event in events:
            yield event
    return _gen
```

---

## Implementation: `server/sse.py`

### Imports

```python
from collections.abc import AsyncGenerator
from starlette.requests import Request
from sse_starlette import ServerSentEvent

from beacon.pipeline import run_research
from beacon.models import (
    PipelineEvent, CompleteEvent,
    ResearchResult,
)
from server.models import ResearchRequest, CompleteSummary, ResearchSummary
from server.sessions import SessionStore
```

### format_sse_event Function

```python
def format_sse_event(event: PipelineEvent, event_id: int) -> ServerSentEvent:
    """Convert a pipeline event into an SSE ServerSentEvent.

    Uses the event's type field as the SSE event name.
    Serializes the event data as JSON.
    Includes sequential event_id for client reconnection support.

    Special handling for CompleteEvent: sends a CompleteSummary
    instead of the full ResearchResult to avoid sending large
    deep-read content over SSE.
    """
```

Implementation details:

1. Read the `type` field from the event (every `PipelineEvent` variant has a `type` literal field). Use this as the SSE `event` name.
2. For all event types **except** `CompleteEvent`: serialize the event to JSON via `event.model_dump_json()` and use that as the SSE `data`.
3. For `CompleteEvent`: construct a `CompleteSummary` from the event's data:
   - `session_id` comes from `event.session_id`
   - `summary` is a `ResearchSummary` built from `event.result`:
     - `topic` = `event.result.topic`
     - `depth` = `event.result.depth`
     - `source_count` = `len(event.result.sources)`
     - `artifact_types` = `sorted(event.result.artifacts.keys())` -- the sorted list of artifact key names
   - Serialize the `CompleteSummary` via `.model_dump_json()` for the SSE `data`.
4. Set `id` to the `event_id` parameter (integer).
5. Return a `ServerSentEvent(data=..., event=..., id=...)`.

### stream_research Async Generator

```python
async def stream_research(
    request: Request,
    research_request: ResearchRequest,
    sessions: SessionStore,
) -> AsyncGenerator[ServerSentEvent, None]:
    """Stream pipeline events as SSE.

    Wraps run_research(), formats each event as a ServerSentEvent,
    checks for client disconnects, and stores meaningful results
    in the session store on completion.

    Args:
        request: The Starlette request (used for disconnect detection).
        research_request: The validated research request with topic and depth.
        sessions: The session store for persisting completed results.

    Yields:
        ServerSentEvent objects formatted for sse-starlette's EventSourceResponse.
    """
```

Implementation details:

1. Initialize `event_id = 0` as a counter.
2. Call `run_research(research_request.topic, research_request.depth)` to get the async generator.
3. Iterate over the yielded `PipelineEvent` objects with `async for event in pipeline:`.
4. For each event:
   a. Check `await request.is_disconnected()`. If True, break out of the loop. This is a defense-in-depth check; `sse-starlette` also handles disconnects via `CancelledError`.
   b. Increment `event_id`.
   c. Call `format_sse_event(event, event_id)` and yield the result.
   d. If the event is a `CompleteEvent`: check whether the result has meaningful content. A result is meaningful if `len(event.result.sources) > 0` or `len(event.result.artifacts) > 0`. If meaningful, call `await sessions.store(event.result.session_id, event.result)`.
5. The generator ends naturally when the pipeline finishes yielding events, or when the client disconnects.

### Error Handling at the SSE Layer

The pipeline (`run_research()`) handles all errors internally:
- **Recoverable errors** (e.g., one source extraction fails): Yields `ErrorEvent(recoverable=True)` and continues processing remaining sources.
- **Fatal errors** (e.g., search API failure, no sources found): Yields `ErrorEvent(recoverable=False)`, then yields `CompleteEvent` with empty results.

The SSE layer (`stream_research`) does **not** implement retry logic. It simply:
1. Forwards all `ErrorEvent` objects as SSE events (both recoverable and fatal).
2. Continues iterating until the pipeline finishes.
3. For `CompleteEvent` after a fatal error, the result will have empty `sources` and `artifacts`, so it will NOT be stored in the session store.

This design avoids duplicate events, session ID confusion, and unnecessary complexity. If the user wants to retry, they submit a new request from the frontend.

### CancelledError Handling

When a client disconnects mid-stream, `sse-starlette`'s `EventSourceResponse` raises `asyncio.CancelledError` inside the generator. Python async generators handle this via `GeneratorExit` / cancellation -- the generator simply stops. No special try/except is needed in `stream_research` for this case. The pipeline's own `finally` block (in `run_research`) handles cleanup of any outstanding async tasks.

---

## Integration Notes

### How section-06-routes-app Uses This Module

Section-06 will create the route handler that wraps `stream_research()` in an `EventSourceResponse`:

```python
# Preview of how routes.py (section-06) will use sse.py -- DO NOT implement this here
from sse_starlette import EventSourceResponse
from server.sse import stream_research

# In the POST /api/research handler:
return EventSourceResponse(
    stream_research(request, research_request, sessions),
    ping=15,           # 15-second heartbeat keepalive
    send_timeout=30,   # detect hung connections
    headers={
        "X-Accel-Buffering": "no",   # proxy compatibility
        "Cache-Control": "no-cache",
    },
)
```

### SSE Wire Format

The events produced by `format_sse_event` will be sent over the wire in standard SSE format by `EventSourceResponse`. Example wire output:

```
event: status
id: 1
data: {"type": "status", "message": "Searching for sources..."}

event: sources_found
id: 2
data: {"type": "sources_found", "count": 8, "sources": [...]}

event: source_evaluated
id: 3
data: {"type": "source_evaluated", "index": 0, "total": 8, "source": {...}}

event: error
id: 7
data: {"type": "error", "message": "Failed to extract content from source 3", "recoverable": true}

event: complete
id: 15
data: {"type": "complete", "session_id": "abc-123", "summary": {"topic": "quantum computing", "depth": "standard", "source_count": 8, "artifact_types": ["concept_map", "flashcards", "resources", "summary"]}}
```

Note: The `complete` event carries a `CompleteSummary` (lightweight), NOT the full `ResearchResult`. The full result is stored in the session store for retrieval via the export endpoint.

---

## Checklist

1. Write all tests in `C:\git_repos\playground\hackathon\02-api-streaming\tests\test_sse.py` (tests will initially fail)
2. Implement `format_sse_event()` in `C:\git_repos\playground\hackathon\02-api-streaming\server\sse.py`
3. Implement `stream_research()` in `C:\git_repos\playground\hackathon\02-api-streaming\server\sse.py`
4. Run tests: `cd C:\git_repos\playground\hackathon\02-api-streaming && uv run pytest tests/test_sse.py -v`
5. Verify all tests pass

---

## Implementation Notes (Post-Implementation)

**Files created:**
- `C:\git_repos\playground\hackathon\02-api-streaming\server\sse.py` (68 lines)
- `C:\git_repos\playground\hackathon\02-api-streaming\tests\test_sse.py` (18 tests)

**Deviations from plan:**
- **`id` parameter passed as `str(event_id)`** instead of raw int. Code review discovered that `sse-starlette.ServerSentEvent` expects `id: Optional[str]`; passing int would crash at `encode()` time. The SSE spec also mandates string IDs.
- **No `asyncio.CancelledError` catch in `stream_research`**: Plan stated no try/except needed; initial implementation added one defensively, but it was removed per code review to avoid interfering with `EventSourceResponse` cleanup.
- **Added wire-format serialization test**: `test_sse_wire_format_serialization` calls `.encode()` to verify actual SSE output bytes, catching type mismatches that attribute-level assertions miss.
- **Happy-path test extended**: `test_happy_path_all_event_types` now also verifies session storage after the complete event.

**Test count:** 18 tests (8 format_sse_event + 9 stream_research + 1 serialization)
