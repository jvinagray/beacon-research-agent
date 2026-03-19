# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Beacon is an AI research agent that searches the web, evaluates sources with Claude, extracts content, and synthesizes learning artifacts (summary, concept map, flashcards, timeline, conflict detection, assumptions). It streams results in real-time via SSE.

## Architecture (3 Layers)

```
pipeline/   Python package "beacon" — async orchestrator
api/        Python package "server" — FastAPI + SSE layer
frontend/   React/TypeScript — Vite + shadcn/Radix UI
```

**Data flow:** Frontend SSE → FastAPI routes → `pipeline.run_research()` async generator → yields `PipelineEvent` discriminated union → serialized as SSE events.

**Key dependency:** `api` depends on `pipeline` via editable install (`uv` workspace source).

## Build & Run Commands

### Agent Pipeline (`pipeline/`)
```bash
cd pipeline
uv sync --dev              # install deps
uv run pytest              # run all tests
uv run pytest tests/test_synthesize.py  # single test file
uv run pytest -k "test_name"            # single test by name
```

### API Server (`api/`)
```bash
cd api
uv sync --dev              # install deps (includes editable beacon-pipeline)
uv run python -m server    # start dev server on :8000 (auto-reload)
uv run pytest              # run all tests
uv run pytest tests/test_routes.py      # single test file
```

### Frontend (`frontend/`)
```bash
cd frontend
npm install                # install deps
npm run dev                # Vite dev server on :8080
npm run build              # production build
npm run lint               # ESLint
npm run test               # vitest run (single pass)
npm run test:watch         # vitest watch mode
```

## Environment Variables

Both Python packages load from `.env` via `python-dotenv`:
- `ANTHROPIC_API_KEY` — required
- `TAVILY_API_KEY` — required

Frontend uses `VITE_API_URL` (defaults to `http://localhost:8000`).

## Key Architecture Details

### Pipeline Event System
`beacon/models.py` defines a `PipelineEvent` union type (StatusEvent | SourcesFoundEvent | SourceEvaluatedEvent | ArtifactEvent | ErrorEvent | CompleteEvent). The pipeline yields these as an async generator. The API layer serializes them as SSE. The frontend `useResearch` hook dispatches them through a reducer.

### Synthesis: 6 Parallel LLM Calls
`synthesize.py` runs `asyncio.gather()` with 6 parallel Claude calls: summary, concept_map, flashcards, timeline, conflicts, assumptions. Each returns a different shape (string, list[Flashcard], list[dict]). A 7th artifact (resources) is assembled directly from source data.

### Frontend SSE Pattern
`lib/sse.ts` → `connectSSE()` uses `@microsoft/fetch-event-source`. Hooks (`useResearch`, `useRewrite`, `useDrillDown`, `useChat`) each manage their own SSE connections with AbortController cleanup.

### Frontend Path Alias
`@/` maps to `src/` (configured in vite.config.ts and tsconfig).

### Custom Markdown Links
`MarkdownViewer.tsx` intercepts two custom URL schemes:
- `cite:N` — renders as superscript citation badge with Radix Popover
- `drill://concept` — renders as clickable drill-down link

### Session Management
API uses in-memory `SessionStore` with 60-min sliding TTL and background cleanup. Sessions hold `ResearchResult` objects. Max 3 concurrent research runs (semaphore).

## Testing

- **Python tests:** pytest with `asyncio_mode = "auto"`. Tests use `respx` for HTTP mocking and mock Anthropic clients.
- **Frontend tests:** Vitest with jsdom environment. Setup file at `src/test/setup.ts`. Tests colocated in `__tests__/` directories alongside source files.

## Models Used

- `EVAL_MODEL = "claude-sonnet-4-6"` — source evaluation, rewrites, chat, drilldown
- `SYNTH_MODEL = "claude-opus-4-6"` — synthesis artifacts (summary, flashcards, timeline, etc.)

## Frontend Routing

- `/search` — SearchPage (research input form)
- `/dashboard` — DashboardPage (results with tabs: Summary, Sources, Timeline, Analysis, Flashcards, Concept Map, Chat)
- Research state passed via React Router `useLocation().state`

## API Endpoints

- `POST /api/research` — SSE stream of pipeline events
- `POST /api/chat/{session_id}` — SSE stream of chat responses
- `POST /api/rewrite/{session_id}` — SSE stream of complexity-adjusted rewrites
- `POST /api/drilldown/{session_id}` — SSE stream of drill-down sub-research
- `GET /api/export/{session_id}` — Markdown file download
- `GET /health` — Health check
