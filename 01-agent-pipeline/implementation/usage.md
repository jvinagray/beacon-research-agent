# Beacon Agent Pipeline - Usage Guide

## Quick Start

### Prerequisites

1. Python 3.12+
2. [uv](https://github.com/astral-sh/uv) package manager
3. API keys for:
   - **Anthropic** (Claude API) - for source evaluation and synthesis
   - **Tavily** (Search API) - for web search and content extraction

### Setup

```bash
cd 01-agent-pipeline

# Install dependencies
uv sync

# Configure environment variables
cp .env.example .env  # or create .env manually
```

Add to `.env`:
```
ANTHROPIC_API_KEY=sk-ant-...
TAVILY_API_KEY=tvly-...
```

### Run Research Pipeline

```python
import asyncio
from beacon.pipeline import run_research

async def main():
    async for event in run_research("agentic RAG patterns", "standard"):
        print(f"[{event.type}] {event}")

asyncio.run(main())
```

### Depth Levels

| Depth | Sources | Queries | Deep-Read Top N |
|-------|---------|---------|-----------------|
| `quick` | 10 | 1 | 3 |
| `standard` | 20 | 1 | 7 |
| `deep` | 20 | 2 | 10 |

### Run Tests

```bash
uv run pytest tests/ -v
```

## Example Output

```
[status] Searching for sources...
[sources_found] Found 10 sources
[status] Evaluating sources...
[source_evaluated] 1/10 - https://example.com/rag-tutorial (score: 9)
[source_evaluated] 2/10 - https://example.com/vector-db (score: 8)
... (8 more evaluations)
[status] Reading top sources...
[status] Generating learning artifacts...
[artifact] summary: # Summary...
[artifact] concept_map: # Concept Map...
[artifact] flashcards: [{"question": "...", "answer": "..."}]
[artifact] resources: [{"url": "...", "title": "..."}]
[complete] Research complete (session: abc-123-def)
```

## API Reference

### `beacon.pipeline.run_research(topic, depth)`

Main entry point. Returns an async generator yielding `PipelineEvent` objects.

**Parameters:**
- `topic: str` - The research topic to investigate
- `depth: str` - One of `"quick"`, `"standard"`, `"deep"`

**Yields:** Union of event types:
- `StatusEvent` - Pipeline status updates (`.message`)
- `SourcesFoundEvent` - Search results (`.count`, `.sources`)
- `SourceEvaluatedEvent` - Per-source evaluation (`.index`, `.total`, `.source`)
- `ArtifactEvent` - Generated artifacts (`.artifact_type`, `.data`)
- `ErrorEvent` - Errors (`.message`, `.recoverable`)
- `CompleteEvent` - Final result (`.session_id`, `.result`)

### `beacon.search.search(topic, depth_config, client=None)`

Search for sources using Tavily. Returns `list[Source]`.

### `beacon.evaluate.evaluate_sources(sources, topic, client=None, queue=None)`

Evaluate sources with Claude. Returns `list[EvaluatedSource]` sorted by score.

### `beacon.extract.extract_content(sources, client=None)`

Extract full page content via Tavily Extract + trafilatura fallback.

### `beacon.synthesize.synthesize(sources, topic, depth, client=None)`

Generate learning artifacts (summary, concept map, flashcards, resources).

### `beacon.config.get_config()`

Load API keys from environment. Returns `Config` dataclass.

### `beacon.config.get_depth_settings(depth)`

Get search parameters for a depth level. Returns `dict`.

## Project Structure

```
01-agent-pipeline/
├── beacon/
│   ├── __init__.py      # Package init
│   ├── config.py        # Environment config and depth settings
│   ├── models.py        # Pydantic models and event types
│   ├── prompts.py       # Prompt templates for Claude
│   ├── search.py        # Tavily search integration
│   ├── evaluate.py      # Claude-based source evaluation
│   ├── extract.py       # Content extraction cascade
│   ├── synthesize.py    # Artifact generation
│   └── pipeline.py      # Main orchestrator
├── tests/
│   ├── conftest.py      # Shared test fixtures
│   ├── test_config.py   # Config tests (8)
│   ├── test_models.py   # Model tests (20)
│   ├── test_prompts.py  # Prompt tests (8)
│   ├── test_search.py   # Search tests (12)
│   ├── test_evaluate.py # Evaluate tests (10)
│   ├── test_extract.py  # Extract tests (11)
│   ├── test_synthesize.py # Synthesize tests (11)
│   └── test_pipeline.py # Pipeline tests (12)
└── pyproject.toml       # Project configuration
```

**Total: 100 tests across 9 test files**
