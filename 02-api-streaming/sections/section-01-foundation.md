# Section 01: Foundation -- Project Scaffolding, Package Configuration, and Test Fixtures

## Overview

This section creates the project skeleton for the `02-api-streaming` package: directory structure, `pyproject.toml` with the `uv` path dependency on `01-agent-pipeline`, `__init__.py` files, `.env.example`, and the shared test fixtures in `conftest.py`. All subsequent sections depend on this foundation.

**Files to create:**
- `C:\git_repos\playground\hackathon\02-api-streaming\pyproject.toml`
- `C:\git_repos\playground\hackathon\02-api-streaming\server\__init__.py`
- `C:\git_repos\playground\hackathon\02-api-streaming\tests\__init__.py`
- `C:\git_repos\playground\hackathon\02-api-streaming\tests\conftest.py`
- `C:\git_repos\playground\hackathon\02-api-streaming\.env.example`

**Dependencies:** None (this is the first section).

**Blocks:** section-02-models, section-03-sessions, section-04-export (and transitively all later sections).

---

## 1. Directory Structure

Create the following directory layout under `C:\git_repos\playground\hackathon\02-api-streaming\`:

```
02-api-streaming/
├── pyproject.toml
├── .env.example
├── server/
│   ├── __init__.py
│   └── (other modules created by later sections)
└── tests/
    ├── __init__.py
    └── conftest.py
```

The `server/` directory is the main Python package containing the FastAPI application. The `tests/` directory holds pytest tests. Both need `__init__.py` files to be recognized as Python packages.

---

## 2. Tests First: Verifying the Foundation

There are no unit tests for this section in the traditional sense -- package configuration is verified by running `uv sync` and confirming imports work. However, the `conftest.py` created here provides all the shared fixtures that later test files depend on. Verify the foundation by:

1. Running `cd C:\git_repos\playground\hackathon\02-api-streaming && uv sync` -- must succeed without errors.
2. Running `uv run python -c "from beacon.models import ResearchResult; print('OK')"` -- must print `OK`, confirming the path dependency works.
3. Running `uv run python -c "import fastapi; import sse_starlette; import httpx; print('OK')"` -- must print `OK`, confirming core dependencies are installed.
4. Running `uv run pytest tests/ --co` -- must collect 0 tests without import errors (conftest.py loads cleanly).

---

## 3. Package Configuration (`pyproject.toml`)

**File:** `C:\git_repos\playground\hackathon\02-api-streaming\pyproject.toml`

Use `hatchling` as the build backend (matching the pipeline project's convention). The critical detail is the `[tool.uv.sources]` section that tells `uv` where to find the `beacon` package as a local path dependency.

```toml
[project]
name = "beacon-api"
version = "0.1.0"
description = "Beacon API & Streaming Layer - FastAPI server wrapping the research pipeline"
requires-python = ">=3.11"
dependencies = [
    "beacon",
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

[tool.uv.sources]
beacon = { path = "../01-agent-pipeline" }

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]

[tool.hatch.build.targets.wheel]
packages = ["server"]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
```

**Key details:**

- `beacon` appears in `[project.dependencies]` as a bare name. The actual path resolution is handled by `[tool.uv.sources]` which points at `../01-agent-pipeline`. This is the correct uv + hatchling syntax.
- `asyncio_mode = "auto"` means all `async def test_*` functions automatically run as asyncio tests without needing `@pytest.mark.asyncio` decorators.
- `httpx` is a dev dependency used by `httpx.AsyncClient` for testing FastAPI endpoints.
- The `[tool.hatch.build.targets.wheel]` section specifies `server` as the package to include in wheels.

---

## 4. `__init__.py` Files

**File:** `C:\git_repos\playground\hackathon\02-api-streaming\server\__init__.py`

```python
"""Beacon API & Streaming Layer - FastAPI server wrapping the research pipeline."""
```

**File:** `C:\git_repos\playground\hackathon\02-api-streaming\tests\__init__.py`

Empty file (just needs to exist for Python package recognition).

---

## 5. Environment Example (`.env.example`)

**File:** `C:\git_repos\playground\hackathon\02-api-streaming\.env.example`

The pipeline's `get_config()` calls `load_dotenv()` to load API keys. When running the server from the `02-api-streaming/` directory, a `.env` file must be present (or environment variables set directly).

```env
# Required API keys for the Beacon research pipeline
# Copy this file to .env and fill in your keys

