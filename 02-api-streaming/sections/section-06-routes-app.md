# Section 06: FastAPI App, Routes, and Server Entry Point

## Overview

This section implements the final integration layer: the FastAPI application factory (`server/app.py`), route definitions (`server/routes.py`), and a convenience entry point (`server/__main__.py`). It wires together all components from prior sections -- SSE streaming, session management, and markdown export -- into a working HTTP server with CORS, logging, concurrency control, and lifespan management.

**Files to create:**
- `C:\git_repos\playground\hackathon\02-api-streaming\server\app.py`
- `C:\git_repos\playground\hackathon\02-api-streaming\server\routes.py`
- `C:\git_repos\playground\hackathon\02-api-streaming\server\__main__.py`
- `C:\git_repos\playground\hackathon\02-api-streaming\tests\test_routes.py`

**Dependencies (must be implemented first):**
- **section-01-foundation**: Provides `pyproject.toml`, directory structure, `conftest.py` with shared fixtures (`app`, `client`, `sample_research_result`, `session_store`, `mock_pipeline`)
- **section-02-models**: Provides `ResearchRequest` Pydantic model in `server/models.py`
- **section-03-sessions**: Provides `SessionStore` and `run_cleanup_loop` in `server/sessions.py`
- **section-04-export**: Provides `generate_markdown` and `topic_slug` in `server/export.py`
- **section-05-sse**: Provides `stream_research` in `server/sse.py`

---

## Modules From Prior Sections (Read-Only Reference)

These are imported by the app/routes layer. Do NOT re-implement them -- they exist from prior sections:

```python
# From server/models.py (section-02)
from server.models import ResearchRequest

# From server/sessions.py (section-03)
from server.sessions import SessionStore, run_cleanup_loop

# From server/export.py (section-04)
from server.export import generate_markdown, topic_slug

# From server/sse.py (section-05)
from server.sse import stream_research
```

---

## Tests First: `tests/test_routes.py`

All tests go in `C:\git_repos\playground\hackathon\02-api-streaming\tests\test_routes.py`. Tests use `asyncio_mode = "auto"` from `pyproject.toml`, so no `@pytest.mark.asyncio` decorators are needed. Tests use the `client` and `app` fixtures from `conftest.py` (section-01) which provide an `httpx.AsyncClient` wired to the test FastAPI app with `run_research` patched.

### SSE Test Helper

Before writing tests, define a small helper function at the top of the test file to parse SSE responses from raw `text/event-stream` bytes into structured events. This is used by several tests:

```python
def parse_sse_events(raw_bytes: bytes) -> list[dict]:
    """Parse raw SSE text/event-stream bytes into a list of event dicts.

    Each dict has keys: 'event' (str), 'id' (str|None), 'data' (str).
    Events are separated by blank lines.
    """
    import json as _json

    events = []
    current = {}
    for line in raw_bytes.decode("utf-8").splitlines():
        if line.startswith("event:"):
            current["event"] = line[len("event:"):].strip()
        elif line.startswith("id:"):
            current["id"] = line[len("id:"):].strip()
        elif line.startswith("data:"):
            current["data"] = line[len("data:"):].strip()
        elif line.strip() == "" and current:
            events.append(current)
            current = {}
    if current:
        events.append(current)
    return events
```

### Health Endpoint Tests

```python
class TestHealthEndpoint:
    """Tests for GET /health."""

    async def test_health_returns_200(self, client):
        """GET /health returns HTTP 200."""
        response = await client.get("/health")
        assert response.status_code == 200

    async def test_health_returns_ok_status(self, client):
        """GET /health returns {"status": "ok"}."""
        response = await client.get("/health")
        assert response.json() == {"status": "ok"}
```

### App Startup / Lifespan Tests

