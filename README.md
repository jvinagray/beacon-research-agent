# Beacon Research Agent

Beacon is an AI-powered research agent that searches the web, evaluates and ranks sources using Claude, extracts content, and synthesizes structured learning artifacts — all streamed in real-time to an interactive dashboard.

Given a research query, Beacon produces:
- **Summary** — A cited, long-form synthesis of findings
- **Concept Map** — Visual mind map of how ideas connect
- **Flashcards** — Study cards generated from the research
- **Timeline** — Chronological ordering of events and developments
- **Conflict Detection** — Identifies contradictions across sources
- **Assumption Analysis** — Surfaces unstated assumptions in the literature
- **Source Evaluations** — Each source scored for relevance, credibility, and depth

## Demo

![Beacon Dashboard](https://img.shields.io/badge/status-hackathon%20project-blue)

## Architecture

Beacon is a three-layer system:

```
pipeline/    Python — async research orchestrator (search, evaluate, extract, synthesize)
api/         Python — FastAPI server with SSE streaming
frontend/    TypeScript — React dashboard with real-time updates
```

**Data flow:**

```
User Query → Frontend SSE → FastAPI → Pipeline (async generator)
                                         ├── Web Search (Tavily)
                                         ├── Source Evaluation (Claude)
                                         ├── Content Extraction (Trafilatura)
                                         └── Synthesis (6 parallel Claude calls)
                                               → PipelineEvents → SSE → Dashboard
```

The pipeline yields a stream of typed events (`StatusEvent`, `SourcesFoundEvent`, `SourceEvaluatedEvent`, `ArtifactEvent`, `CompleteEvent`) that flow through SSE to the frontend, which renders them in real-time as they arrive.

## Prerequisites

- **Python 3.11+** with [uv](https://docs.astral.sh/uv/) package manager
- **Node.js 18+** with npm
- **Anthropic API Key** — [Get one here](https://console.anthropic.com/)
- **Tavily API Key** — [Get one here](https://tavily.com/)

## Quick Start

### 1. Clone and configure environment

```bash
git clone https://github.com/jvinagray/beacon-research-agent.git
cd beacon-research-agent
```

Create `.env` files for the backend services:

```bash
# pipeline/.env
ANTHROPIC_API_KEY=your-anthropic-api-key
TAVILY_API_KEY=your-tavily-api-key

# api/.env
ANTHROPIC_API_KEY=your-anthropic-api-key
TAVILY_API_KEY=your-tavily-api-key
```

### 2. Start the pipeline + API server

```bash
cd api
uv sync --dev
uv run python -m server
```

The API server starts on `http://localhost:8000` with auto-reload enabled. It installs the pipeline package as an editable dependency automatically.

### 3. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend starts on `http://localhost:8080` and proxies API requests to `:8000`.

### 4. Use it

Open `http://localhost:8080` in your browser. Enter a research topic and watch as Beacon searches the web, evaluates sources, and builds your research artifacts in real-time.

## Project Structure

```
beacon-research-agent/
├── pipeline/                  # Research orchestrator
│   ├── beacon/
│   │   ├── pipeline.py        # Main async generator — orchestrates the full flow
│   │   ├── search.py          # Web search via Tavily API
│   │   ├── evaluate.py        # Source scoring with Claude
│   │   ├── extract.py         # Content extraction with Trafilatura
│   │   ├── synthesize.py      # 6 parallel Claude synthesis calls
│   │   ├── models.py          # Pydantic models & PipelineEvent union type
│   │   ├── prompts.py         # All LLM prompt templates
│   │   ├── config.py          # Model and API configuration
│   │   └── evaluation/        # Evaluation framework (LLM judge, RAG metrics, A/B testing)
│   └── tests/
│
├── api/                       # FastAPI streaming server
│   ├── server/
│   │   ├── app.py             # FastAPI app with CORS
│   │   ├── routes.py          # POST /api/research — main SSE endpoint
│   │   ├── sse.py             # SSE event serialization
│   │   ├── chat.py            # POST /api/chat/{id} — follow-up chat
│   │   ├── rewrite.py         # POST /api/rewrite/{id} — complexity-adjusted rewrites
│   │   ├── drilldown.py       # POST /api/drilldown/{id} — sub-topic deep dives
│   │   ├── export.py          # GET /api/export/{id} — markdown export
│   │   ├── sessions.py        # In-memory session store (60-min TTL)
│   │   └── models.py          # Request/response schemas
│   └── tests/
│
├── frontend/                  # React dashboard
│   ├── src/
│   │   ├── pages/
│   │   │   ├── SearchPage.tsx      # Research input form
│   │   │   └── DashboardPage.tsx   # Results dashboard with tabbed views
│   │   ├── components/             # UI components (cards, viewers, charts)
│   │   ├── hooks/                  # SSE connection hooks (useResearch, useChat, etc.)
│   │   ├── lib/                    # Utilities (SSE client, parsers, state helpers)
│   │   └── types/                  # TypeScript type definitions
│   ├── package.json
│   └── vite.config.ts
│
├── CLAUDE.md                  # AI assistant context file
└── .gitignore
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/research` | Start research — returns SSE event stream |
| `POST` | `/api/chat/{session_id}` | Chat about results — returns SSE stream |
| `POST` | `/api/rewrite/{session_id}` | Rewrite at different complexity — SSE stream |
| `POST` | `/api/drilldown/{session_id}` | Deep dive into a concept — SSE stream |
| `GET` | `/api/export/{session_id}` | Download results as Markdown |
| `GET` | `/health` | Health check |

## Dashboard Features

- **Real-time streaming** — Watch sources get discovered, evaluated, and synthesized live
- **Interactive citations** — Click citation badges to see source details in popovers
- **Drill-down links** — Click concepts in the summary to launch sub-research
- **Complexity slider** — Rewrite the summary for different reading levels
- **Follow-up chat** — Ask questions about your research results
- **Knowledge graph** — Visual "Research Brain" showing concept relationships
- **Markdown export** — Download your full research as a `.md` file

## Running Tests

```bash
# Pipeline tests (216 tests)
cd pipeline
uv sync --all-extras
uv run pytest

# API tests (130 tests)
cd api
uv sync --all-extras
uv run pytest

# Frontend tests (276 tests)
cd frontend
npm run test
```

## Models Used

| Model | Usage |
|-------|-------|
| `claude-sonnet-4-6` | Source evaluation, chat, rewrites, drill-downs |
| `claude-opus-4-6` | Synthesis artifacts (summary, flashcards, timeline, etc.) |

## Tech Stack

**Backend:** Python 3.11+, FastAPI, SSE-Starlette, Anthropic SDK, Tavily, Trafilatura, Pydantic

**Frontend:** React, TypeScript, Vite, Tailwind CSS, shadcn/ui, Radix UI, D3.js

**Testing:** pytest (async), Vitest, respx

## License

This project was built as a hackathon entry.