ANTHROPIC_API_KEY=your-anthropic-api-key-here
TAVILY_API_KEY=your-tavily-api-key-here
```

---

## 6. Test Fixtures (`conftest.py`)

**File:** `C:\git_repos\playground\hackathon\02-api-streaming\tests\conftest.py`

This file provides all shared test fixtures used across the test suite. Later sections' test files (`test_sessions.py`, `test_sse.py`, `test_routes.py`, `test_export.py`) all rely on these fixtures.

### Pipeline Model Imports

All pipeline types are imported from the `beacon` package:

```python
from beacon.pipeline import run_research
from beacon.models import (
    PipelineEvent, StatusEvent, SourcesFoundEvent, SourceEvaluatedEvent,
    ArtifactEvent, ErrorEvent, CompleteEvent,
    ResearchResult, EvaluatedSource, Flashcard,
    Source, IntelligenceSignals,
)
```

### Fixtures to Define

The conftest must provide the following fixtures. Each is described with its purpose, return type, and key data characteristics.

**`sample_sources`** -- A list of `EvaluatedSource` objects with realistic intelligence signal data. Used by export tests, SSE tests, and route tests. Should contain at least 2 sources with different `learning_efficiency_score` values (so sort-order tests work). Each source needs fully populated `IntelligenceSignals` (score, content_type, time_estimate_minutes, recency, key_insight, coverage list). One source should have `deep_read_content` set to a non-None string to verify the export handles it.

**`sample_flashcards`** -- A list of `Flashcard` objects (at least 2). Each has a `question` and `answer` string. Used in `sample_research_result` artifacts and by export tests.

**`sample_research_result`** -- A `ResearchResult` with realistic populated data: a topic string, depth `"standard"`, the `sample_sources` list, a `session_id` (any fixed UUID string like `"test-session-123"`), a timestamp string, and an `artifacts` dict containing keys `"summary"` (a markdown string), `"concept_map"` (a markdown string), `"flashcards"` (the `sample_flashcards` list), and `"resources"` (a JSON string from `json.dumps()`). This fixture depends on `sample_sources` and `sample_flashcards`.

**`empty_research_result`** -- A `ResearchResult` with empty data: empty `sources` list, empty `artifacts` dict, a topic, depth, session_id, and timestamp. Represents the result of a failed pipeline run. Used by SSE tests to verify that empty results are NOT stored in the session store.

**`session_store`** -- A fresh `SessionStore` instance with a short TTL (e.g., 5 seconds) for fast expiration testing and a small `max_sessions` (e.g., 3) for capacity testing. The `SessionStore` class is imported from `server.sessions` (created in section-03-sessions). Since `conftest.py` is loaded at test collection time and `server.sessions` may not exist yet during this section's implementation, use a conditional import or accept that this fixture will only work after section-03 is complete. A pragmatic approach: define the fixture with the import inside the fixture function body so it fails at runtime (when the test actually runs) rather than at collection time.

**`mock_pipeline`** -- A factory fixture (or fixture returning a function) that creates an `AsyncGenerator[PipelineEvent, None]` yielding a controlled sequence of pipeline events. The default sequence should be a realistic happy path:
1. `StatusEvent(message="Searching...")`
2. `SourcesFoundEvent(count=2, sources=[Source(...), Source(...)])`
3. `SourceEvaluatedEvent(index=1, total=2, source=...)`
4. `SourceEvaluatedEvent(index=2, total=2, source=...)`
5. `ArtifactEvent(artifact_type="summary", data="# Summary...")`
6. `ArtifactEvent(artifact_type="concept_map", data="...")`
7. `ArtifactEvent(artifact_type="flashcards", data=[Flashcard(...), ...])`
8. `ArtifactEvent(artifact_type="resources", data="...")`
9. `CompleteEvent(session_id="test-session-123", result=sample_research_result)`

This should be a function that accepts an optional list of events to yield, defaulting to the happy-path sequence. This lets individual tests override the event sequence (e.g., to test error scenarios).

**`app`** -- The FastAPI app instance with `run_research` patched (via `unittest.mock.patch`) to use the `mock_pipeline` generator instead of calling the real pipeline. The app is imported from `server.app` (created in section-06-routes-app). Similar to `session_store`, use a deferred import inside the fixture body. The patch target is `server.sse.run_research` (where it will be imported in the SSE module).

**`client`** -- An `httpx.AsyncClient` configured with the test app using `httpx.ASGITransport`. This allows making HTTP requests to the FastAPI app without running a server. The fixture should use `async with` for proper lifecycle:

```python
@pytest.fixture
async def client(app):
    """httpx AsyncClient wired to the test FastAPI app."""
    from httpx import AsyncClient, ASGITransport
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
```

### Fixture Dependency Chain

```
sample_flashcards (standalone)
sample_sources (standalone)
sample_research_result (depends on: sample_sources, sample_flashcards)
empty_research_result (standalone)
session_store (standalone, imports server.sessions)
mock_pipeline (depends on: sample_research_result, sample_sources)
app (depends on: mock_pipeline, imports server.app)
client (depends on: app)
```

### Important Implementation Notes for conftest.py

- All fixtures that return data objects (sources, results, etc.) should use `@pytest.fixture` with default function scope so each test gets a fresh copy.
- The `session_store` fixture should also be function-scoped so each test gets a clean store.
- The `mock_pipeline` fixture should return a **factory function** (not the generator directly) so tests can call it multiple times or customize the event sequence.
- For the `app` fixture, use `unittest.mock.patch` as a context manager or decorator to replace `run_research` with the mock pipeline generator. The patch should be applied to the import location in `server.sse` (i.e., `"server.sse.run_research"`).
- The `client` fixture is async and uses `yield` within an `async with` block to ensure proper cleanup.
- Use `json.dumps()` to create the resources artifact value (it is a JSON string in the pipeline's output).

### Data Values for Fixtures

For the `sample_sources` fixture, create `EvaluatedSource` objects like:

- Source 1: url `"https://example.com/tutorial"`, title `"Python Async Tutorial"`, score 8, content_type `"tutorial"`, time_estimate 15 min, recency `"2024"`, key_insight about async patterns, coverage `["asyncio", "coroutines"]`
- Source 2: url `"https://example.com/docs"`, title `"FastAPI Documentation"`, score 6, content_type `"docs"`, time_estimate 30 min, recency `"2024"`, key_insight about API design, coverage `["fastapi", "pydantic"]`

For `sample_flashcards`:

- Flashcard 1: question `"What is an async generator?"`, answer `"A function that uses both async/await and yield..."`
- Flashcard 2: question `"What does SSE stand for?"`, answer `"Server-Sent Events..."`

For the `sample_research_result` artifacts dict:

- `"summary"`: A short markdown string (e.g., `"## Research Summary\n\nThis research covers..."`)
- `"concept_map"`: A short indented outline string
- `"flashcards"`: The `sample_flashcards` list (list of `Flashcard` objects)
- `"resources"`: `json.dumps([{"title": "...", "url": "...", "description": "..."}])`

---

## 7. Verification Checklist

After implementing this section, verify:

1. `uv sync` succeeds in `C:\git_repos\playground\hackathon\02-api-streaming\`
2. `uv run python -c "from beacon.models import ResearchResult; print('OK')"` prints `OK`
3. `uv run python -c "import fastapi; import sse_starlette; import httpx; print('OK')"` prints `OK`
4. `uv run pytest tests/ --co` completes without import errors (may show 0 tests collected, which is fine -- no test files exist yet beyond conftest.py)
5. The `server/` and `tests/` directories exist with `__init__.py` files
6. `.env.example` exists with the documented API key placeholders