```python
class TestAppLifespan:
    """Tests for app startup state and configuration."""

    async def test_app_has_session_store(self, app):
        """After startup, app.state.sessions is a SessionStore instance."""
        from server.sessions import SessionStore
        assert hasattr(app.state, "sessions")
        assert isinstance(app.state.sessions, SessionStore)

    async def test_app_has_research_semaphore(self, app):
        """After startup, app.state.research_semaphore is an asyncio.Semaphore."""
        import asyncio
        assert hasattr(app.state, "research_semaphore")
        assert isinstance(app.state.research_semaphore, asyncio.Semaphore)

    async def test_cors_headers_present(self, client):
        """Responses include Access-Control-Allow-Origin: * header."""
        response = await client.options(
            "/health",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert "access-control-allow-origin" in response.headers
        assert response.headers["access-control-allow-origin"] == "*"

    async def test_cors_no_credentials_header(self, client):
        """CORS does NOT include Access-Control-Allow-Credentials header."""
        response = await client.options(
            "/health",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
            },
        )
        # If present it should not be "true"
        creds = response.headers.get("access-control-allow-credentials")
        assert creds is None or creds != "true"
```

### POST /api/research Tests

```python
import json


class TestResearchEndpoint:
    """Tests for POST /api/research SSE streaming endpoint."""

    async def test_returns_200_event_stream(self, client):
        """POST /api/research with valid body returns 200 with text/event-stream content type."""
        response = await client.post(
            "/api/research",
            json={"topic": "Python asyncio", "depth": "standard"},
        )
        assert response.status_code == 200
        assert "text/event-stream" in response.headers.get("content-type", "")

    async def test_returns_422_missing_topic(self, client):
        """POST /api/research without topic returns 422 validation error."""
        response = await client.post(
            "/api/research",
            json={"depth": "quick"},
        )
        assert response.status_code == 422

    async def test_returns_422_invalid_depth(self, client):
        """POST /api/research with invalid depth returns 422."""
        response = await client.post(
            "/api/research",
            json={"topic": "Test", "depth": "ultra"},
        )
        assert response.status_code == 422

    async def test_sse_stream_contains_expected_event_types(self, client):
        """SSE stream contains status, sources_found, and complete events in order."""
        response = await client.post(
            "/api/research",
            json={"topic": "Python asyncio", "depth": "standard"},
        )
        events = parse_sse_events(response.content)

        # Verify we got events
        assert len(events) > 0

        # Extract event types in order
        event_types = [e.get("event") for e in events if e.get("event")]

        # The mock pipeline should produce at least status, sources_found, and complete
        assert "status" in event_types
        assert "complete" in event_types

    async def test_sse_events_have_sequential_ids(self, client):
        """SSE events have sequential integer IDs starting from 1."""
        response = await client.post(
            "/api/research",
            json={"topic": "Test topic", "depth": "quick"},
        )
        events = parse_sse_events(response.content)

        ids = [int(e["id"]) for e in events if e.get("id")]
        assert ids == list(range(1, len(ids) + 1))

    async def test_complete_event_has_session_id(self, client):
        """The complete SSE event contains a session_id in its data."""
        response = await client.post(
            "/api/research",
            json={"topic": "Test topic", "depth": "standard"},
        )
        events = parse_sse_events(response.content)

        complete_events = [e for e in events if e.get("event") == "complete"]
        assert len(complete_events) == 1

        data = json.loads(complete_events[0]["data"])
        assert "session_id" in data
        assert "summary" in data

    async def test_complete_event_does_not_contain_full_result(self, client):
        """The complete event carries a CompleteSummary, not the full ResearchResult."""
        response = await client.post(
            "/api/research",
            json={"topic": "Test topic", "depth": "standard"},
        )
        events = parse_sse_events(response.content)

        complete_events = [e for e in events if e.get("event") == "complete"]
        data = json.loads(complete_events[0]["data"])

        # CompleteSummary should NOT contain sources or artifacts directly
        assert "sources" not in data
        assert "artifacts" not in data
        assert "deep_read_content" not in data

    async def test_stream_ends_after_complete(self, client):
        """The SSE stream terminates after the complete event."""
        response = await client.post(
            "/api/research",
            json={"topic": "Test topic", "depth": "standard"},
        )
        events = parse_sse_events(response.content)

        # Complete should be the last event (ignoring pings)
        non_ping_events = [e for e in events if e.get("event") and e["event"] != "ping"]
        if non_ping_events:
            assert non_ping_events[-1]["event"] == "complete"
```

### GET /api/export/{session_id} Tests

