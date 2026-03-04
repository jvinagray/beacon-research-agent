# Research Findings: 02-API-Streaming

## Part 1: Codebase Analysis

### Project Overview

**Beacon** is an AI research agent for the Megadata AI Build Challenge (deadline: March 10, 2026). Multi-part system that evaluates sources for "learning efficiency" and synthesizes them into learning materials.

**Tech Stack:** Python 3.11+ / FastAPI / Anthropic Claude API / Tavily API / Lovable React frontend

### Project Structure
```
hackathon/
├── BEACON_SPEC.md              # Master product specification
├── project-manifest.md         # Split dependency documentation
├── 01-agent-pipeline/          # COMPLETE - Core research agent
│   ├── beacon/                 # Main package (9 Python modules)
│   ├── tests/                  # 100+ tests across 9 files
│   └── pyproject.toml          # uv package manager, hatchling build
├── 02-api-streaming/           # THIS SPLIT - FastAPI wrapper
└── 03-frontend-dashboard/      # PLANNED - Lovable React app
```

### 01-Agent-Pipeline: Key Interfaces for 02

#### Pydantic Models (beacon/models.py)

**Source:**
```python
class Source(BaseModel):
    url: str
    title: str
    snippet: str
```

**IntelligenceSignals:**
```python
class IntelligenceSignals(BaseModel):
    learning_efficiency_score: int  # 0-10 scale
    content_type: Literal["tutorial", "paper", "docs", "opinion", "video",
                          "forum", "repository", "course", "other"]
    time_estimate_minutes: int
    recency: str | None
    key_insight: str
    coverage: list[str]
    evaluation_failed: bool = False
```

**EvaluatedSource:**
```python
class EvaluatedSource(BaseModel):
    url: str
    title: str
    snippet: str
    signals: IntelligenceSignals
    deep_read_content: str | None
    extraction_method: str | None
```

**ResearchResult:**
```python
class ResearchResult(BaseModel):
    topic: str
    depth: str
    sources: list[EvaluatedSource]
    artifacts: dict[str, Any]  # summary, concept_map, flashcards, resources
    session_id: str
    timestamp: str
```

**Pipeline Event Types (Union):**
- `StatusEvent` - Status message updates
- `SourcesFoundEvent` - Search results discovered
- `SourceEvaluatedEvent` - Per-source evaluation complete
- `ArtifactEvent` - Generated learning artifact
- `ErrorEvent` - Errors (with `recoverable` flag)
- `CompleteEvent` - Pipeline finished (includes ResearchResult)

#### Pipeline Function (beacon/pipeline.py)

```python
async def run_research(
    topic: str,
    depth: str,  # "quick" | "standard" | "deep"
) -> AsyncGenerator[PipelineEvent, None]:
```

**Pipeline Flow:** SEARCH → EVALUATE → EXTRACT → SYNTHESIZE → COMPLETE

**Key behaviors:**
- Yields events as they occur (async generator)
- Concurrent evaluation with semaphore (limit=10)
- Graceful degradation: failed evaluations get default signals (score=0)
- Recoverable errors logged, pipeline continues
- Fatal errors halt gracefully

#### Dependencies (pyproject.toml)
```
anthropic>=0.52.0
tavily-python>=0.5.0
trafilatura>=2.0.0
httpx>=0.28.0
pydantic>=2.10.0
python-dotenv>=1.0.0
```

**Dev deps:** pytest>=8.0, pytest-asyncio>=0.25.0, respx>=0.22.0

### Code Conventions
- PEP 8, type hints throughout
- asyncio-first, no blocking calls in async functions
- Graceful degradation (fail fast, provide defaults)
- Python logging module, semantic messages
- Dependency injection: client objects as optional parameters
- Queue-based streaming for real-time progress
- Pydantic for all data models

### Testing Patterns
- **Framework:** pytest + pytest-asyncio
- **Fixtures:** Shared mocks in conftest.py
- **Async tests:** `@pytest.mark.asyncio` decorator
- **Mock strategy:** MagicMock/AsyncMock for Anthropic, Tavily clients
- **Boundary testing:** min/max values, empty lists, edge cases
- **Exception testing:** Timeout, JSON parse errors, API failures

---

## Part 2: Web Research - FastAPI SSE Streaming

### sse-starlette vs Manual StreamingResponse

**Recommendation: Use `sse-starlette` (v3.3.2, Feb 2026)**

| Aspect | `sse-starlette` | Manual `StreamingResponse` |
|---|---|---|
| Content-Type | Automatic `text/event-stream` | Must set manually |
| SSE Format | Handles event/data/id/retry serialization | Format strings yourself |
| Client Disconnect | Built-in detection + CancelledError propagation | Manual `request.is_disconnected()` |
| Heartbeat/Ping | Built-in `ping` parameter (default 15s) | Implement own keepalive |
| Graceful Shutdown | `shutdown_event` + `shutdown_grace_period` | Implement shutdown coordination |
| W3C Compliance | Follows W3C SSE spec | Easy to produce non-compliant output |

