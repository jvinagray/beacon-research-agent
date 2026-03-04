# Implementation Plan: 02-API-Streaming Layer

## 1. Context and Goals

Beacon is an AI research agent that evaluates web sources for "learning efficiency" and synthesizes them into learning materials. The agent pipeline (01-agent-pipeline) is complete — it exposes `run_research(topic, depth)` as an async generator that yields real-time `PipelineEvent` objects.

This plan covers the **API & Streaming Layer** (02-api-streaming): a FastAPI server that wraps the pipeline in HTTP endpoints. The primary concern is streaming pipeline events as Server-Sent Events (SSE) so the React frontend (03-frontend-dashboard) can display real-time research progress.

**Key goals:**
- Stream pipeline events as SSE with proper event typing, heartbeats, and disconnect handling
- Store completed research results in-memory for subsequent export (only when results are meaningful)
- Generate downloadable Markdown documents from research results
- Handle errors gracefully — recoverable errors continue the stream, fatal errors are forwarded from the pipeline
- Limit concurrent research runs to prevent API overload

## 2. Project Structure

```
02-api-streaming/
├── pyproject.toml
├── server/
│   ├── __init__.py
│   ├── app.py              # FastAPI app factory, CORS, lifespan, logging
│   ├── routes.py            # Endpoint definitions (research, export, health)
│   ├── sse.py               # SSE event formatting and streaming logic
│   ├── sessions.py          # In-memory session store with TTL + cleanup
│   └── export.py            # Markdown document generation
└── tests/
    ├── conftest.py          # Fixtures: mock pipeline, test client, session store
    ├── test_routes.py       # Endpoint integration tests (including SSE parsing)
    ├── test_sse.py          # SSE event formatting and generator tests
    ├── test_sessions.py     # Session store lifecycle and concurrency tests
    └── test_export.py       # Markdown generation tests
```

## 3. Package Configuration

