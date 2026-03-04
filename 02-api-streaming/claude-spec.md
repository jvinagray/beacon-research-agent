# Complete Specification: 02-API-Streaming Layer

## 1. Overview

FastAPI server that wraps the Beacon agent pipeline (from 01-agent-pipeline) in HTTP endpoints. The primary endpoint streams research progress as Server-Sent Events (SSE) using `sse-starlette`. Also provides in-memory session management and a Markdown export endpoint for downloading complete research results.

This is part of the Beacon project — an AI research agent for the Megadata AI Build Challenge. The API layer sits between the pipeline (01) and the Lovable React frontend (03).

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  03-frontend-dashboard (React)                                │
│  POST /api/research → SSE stream                             │
│  GET /api/export/{session_id} → Markdown download            │
└──────────────────┬───────────────────────────────────────────┘
                   │ HTTP
┌──────────────────▼───────────────────────────────────────────┐
│  02-api-streaming (FastAPI + sse-starlette)                   │
│                                                               │
│  ┌─────────────┐  ┌────────────────┐  ┌──────────────────┐  │
│  │ SSE Endpoint │  │ Session Store   │  │ Markdown Export  │  │
│  │ POST /api/   │  │ (in-memory     │  │ GET /api/export/ │  │
│  │ research     │  │  dict + TTL)   │  │ {session_id}     │  │
│  └──────┬───────┘  └────────────────┘  └──────────────────┘  │
│         │                                                     │
│         │ async generator                                     │
│  ┌──────▼───────────────────────────────────────────────────┐│
│  │ beacon.pipeline.run_research(topic, depth)                ││
│  │ → AsyncGenerator[PipelineEvent, None]                     ││
│  └───────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

## 3. Package Structure

```
02-api-streaming/
├── pyproject.toml              # Dependencies + path dep to ../01-agent-pipeline
├── server/
│   ├── __init__.py
│   ├── app.py                  # FastAPI app creation, CORS, lifespan
│   ├── routes.py               # Endpoint definitions
│   ├── sse.py                  # SSE event formatting + streaming logic
│   ├── sessions.py             # In-memory session store with TTL
│   └── export.py               # Markdown generation from ResearchResult
└── tests/
    ├── conftest.py             # Shared fixtures (mock pipeline, test client)
    ├── test_routes.py          # Endpoint integration tests
    ├── test_sse.py             # SSE formatting + streaming tests
    ├── test_sessions.py        # Session store lifecycle tests
    └── test_export.py          # Markdown export tests
```

## 4. Dependencies

### pyproject.toml
```toml
[project]
name = "beacon-api"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "beacon @ file:///${PROJECT_ROOT}/../01-agent-pipeline",
    "fastapi>=0.115.0",
    "uvicorn>=0.34.0",
    "sse-starlette>=3.3.0",
    "pydantic>=2.10.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0",
    "pytest-asyncio>=0.25.0",
    "httpx>=0.28.0",
]
```

Note: The exact path dependency syntax may need adjustment for uv — `beacon` is imported from `../01-agent-pipeline` which has its own `pyproject.toml` with `hatchling` build backend.

## 5. Endpoints

### POST /api/research
- **Request body**: `{"topic": str, "depth": "quick" | "standard" | "deep"}`
- **Response**: SSE stream (`text/event-stream`)
- **Behavior**:
  1. Validate request (Pydantic model with depth enum)
  2. Generate session_id (UUID4)
  3. Call `run_research(topic, depth)` → async generator
  4. Stream each PipelineEvent as an SSE event with sequential `id` field
  5. On `CompleteEvent`, store ResearchResult in session store
  6. On fatal error after retry, send error event and close stream
  7. Handle client disconnect via `request.is_disconnected()` + `CancelledError`

### GET /api/export/{session_id}
- **Query params**: `format=markdown` (only format for MVP)
- **Response**: Markdown file download (`application/octet-stream`)
- **Behavior**:
  1. Look up session_id in session store
  2. If not found, return 404
  3. Generate Markdown document from ResearchResult
  4. Return as downloadable file with `Content-Disposition` header

### GET /health
- **Response**: `{"status": "ok"}`

## 6. SSE Event Schema

Each SSE event uses the pipeline event's `type` as the SSE `event` field. Events have sequential `id` fields for reconnection support.

```
event: status
id: 1
data: {"type": "status", "message": "Searching for sources..."}

event: sources_found
id: 2
data: {"type": "sources_found", "count": 15, "sources": [{url, title, snippet}, ...]}

event: source_evaluated
id: 3
data: {"type": "source_evaluated", "index": 1, "total": 15, "source": {url, title, snippet, signals: {learning_efficiency_score, content_type, time_estimate_minutes, recency, key_insight, coverage}}}

event: artifact
id: 14
data: {"type": "artifact", "artifact_type": "summary", "data": "..."}

event: error
id: 8
data: {"type": "error", "message": "Failed to extract content from X", "recoverable": true}

event: complete
id: 20
data: {"type": "complete", "session_id": "abc123", "summary": {topic, depth, source_count, artifact_types}}
```