**Usage pattern:**
```python
from sse_starlette import EventSourceResponse, ServerSentEvent

@app.post("/api/research")
async def research_endpoint(request: Request, body: ResearchRequest):
    async def event_generator():
        try:
            async for event in run_research(body.topic, body.depth):
                if await request.is_disconnected():
                    break
                yield ServerSentEvent(
                    data=event.model_dump_json(),
                    event=event.type,
                    id=str(sequence_number)
                )
        except asyncio.CancelledError:
            raise  # Always re-raise for proper cleanup

    return EventSourceResponse(
        event_generator(),
        ping=15,
        send_timeout=30,
        headers={"X-Accel-Buffering": "no"}
    )
```

### Client Disconnect Handling

Three complementary methods:
1. **`request.is_disconnected()`** — Poll at start of each loop iteration
2. **`asyncio.CancelledError`** — Raised automatically, **always re-raise** after cleanup
3. **`send_timeout`** — Detects hanging connections

### SSE Event Format

Four standard fields: `event`, `data`, `id`, `retry`. Messages delimited by `\n\n`.

**Required HTTP headers:**
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-Accel-Buffering: no
```

**Browser limitation:** HTTP/1.1 limits to 6 concurrent SSE connections per domain. HTTP/2 raises to ~100.

### Event Naming Conventions

Industry patterns observed:
- Hierarchical dot-notation (OpenAI): `response.output_text.delta`
- Lifecycle suffixes (Anthropic): `content_block_start`, `content_block_delta`, `content_block_stop`
- Category:action: `deployment:completed`

For Beacon, the spec already defines a clean taxonomy: `status`, `sources_found`, `source_evaluated`, `artifact`, `error`, `complete`.

---

## Part 3: Web Research - SSE Error Propagation

### Error Classification

**Recoverable errors** — Send `event: error` with `recoverable: true`, stream continues:
```json
{"type": "error", "message": "Failed to extract content from X", "recoverable": true}
```

**Fatal errors** — Send `event: error` with `recoverable: false`, close stream:
```json
{"type": "error", "message": "Authentication failed", "recoverable": false}
```

### Best Practices
1. Use structured error schema consistently (type, message, recoverable)
2. Always use `event: error` as SSE event name
3. Include error `type` for programmatic handling
4. Include `recoverable` boolean
5. Once SSE stream is established (HTTP 200), all errors must be in-band events
6. Use explicit `event: complete` for normal completion (don't rely on stream closure)

### Completion vs Error Termination
- **Normal completion:** Send `event: complete` with result data, then close
- **Error termination:** Send `event: error` with details, then close
- Both Anthropic and OpenAI use explicit typed events for both cases

### Client Reconnection Support
- Set `id` on every event for `Last-Event-ID` reconnection
- Set `retry` to control reconnection timing
- For MVP, basic `id` support is worth implementing; full resume-from-ID can be deferred

---

## Part 4: Web Research - In-Memory Session Management

### Recommended Pattern for MVP

Simple dict with `asyncio.Lock` for check-then-act patterns:

```python
class SessionStore:
    def __init__(self, ttl_seconds=3600, max_sessions=1000):
        self._sessions: dict[str, ResearchResult] = {}
        self._timestamps: dict[str, datetime] = {}
        self._lock = asyncio.Lock()
        self._ttl = timedelta(seconds=ttl_seconds)
        self._max_sessions = max_sessions
```

### Key Design Decisions

1. **UUID4 for session IDs** — Standard, unguessable, no external deps
2. **Lazy + background cleanup** — Check TTL on access AND periodic sweep
3. **TTL: 30-60 minutes** — Sliding window (reset on access)
4. **Max sessions: 1000** — Prevents unbounded memory growth
5. **Single worker for MVP** — In-memory sessions don't work across workers

### Thread-Safety in asyncio

- Simple dict reads/writes without `await` between them are safe
- Check-then-act patterns with `await` in between need `asyncio.Lock`
- `asyncio.Lock` protects against concurrent coroutines, not OS threads
- For MVP with single worker, this is sufficient

### Background Cleanup

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    cleanup_task = asyncio.create_task(periodic_cleanup())
    yield
    cleanup_task.cancel()
```

### Production Migration Path
- For multiple workers: migrate to Redis
- For persistence: Redis or database backend
- MVP: single uvicorn worker is acceptable

---

## Testing Context

### Existing Test Setup (from 01-agent-pipeline)
- pytest + pytest-asyncio
- conftest.py with shared fixtures
- AsyncMock for API clients
- respx for httpx mocking
- No httpx test client for FastAPI yet (will need `httpx` + `TestClient` or `AsyncClient`)

### Testing Recommendations for 02-api-streaming
- Use `httpx.AsyncClient` with FastAPI's `TestClient` for endpoint testing
- Use `pytest-asyncio` (already in dev deps)
- Mock `run_research` to yield controlled events
- Test SSE event format parsing
- Test error event propagation
- Test session lifecycle (create, access, expire, cleanup)
- Test markdown export generation
- Test CORS headers
- Test client disconnect handling