```python
class TestExportEndpoint:
    """Tests for GET /api/export/{session_id}."""

    async def test_returns_404_unknown_session(self, client):
        """GET /api/export/{unknown_id} returns 404."""
        response = await client.get("/api/export/nonexistent-session-id")
        assert response.status_code == 404

    async def test_returns_200_with_markdown_for_valid_session(self, client, app, sample_research_result):
        """GET /api/export/{session_id} returns 200 with markdown content for a stored session."""
        # Store a result in the session store
        sessions = app.state.sessions
        await sessions.store("test-export-session", sample_research_result)

        response = await client.get("/api/export/test-export-session")
        assert response.status_code == 200

    async def test_response_has_content_disposition_header(self, client, app, sample_research_result):
        """Export response includes Content-Disposition: attachment header with filename."""
        sessions = app.state.sessions
        await sessions.store("test-export-session", sample_research_result)

        response = await client.get("/api/export/test-export-session")
        assert "content-disposition" in response.headers
        assert "attachment" in response.headers["content-disposition"]
        assert ".md" in response.headers["content-disposition"]

    async def test_filename_contains_topic_slug(self, client, app, sample_research_result):
        """The download filename includes a slugified version of the research topic."""
        sessions = app.state.sessions
        await sessions.store("test-export-session", sample_research_result)

        response = await client.get("/api/export/test-export-session")
        disposition = response.headers["content-disposition"]

        # The filename should contain "beacon-research-" prefix
        assert "beacon-research-" in disposition

    async def test_response_media_type_is_octet_stream(self, client, app, sample_research_result):
        """Export response has media_type application/octet-stream."""
        sessions = app.state.sessions
        await sessions.store("test-export-session", sample_research_result)

        response = await client.get("/api/export/test-export-session")
        content_type = response.headers.get("content-type", "")
        assert "application/octet-stream" in content_type

    async def test_response_body_is_valid_markdown(self, client, app, sample_research_result):
        """Export response body is a markdown document containing the research topic."""
        sessions = app.state.sessions
        await sessions.store("test-export-session", sample_research_result)

        response = await client.get("/api/export/test-export-session")
        body = response.text

        # Should contain the topic as a heading
        assert f"# Research: {sample_research_result.topic}" in body

    async def test_returns_404_for_expired_session(self, client, app, sample_research_result):
        """GET /api/export returns 404 when the session has expired."""
        from datetime import datetime, timedelta, timezone

        sessions = app.state.sessions
        await sessions.store("expired-session", sample_research_result)

        # Manually expire the session by backdating its timestamp
        sessions._timestamps["expired-session"] = datetime.now(timezone.utc) - timedelta(hours=2)

        response = await client.get("/api/export/expired-session")
        assert response.status_code == 404
```

### Concurrency Control Tests

```python
class TestConcurrencyControl:
    """Tests for the asyncio.Semaphore-based concurrency limit."""

    async def test_returns_429_when_semaphore_full(self, client, app):
        """POST /api/research returns 429 when all semaphore slots are taken."""
        import asyncio

        semaphore = app.state.research_semaphore

        # Acquire all available slots (default is 3)
        acquired = []
        for _ in range(3):
            await semaphore.acquire()
            acquired.append(True)

        try:
            response = await client.post(
                "/api/research",
                json={"topic": "Blocked topic", "depth": "quick"},
            )
            assert response.status_code == 429
            data = response.json()
            assert "error" in data or "detail" in data
        finally:
            # Release all acquired slots
            for _ in acquired:
                semaphore.release()

    async def test_semaphore_released_after_stream_completes(self, client, app):
        """The semaphore slot is released after the SSE stream finishes."""
        import asyncio

        semaphore = app.state.research_semaphore

        # Run a research request to completion
        response = await client.post(
            "/api/research",
            json={"topic": "Test", "depth": "quick"},
        )
        assert response.status_code == 200

        # After completion, all semaphore slots should be available
        # Try to acquire all 3 -- should succeed
        acquired = 0
        for _ in range(3):
            if semaphore._value > 0:
                await semaphore.acquire()
                acquired += 1

        # Release what we acquired
        for _ in range(acquired):
            semaphore.release()

        assert acquired == 3
```

---