## 7. SSE Streaming Implementation

### Library: sse-starlette
- `EventSourceResponse` wraps the async generator
- `ping=15` for heartbeat keepalive
- `send_timeout=30` for hung connection detection
- `X-Accel-Buffering: no` header for proxy compatibility

### Client disconnect handling
1. Check `request.is_disconnected()` at start of each loop iteration
2. Catch `asyncio.CancelledError` — perform cleanup, then re-raise
3. `send_timeout` catches hanging connections

### Event ID sequencing
- Sequential integer IDs starting at 1 per stream
- Enables `Last-Event-ID` header on client reconnect
- For MVP: include IDs but don't implement server-side resume-from-ID (would require event buffering)

## 8. Error Handling Strategy

### Recoverable errors (from pipeline)
- Pipeline yields `ErrorEvent(recoverable=True)` for non-fatal issues (extraction failures, timeout on one source)
- Forward as SSE `event: error` with `recoverable: true`
- Stream continues normally

### Fatal errors
- Pipeline yields `ErrorEvent(recoverable=False)` or raises an exception
- **Retry once**: If a fatal error occurs, retry the failed operation once
- If retry fails: Send SSE `event: error` with `recoverable: false`, then close stream
- Examples: Anthropic API auth failure, Tavily returns zero results, unexpected exception

### Pre-stream errors
- Request validation failures: Return HTTP 422 (FastAPI automatic via Pydantic)
- Pipeline initialization failures: Return HTTP 500 with error JSON

## 9. Session Management

### Store: In-memory dict
```python
{session_id: ResearchResult}
```

### Configuration
- **TTL**: 60 minutes (sliding window, reset on access)
- **Max sessions**: 1000
- **Cleanup**: Lazy (check on access) + background task (every 60s sweep)
- **Session ID**: UUID4

### Lifecycle
1. **Create**: On `CompleteEvent`, store result with session_id and timestamp
2. **Access**: On export request, look up by ID, check expiration, update timestamp
3. **Expire**: Background task removes sessions older than TTL
4. **Evict**: If max_sessions reached, evict oldest session

### Concurrency
- `asyncio.Lock` for check-then-act patterns (create, evict)
- Simple reads without await between them are safe without lock
- Single uvicorn worker for MVP (no cross-process session sharing needed)

### Lifespan
- Background cleanup task started in FastAPI's `lifespan` context manager
- Cancelled on server shutdown

## 10. Markdown Export

Generate a single Markdown document from a `ResearchResult` containing ALL artifacts and full intelligence signals.

### Document Structure
```markdown
# Research: {topic}

**Depth:** {depth} | **Date:** {timestamp} | **Sources:** {count}

---

## Executive Summary

{summary artifact text}

---

## Sources (Ranked by Learning Efficiency)

### 1. {title} — Score: {score}/10
- **URL:** {url}
- **Content Type:** {content_type}
- **Time Estimate:** {time_estimate_minutes} min
- **Recency:** {recency}
- **Key Insight:** {key_insight}
- **Coverage:** {coverage topics joined}

[...repeated for each source...]

---

## Concept Map

{concept_map artifact text}

---

## Flashcards

### Card 1
**Q:** {question}
**A:** {answer}

[...repeated for each flashcard...]

---

## Resources

{resources artifact data}

---

*Generated by Beacon Research Agent*
```

### File download
- Content-Type: `application/octet-stream`
- Content-Disposition: `attachment; filename="beacon-research-{topic-slug}-{date}.md"`

## 11. CORS Configuration

Hardcoded permissive CORS for MVP (local development only):
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

## 12. Server Configuration

- `uvicorn` ASGI server
- Single worker (required for in-memory sessions)
- Host: `0.0.0.0`, Port: `8000` (configurable via env)
- Local deployment only, no production hardening

## 13. Interface Contracts

### From 01-agent-pipeline (imports)
```python
from beacon.pipeline import run_research
from beacon.models import (
    Source, EvaluatedSource, IntelligenceSignals,
    ResearchResult, Flashcard,
    StatusEvent, SourcesFoundEvent, SourceEvaluatedEvent,
    ArtifactEvent, ErrorEvent, CompleteEvent,
    PipelineEvent,  # Union type
)
```

### To 03-frontend-dashboard (provides)
- SSE event taxonomy: status, sources_found, source_evaluated, artifact, error, complete
- JSON shape of each event type (as defined in section 6)
- session_id from the `complete` event for export endpoint
- POST-based SSE (frontend uses fetch + ReadableStream, not EventSource)
