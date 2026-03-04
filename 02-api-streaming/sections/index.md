<!-- PROJECT_CONFIG
runtime: python-uv
test_command: uv run pytest
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-foundation
section-02-models
section-03-sessions
section-04-export
section-05-sse
section-06-routes-app
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-foundation | - | 02, 03, 04 | Yes |
| section-02-models | 01 | 05, 06 | Yes (with 03, 04) |
| section-03-sessions | 01 | 05, 06 | Yes (with 02, 04) |
| section-04-export | 01 | 06 | Yes (with 02, 03) |
| section-05-sse | 02, 03 | 06 | No |
| section-06-routes-app | 03, 04, 05 | - | No |

## Execution Order

1. section-01-foundation (no dependencies)
2. section-02-models, section-03-sessions, section-04-export (parallel after 01)
3. section-05-sse (requires 02 AND 03)
4. section-06-routes-app (requires 03, 04, AND 05)

## Section Summaries

### section-01-foundation
Project scaffolding: `pyproject.toml` with uv path dependency on `01-agent-pipeline`, directory structure (`server/`, `tests/`), `__init__.py` files, `.env.example`, and `conftest.py` with base test fixtures (mock pipeline generator, sample ResearchResult/EvaluatedSource/Flashcard data, session store fixture, httpx AsyncClient fixture).

**Plan sections covered:** 2 (Project Structure), 3 (Package Configuration), Testing Fixtures
**TDD sections covered:** Package Configuration verification, conftest.py fixtures
**Files:** `pyproject.toml`, `server/__init__.py`, `tests/__init__.py`, `tests/conftest.py`, `.env.example`

### section-02-models
Pydantic request/response models for the API layer: `ResearchRequest` (with `topic` and `depth` enum), `ResearchSummary`, and `CompleteSummary`. These are the API-specific models separate from the pipeline's domain models. Also includes the model validation tests.

**Plan sections covered:** 5 (Request/Response Models)
**TDD sections covered:** ResearchRequest validation tests, CompleteSummary serialization tests
**Files:** `server/models.py`, `tests/test_models.py`

### section-03-sessions
In-memory `SessionStore` class backed by dict + `asyncio.Lock`. Implements store/get with sliding-window TTL, capacity limits with oldest-eviction, and periodic background cleanup. Full test coverage for CRUD, expiration, cleanup, capacity, and concurrent access.

**Plan sections covered:** 7 (Session Management)
**TDD sections covered:** Basic CRUD, Expiration, Cleanup, Capacity, Concurrency tests
**Files:** `server/sessions.py`, `tests/test_sessions.py`

### section-04-export
Markdown document generation from `ResearchResult`. Builds a structured document with header, executive summary, ranked source list with intelligence signals, concept map, flashcards, and resources. Handles type variations in `dict[str, Any]` artifacts defensively. Also includes topic slug generation for filenames.

**Plan sections covered:** 10 (Markdown Export)
**TDD sections covered:** Happy path export, edge cases/defensive handling, topic slug tests
**Files:** `server/export.py`, `tests/test_export.py`

### section-05-sse
Core SSE streaming logic: `format_sse_event()` converts pipeline events to `ServerSentEvent` objects with proper event types, sequential IDs, and JSON data. `stream_research()` async generator wraps `run_research()`, formats events, handles client disconnects, and stores results on completion (only meaningful results). Special handling for `CompleteEvent` → `CompleteSummary`.

**Plan sections covered:** 6 (SSE Streaming), 8 (Error Handling Strategy)
**TDD sections covered:** format_sse_event tests, stream_research generator tests, error handling tests
**Files:** `server/sse.py`, `tests/test_sse.py`

### section-06-routes-app
FastAPI app factory with lifespan (session store, semaphore, background cleanup), CORS middleware, logging configuration. Route definitions: `POST /api/research` (SSE stream with semaphore), `GET /api/export/{session_id}` (markdown download), `GET /health`. Concurrency control via `asyncio.Semaphore(3)`. Also includes `__main__.py` for convenience.

**Plan sections covered:** 4 (FastAPI Application), 9 (Routes), 11 (Environment and Server Configuration)
**TDD sections covered:** App-level tests, POST/GET/health route tests, concurrency control tests
**Files:** `server/app.py`, `server/routes.py`, `server/__main__.py`, `tests/test_routes.py`