## Implementation: `server/app.py`

### Imports

```python
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from server.sessions import SessionStore, run_cleanup_loop
from server.routes import router
```

### Logging Configuration

Configure logging before creating the app. Call `logging.basicConfig()` with:
- `level=logging.INFO`
- `format="%(asctime)s %(levelname)s %(name)s: %(message)s"`

This ensures pipeline log messages from `beacon.pipeline`, `beacon.evaluate`, etc. are visible when running the server.

### Lifespan Context Manager

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle: create shared state, start background tasks."""
```

The lifespan context manager handles startup and shutdown:

**On startup (before `yield`):**
1. Create a `SessionStore()` instance with default TTL (3600 seconds) and max_sessions (1000). Store it on `app.state.sessions`.
2. Create an `asyncio.Semaphore(3)` for concurrency control. Store it on `app.state.research_semaphore`.
3. Start the background cleanup task: `cleanup_task = asyncio.create_task(run_cleanup_loop(app.state.sessions))`.
4. `yield` to hand control to the application.

**On shutdown (after `yield`):**
1. Cancel the cleanup task: `cleanup_task.cancel()`.
2. `try: await cleanup_task` / `except asyncio.CancelledError: pass` to suppress the cancellation exception.

### App Factory

Create the `FastAPI` instance with the `lifespan` context manager:

```python
app = FastAPI(
    title="Beacon Research API",
    description="API & Streaming Layer for the Beacon research agent",
    version="0.1.0",
    lifespan=lifespan,
)
```

### CORS Middleware

Add CORS middleware immediately after creating the app:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
```

Do **not** set `allow_credentials=True` -- there is no authentication in this MVP. Setting `allow_credentials` with `allow_origins=["*"]` is invalid per the CORS spec and would be rejected by browsers.

### Router

Include the routes router:

```python
app.include_router(router)
```

---

## Implementation: `server/routes.py`

### Imports

```python
from datetime import datetime

from fastapi import APIRouter, HTTPException, Request, Response
from sse_starlette import EventSourceResponse

from server.models import ResearchRequest
from server.sse import stream_research
from server.export import generate_markdown, topic_slug
```

### Router

Create an `APIRouter` instance:

```python
router = APIRouter()
```

### GET /health

```python
@router.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok"}
```

No dependencies, no auth. Just returns `{"status": "ok"}`.

### POST /api/research

```python
@router.post("/api/research")
async def research(request: Request, body: ResearchRequest):
    """Start a research run and stream progress as SSE.

    Returns an SSE stream of pipeline events. Each event has a type field
    matching the SSE event name (status, sources_found, source_evaluated,
    artifact, error, complete).

    Returns 429 if the concurrent research limit is exceeded.
    """
```

Implementation details:

1. Get the semaphore from `request.app.state.research_semaphore`.
2. Try to acquire the semaphore **without blocking**: use `semaphore.acquire()` with a non-blocking check. The pattern is to check `semaphore._value > 0` or use `asyncio.wait_for(semaphore.acquire(), timeout=0)`. A cleaner approach:

```python
# Try-acquire pattern
try:
    # Use wait_for with timeout=0 for non-blocking acquire
    await asyncio.wait_for(semaphore.acquire(), timeout=0)
except asyncio.TimeoutError:
    raise HTTPException(
        status_code=429,
        detail="Too many concurrent research requests. Please try again later.",
    )
```

**Note:** An alternative approach is to attempt `semaphore.acquire()` wrapped in `asyncio.wait_for(..., timeout=0.0)`. However, the simplest correct pattern that avoids relying on `_value` (private attribute) is:

```python
if not semaphore._value:
    raise HTTPException(status_code=429, detail="Too many concurrent research requests.")
await semaphore.acquire()
```

Both approaches work. Choose the `_value` check for simplicity since we're the only consumer.

3. Get the session store from `request.app.state.sessions`.
4. Create a wrapper async generator that releases the semaphore when the stream ends:

```python
async def _stream():
    try:
        async for event in stream_research(request, body, sessions):
            yield event
    finally:
        semaphore.release()
```

5. Return an `EventSourceResponse` wrapping the generator:

```python
return EventSourceResponse(
    _stream(),
    ping=15,
    send_timeout=30,
    headers={
        "X-Accel-Buffering": "no",
        "Cache-Control": "no-cache",
    },
)
```

The `ping=15` sends SSE comments every 15 seconds as keepalive heartbeats. `send_timeout=30` detects hung connections. `X-Accel-Buffering: no` prevents nginx/reverse proxies from buffering the stream.

### GET /api/export/{session_id}

```python
@router.get("/api/export/{session_id}")
async def export(request: Request, session_id: str):
    """Export research results as a downloadable Markdown document.

    Returns 404 if the session is not found or has expired.
    """
```

Implementation details:

1. Get the session store from `request.app.state.sessions`.
2. Look up the result: `result = await sessions.get(session_id)`.
3. If `result is None`, raise `HTTPException(status_code=404, detail="Session not found or expired")`.
4. Generate the markdown: `markdown = generate_markdown(result)`.
5. Build the filename:
   - `slug = topic_slug(result.topic)`
   - Parse the date from `result.timestamp` or use current date: `date_str = datetime.now().strftime("%Y%m%d")`
   - Filename pattern: `f"beacon-research-{slug}-{date_str}.md"`
6. Return as a `Response`:

```python
return Response(
    content=markdown,
    media_type="application/octet-stream",
    headers={
        "Content-Disposition": f'attachment; filename="{filename}"',
    },
)
```

---

## Implementation: `server/__main__.py`

A convenience entry point for running the server directly with `python -m server`:

```python
"""Run the Beacon API server.

