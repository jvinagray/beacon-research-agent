# 02 - API & Streaming Layer

## Overview
FastAPI server that wraps the agent pipeline (from split 01) in HTTP endpoints. The primary endpoint streams research progress as Server-Sent Events (SSE). Also provides session management for in-memory results and a Markdown export endpoint.

## Requirements Reference
See `../BEACON_SPEC.md` — API Design section. This split covers the FastAPI server, SSE streaming, session state, and export.

## Dependencies on 01-agent-pipeline
- **Pydantic models**: Source, IntelligenceSignals, Artifact, ResearchResult, PipelineEvent types
- **Pipeline function**: `run_research(topic, depth) -> AsyncGenerator[PipelineEvent, None]`
- This split imports from 01 and wraps it in HTTP

## What This Split Produces

### Endpoints
```
POST /api/research
  Body: { "topic": str, "depth": "quick" | "standard" | "deep" }
  Response: SSE stream (text/event-stream)

GET /api/export/{session_id}?format=markdown
  Response: Markdown file download (application/octet-stream)

GET /health
  Response: { "status": "ok" }
```

### SSE Event Schema
Each SSE event is a JSON object with a `type` field:
```
event: status
data: {"type": "status", "message": "Searching for sources..."}

event: sources_found
data: {"type": "sources_found", "count": 15, "sources": [...]}

event: source_evaluated
data: {"type": "source_evaluated", "index": 3, "total": 15, "source": {...}}

event: artifact
data: {"type": "artifact", "artifact_type": "summary", "data": "..."}

event: error
data: {"type": "error", "message": "Failed to extract content from X", "recoverable": true}

event: complete
data: {"type": "complete", "session_id": "abc123", "summary": {...}}
```

### Session Management
- In-memory dict: `{session_id: ResearchResult}`
- Session ID generated per research run (UUID)
- No persistence — results lost on server restart (acceptable for MVP)
- Session ID returned in the `complete` event so frontend can call export

### Markdown Export
Generates a single Markdown document from a ResearchResult:
- Title + topic + timestamp
- Executive summary
- Ranked source list with intelligence signals
- Concept map
- Flashcards
- Returns as downloadable file

## Key Decisions for /deep-plan
1. **SSE implementation**: `sse-starlette` package vs manual StreamingResponse. How to handle client disconnects mid-stream.
2. **CORS configuration**: Frontend (Lovable) will be on a different origin during development. Need permissive CORS for local dev.
3. **Error propagation**: How pipeline errors (from 01) map to SSE error events. Should the stream continue after non-fatal errors?
4. **Session lifecycle**: When to clean up sessions? Memory limits? (Simple for MVP but need a strategy)
5. **Event ID and retry**: SSE supports `id:` and `retry:` fields for reconnection. Worth implementing for reliability?
6. **Request validation**: Pydantic request model, depth enum validation, rate limiting (probably skip for MVP).

## Technology Stack
- Python 3.11+
- `fastapi` web framework
- `uvicorn` ASGI server
- `sse-starlette` for SSE streaming (or manual implementation)
- `pydantic` for request/response models
- CORS middleware from FastAPI

## Interface to 03-frontend-dashboard
The frontend connects to:
1. `POST /api/research` — opens EventSource-like connection, receives SSE events
2. `GET /api/export/{session_id}?format=markdown` — triggers file download

Frontend needs to know:
- The SSE event type taxonomy (status, sources_found, source_evaluated, artifact, error, complete)
- JSON shape of each event type
- That session_id comes from the `complete` event

## Interview Context
- User sees the API layer as having **substantial own concerns**, not just glue
- SSE event design and error propagation are real architectural decisions
- Local deployment only (uvicorn on localhost), no production hardening needed