The `pyproject.toml` uses `hatchling` as the build backend (matching the pipeline's convention) and declares `beacon` as a path dependency via `[tool.uv.sources]`.

**Core dependencies:** `fastapi`, `uvicorn`, `sse-starlette` (v3.3+), `pydantic` (v2.10+).

**Dev dependencies:** `pytest`, `pytest-asyncio`, `httpx` (for `AsyncClient` test client).

**Path dependency syntax for uv:**
```toml
[project]
name = "beacon-api"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "beacon",
    "fastapi>=0.115.0",
    "uvicorn>=0.34.0",
    "sse-starlette>=3.3.0",
    "pydantic>=2.10.0",
]

[tool.uv.sources]
beacon = { path = "../01-agent-pipeline" }

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
```

This is the correct syntax for `uv` with `hatchling`. The `beacon` dependency is listed in `[project.dependencies]` and the path is specified in `[tool.uv.sources]`.

## 4. FastAPI Application (app.py)

### App Factory

Create the FastAPI application with a `lifespan` context manager. The lifespan:
1. Creates the session store instance and stores it on `app.state.sessions`
2. Creates the research semaphore and stores it on `app.state.research_semaphore`
3. Starts the background session cleanup task
4. On shutdown, cancels the cleanup task

### Logging Configuration

Configure logging at app startup. Use `logging.basicConfig()` with level `INFO` and a format that includes timestamps. This ensures pipeline log messages (from `beacon.pipeline`, `beacon.evaluate`, etc.) are visible when running the server.

### CORS Middleware

Add `CORSMiddleware` with `allow_origins=["*"]`, `allow_methods=["*"]`, `allow_headers=["*"]`. No `allow_credentials` — there is no authentication in this MVP. This is hardcoded for local development (Lovable frontend on a different origin).

### Router

Include the routes from `routes.py` on the app.

## 5. Request/Response Models

Define Pydantic models for the API:

```python
class ResearchRequest(BaseModel):
    """POST /api/research request body."""
    topic: str
    depth: Literal["quick", "standard", "deep"]
```

For the `complete` SSE event, create a lightweight summary that excludes the full `ResearchResult` (which contains large deep-read content). The wire format for the complete event is:

```python
class CompleteSummary(BaseModel):
    """Sent as SSE complete event data."""
    type: Literal["complete"] = "complete"
    session_id: str
    summary: ResearchSummary

class ResearchSummary(BaseModel):
    """Nested summary within complete event."""
    topic: str
    depth: str
    source_count: int
    artifact_types: list[str]
```

This produces the following SSE wire format:
```
event: complete
id: 20
data: {"type": "complete", "session_id": "abc123", "summary": {"topic": "...", "depth": "standard", "source_count": 15, "artifact_types": ["summary", "concept_map", "flashcards", "resources"]}}
```

## 6. SSE Streaming (sse.py)

This is the core architectural component. The module converts pipeline events into SSE-formatted events using `sse-starlette`.

### Event Formatting

```python
def format_sse_event(event: PipelineEvent, event_id: int) -> ServerSentEvent:
    """Convert a pipeline event into an SSE ServerSentEvent.

    Uses the event's type field as the SSE event name.
    Serializes the event data as JSON.
    Includes sequential event_id for client reconnection support.
    For CompleteEvent, sends CompleteSummary instead of full ResearchResult.
    """
```

The `event` field is set to the pipeline event's `type` value (e.g., "status", "sources_found", etc.). The `data` field is the event serialized to JSON via `model_dump_json()`. The `id` field is the sequential integer.

**Special handling for CompleteEvent:** Extract fields from `CompleteEvent.result` to construct a `CompleteSummary`. The full `ResearchResult` is NOT sent over SSE — it's stored in the session store for later export.

### Stream Generator

```python
async def stream_research(
    request: Request,
    research_request: ResearchRequest,
    sessions: SessionStore,
) -> AsyncGenerator[ServerSentEvent, None]:
    """Stream pipeline events as SSE.

    Wraps run_research(), formats events, handles disconnects,
    and stores results on completion.
    """
```

The generator:
1. Calls `run_research(topic, depth)` and iterates over yielded events
2. Maintains a sequential event counter (starting at 1)
3. For each event, checks `request.is_disconnected()` as a defense-in-depth exit point (sse-starlette also handles disconnects via `CancelledError`)
4. Formats each event via `format_sse_event` and yields it
5. On `CompleteEvent`, stores the `ResearchResult` in the session store **only if the result has meaningful content** (non-empty `sources` or non-empty `artifacts`). This prevents storing failed/empty results that would produce useless exports.
6. All pipeline errors arrive as yielded `ErrorEvent` objects — the API layer forwards them as-is

**Important design note:** The pipeline (`run_research()`) handles all its own error recovery internally. It catches exceptions, yields `ErrorEvent(recoverable=False)`, and always yields a `CompleteEvent` at the end (even with empty results on failure). The API layer does **not** implement retry logic — it simply forwards pipeline events. This avoids duplicate events, session ID confusion, and unnecessary complexity.

### EventSourceResponse

The route wraps the generator in `EventSourceResponse` from `sse-starlette`:
- `ping=15` — 15-second heartbeat keepalive (ensures sends happen frequently, preventing connection timeouts during long pipeline stages like synthesis)
- `send_timeout=30` — detect hung connections
- Additional headers: `X-Accel-Buffering: no` (for proxy compatibility), `Cache-Control: no-cache`

## 7. Session Management (sessions.py)

### SessionStore Class

An in-memory store backed by a dict and protected by `asyncio.Lock` for check-then-act operations. The lock is needed because `get()` performs conditional mutation (delete-if-expired or update-timestamp) and `store()` may need to evict before inserting.

```python
class SessionStore:
    """In-memory session store with TTL and background cleanup.

    Stores ResearchResult objects indexed by session_id (UUID4).
    Implements lazy expiration on access + periodic background sweep.
    """

    def __init__(self, ttl_seconds: int = 3600, max_sessions: int = 1000): ...
    async def store(self, session_id: str, result: ResearchResult) -> None: ...
    async def get(self, session_id: str) -> ResearchResult | None: ...
    async def cleanup_expired(self) -> int: ...
```

**Internal state:**
- `_sessions: dict[str, ResearchResult]` — the actual data
- `_timestamps: dict[str, datetime]` — last access time per session (for sliding TTL)
- `_lock: asyncio.Lock` — protects check-then-act sequences
- `_ttl: timedelta` — session expiration (default 60 minutes)
- `_max_sessions: int` — upper bound (default 1000)

### Store Behavior

**`store()`**: Acquires lock. If max_sessions reached, evicts the oldest session (by timestamp). Stores the result and records current time.

**`get()`**: Acquires lock. If session not found, returns None. If expired (current time - stored timestamp > TTL), removes and returns None. Otherwise, updates timestamp (sliding window) and returns the result.

**`cleanup_expired()`**: Acquires lock. Scans all sessions, removes any where `now - timestamp > ttl`. Returns count of removed sessions. Called by the background task.

### Background Cleanup Task

A coroutine that runs `cleanup_expired()` every 60 seconds in an infinite loop. Started in the app's `lifespan` context manager, cancelled on shutdown. Wraps the cleanup call in a try/except to prevent the task from dying on unexpected errors.

## 8. Error Handling Strategy

### Pipeline Error Model

The pipeline (`run_research()`) handles all errors internally:
- **Recoverable errors** (extraction failure, one source timeout): Yields `ErrorEvent(recoverable=True)`, continues processing
- **Fatal errors** (search failure, no sources, config error, unexpected exception): Yields `ErrorEvent(recoverable=False)`, then yields `CompleteEvent` with empty results

The pipeline **never raises unhandled exceptions** to the caller (except `GeneratorExit`). All errors arrive as yielded event objects.

### API Layer Behavior

The API layer simply forwards all pipeline events as SSE:
1. `ErrorEvent(recoverable=True)` → SSE `event: error` with `recoverable: true`. Stream continues.
2. `ErrorEvent(recoverable=False)` → SSE `event: error` with `recoverable: false`. The pipeline will follow with a `CompleteEvent`.
3. `CompleteEvent` after fatal error → SSE `event: complete` with summary. Result is **not** stored in the session store (empty results). The stream ends naturally.

No retry logic in the API layer. If the user wants to retry, they submit a new research request from the frontend.

### Pre-Stream Errors

- Request validation failures: HTTP 422 (FastAPI automatic via Pydantic)
- Concurrency limit exceeded: HTTP 429 (see Section 9)

## 9. Routes (routes.py)

### Concurrency Control

A module-level or app-state `asyncio.Semaphore(3)` limits concurrent research runs. Each `POST /api/research` acquires the semaphore before starting. If the semaphore is full, return HTTP 429 (Too Many Requests) with a JSON error message. Use `semaphore.acquire()` with a zero timeout (try-acquire pattern) rather than blocking.

### POST /api/research

Accepts `ResearchRequest` body. Attempts to acquire the research semaphore. If acquired, returns `EventSourceResponse` wrapping the `stream_research` generator (which releases the semaphore when done). The session store is accessed from `request.app.state.sessions`.

### GET /api/export/{session_id}

Accepts `session_id` as a path parameter and optional `format` query param (default: "markdown", only supported value for MVP).

Behavior:
1. Look up session_id in the session store
2. If not found, raise `HTTPException(404)` with message "Session not found or expired"
3. Call the markdown export function to generate the document
4. Return as `Response` with:
   - `media_type="application/octet-stream"`
   - `Content-Disposition: attachment; filename="beacon-research-{topic_slug}-{date}.md"`

**Topic slug algorithm:** `unicodedata.normalize('NFKD')` → encode to ASCII (ignore errors) → decode → lowercase → regex `[^a-z0-9]+` replace with hyphens → strip leading/trailing hyphens → truncate to 50 characters. This handles Unicode topics, Windows-unsafe characters, and produces clean filenames.

### GET /health

Returns `{"status": "ok"}`. No dependencies, no auth.

## 10. Markdown Export (export.py)

### Generation Function

```python
def generate_markdown(result: ResearchResult) -> str:
    """Generate a complete Markdown document from a ResearchResult.

    Includes all artifacts and full intelligence signals for each source.
    Handles type variations in artifact values defensively.
    Returns the markdown as a string.
    """
```

### Document Structure

1. **Header**: `# Research: {topic}` with metadata line showing depth, date, and source count
2. **Executive Summary**: The `summary` artifact. Rendered as-is (already markdown from synthesis).
3. **Sources (Ranked by Learning Efficiency)**: Each source as a subsection with title, URL, score badge, content type, time estimate, recency, key insight, and coverage topics. Sources ordered by `learning_efficiency_score` descending.
4. **Concept Map**: The `concept_map` artifact. Rendered as-is (indented outline from synthesis).
5. **Flashcards**: Each flashcard as a numbered Q&A pair.
6. **Resources**: The `resources` artifact.
7. **Footer**: "Generated by Beacon Research Agent"

### Defensive Type Handling for Artifacts

`ResearchResult.artifacts` is typed as `dict[str, Any]`. The export function must handle each artifact type defensively:

- **`summary`** (expected: `str`): Render as-is. If not a string, call `str()`.
- **`concept_map`** (expected: `str`): Render as-is. If not a string, call `str()`.
- **`flashcards`** (expected: `list[Flashcard]` or JSON string): If it's a list of `Flashcard` objects, iterate and format. If it's a JSON string, parse with `json.loads()` into dicts and format. If parsing fails, render as raw text.
- **`resources`** (expected: JSON string from `json.dumps()`): Try `json.loads()` to get structured data, format as a readable list. If parsing fails, render as raw text.
- **Missing keys**: Skip the section with a note like "*(Not generated)*"
- **`None` values**: Same as missing — skip with a note.
- **Unexpected keys**: Ignore (don't render unknown artifact types).

## 11. Environment and Server Configuration

### .env File

The pipeline's `get_config()` calls `load_dotenv()` to load API keys. When running the server from `02-api-streaming/`, the `.env` file must be accessible. Options:
- Place a `.env` file in `02-api-streaming/` with `ANTHROPIC_API_KEY` and `TAVILY_API_KEY`
- Or set environment variables directly before running uvicorn

Include a `.env.example` file in `02-api-streaming/` documenting the required variables.

### Running the Server

```
uvicorn server.app:app --host 0.0.0.0 --port 8000 --reload
```

Single worker (default) — required because in-memory sessions don't work across workers. The `--reload` flag is for development.

Alternatively, add a `__main__.py` that runs uvicorn programmatically for convenience.

## 12. Key Implementation Notes

### Pipeline Interface

The pipeline's `run_research()` handles its own `session_id` generation (UUID4) and includes it in `CompleteEvent.result.session_id`. The API layer uses this same session_id — it doesn't generate its own.

### Event Serialization

All `PipelineEvent` types are Pydantic models with `.model_dump_json()` for serialization. The `ArtifactEvent.data` field can be either a string or a `list[Flashcard]` — Pydantic handles serialization of both.

### Async Generator Lifecycle

When a client disconnects mid-stream, `sse-starlette` raises `asyncio.CancelledError` in the generator. The pipeline's own `finally` block cancels any outstanding tasks. This cascading cleanup is automatic.

### Import Structure

```python
from beacon.pipeline import run_research
from beacon.models import (
    PipelineEvent, StatusEvent, SourcesFoundEvent, SourceEvaluatedEvent,
    ArtifactEvent, ErrorEvent, CompleteEvent,
    ResearchResult, EvaluatedSource, Flashcard,
)
```

### Testing SSE Endpoints

Testing SSE responses requires streaming the response and parsing `text/event-stream` format. Use `httpx.AsyncClient` with `stream()` context manager on the response. Write a small helper that reads lines from the stream and parses SSE events (splitting on blank lines, extracting `event:`, `data:`, and `id:` fields). For unit tests, test the `stream_research` generator directly by mocking `run_research` to yield controlled events, avoiding HTTP overhead.

## 13. Summary of Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| SSE library | `sse-starlette` | W3C compliance, built-in ping/disconnect, well-maintained |
| Event IDs | Sequential integers per stream | Enables `Last-Event-ID` reconnection; no server-side resume for MVP |
| Session storage | In-memory dict + asyncio.Lock | Simple for MVP; single worker; no persistence needed |
| Session cleanup | Lazy + background (60s) | Prevents unbounded memory; TTL=60min, max=1000 |
| Session filtering | Only store results with content | Prevents useless exports from failed research runs |
| Error handling | Forward pipeline events as-is | Pipeline handles all error recovery internally; no API-layer retry |
| Concurrency limit | asyncio.Semaphore(3) | Prevents API overload from concurrent pipeline runs |
| CORS | Allow all origins, no credentials | Local-only deployment; no auth in MVP |
| Complete event | Lightweight summary (not full result) | Avoids sending large deep-read content over SSE |
| Markdown export | All artifacts + full signals, defensive typing | Maximum value; handles dict[str, Any] robustly |
| Package structure | Separate pyproject.toml, uv path dep | Independent split; correct uv syntax |
| Path dependency | `[tool.uv.sources]` section | Correct syntax for uv + hatchling |