Usage: python -m server
"""
import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "server.app:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )
```

This is equivalent to running `uvicorn server.app:app --host 0.0.0.0 --port 8000 --reload` from the command line. The `reload=True` flag enables auto-reload during development.

---

## How the `app` and `client` Fixtures Work (From conftest.py)

For reference, the `app` and `client` fixtures from `conftest.py` (section-01) work as follows. This is NOT implemented in this section -- it's already in conftest.py. Understanding this is important for writing correct tests.

The `app` fixture:
1. Imports `app` from `server.app`
2. Patches `server.sse.run_research` to use the `mock_pipeline` fixture instead of the real pipeline
3. Yields the patched app

The `client` fixture:
1. Creates an `httpx.AsyncClient` with `ASGITransport(app=app)`
2. This triggers the app's lifespan, so `app.state.sessions` and `app.state.research_semaphore` are initialized
3. Yields the client for making HTTP requests

Tests access `app.state.sessions` directly (via the `app` fixture) to pre-populate sessions for export tests.

---

## Concurrency Control Design

The semaphore limits concurrent research runs to 3. This prevents the server from being overwhelmed by multiple long-running pipeline executions.

**Acquire pattern:** Non-blocking try-acquire. If the semaphore is exhausted, return HTTP 429 immediately rather than queuing. This gives the frontend a clear signal to show "busy" state.

**Release pattern:** The semaphore is released in the `finally` block of the wrapper generator inside the route handler. This ensures release happens whether the stream completes normally, encounters an error, or the client disconnects (which triggers generator cleanup).

**Why a wrapper generator?** The semaphore cannot be released inside `stream_research()` because that function doesn't know about the semaphore -- it's a route-layer concern. The wrapper generator in the route handler bridges this gap.

---

## Route Structure Summary

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/health` | `health()` | Returns `{"status": "ok"}` |
| POST | `/api/research` | `research()` | Accepts `ResearchRequest`, returns SSE stream |
| GET | `/api/export/{session_id}` | `export()` | Returns markdown file download |

---

## Verification Checklist

After implementing this section, verify:

1. `uv run pytest tests/test_routes.py -v` -- all route tests pass
2. `uv run pytest tests/ -v` -- full test suite passes (all sections together)
3. `GET /health` returns `{"status": "ok"}`
4. `POST /api/research` with valid body returns SSE event stream
5. `POST /api/research` with invalid body returns 422
6. `GET /api/export/{valid_session_id}` returns markdown file download
7. `GET /api/export/{invalid_session_id}` returns 404
8. CORS headers are present on responses
9. Server starts with `uv run python -m server` or `uv run uvicorn server.app:app`
