# Agent Pipeline — Complete Specification

## Overview
The core research agent pipeline for Beacon. Takes a topic + depth setting, searches the web via Tavily, evaluates and ranks sources by learning efficiency using Claude (direct Anthropic API), deep-reads top sources, and generates four learning artifacts.

## Technology Stack
- Python 3.11+
- `anthropic` SDK with `AsyncAnthropic` (direct Anthropic API)
- `tavily-python` (`AsyncTavilyClient`)
- `trafilatura` for content extraction (primary after Tavily Extract)
- `httpx` for async HTTP
- `pydantic` for data models and structured output
- `pytest` + `pytest-asyncio` for testing

## Pipeline Architecture

### Input
```python
topic: str           # e.g. "agentic RAG patterns"
depth: Literal["quick", "standard", "deep"]
```

### Pipeline Stages

**Stage 1: SEARCH**
- Use `AsyncTavilyClient.search()`
- Depth config:
  | Level | Strategy | Sources |
  |-------|----------|---------|
  | quick | 1 query, max_results=10 | 5-10 |
  | standard | 1 query, max_results=20 | 15-20 |
  | deep | 2 queries (different angles), max_results=20 each, deduplicate | 25-30+ |
- For "deep" mode: generate 2 complementary search queries from the topic (e.g., "agentic RAG patterns implementation" + "RAG retrieval augmented generation best practices 2025")
- Yield: `StatusEvent`, then `SourcesFoundEvent`

**Stage 2: EVALUATE**
- One Claude call per source (parallel via `asyncio.gather`)
- Model: `claude-sonnet-4-6` via `AsyncAnthropic`
- Input per call: source URL, title, snippet
- Output per call (structured via Pydantic `.parse()` or json_schema):
  ```python
  class IntelligenceSignals(BaseModel):
      learning_efficiency_score: int  # 1-10
      content_type: Literal["tutorial", "paper", "docs", "opinion", "video"]
      time_estimate_minutes: int
      recency: str | None  # date string or None
      key_insight: str  # 1-2 sentences
      coverage: list[str]  # subtopics covered
  ```
- Use `asyncio.Semaphore(10)` to limit concurrent Claude calls
- Yield: `SourceEvaluatedEvent` per source as each completes
- Error handling: retry once on transient errors, skip on persistent failure

**Stage 3: RANK + SELECT**
- Sort by `learning_efficiency_score` descending
- Select top N for deep-read:
  | Level | Deep-read top N |
  |-------|-----------------|
  | quick | 3 |
  | standard | 7 |
  | deep | 10 |

**Stage 4: DEEP-READ**
- Extraction cascade per source:
  1. **Tavily Extract API** first (handles JS-rendered, paywalls)
  2. **trafilatura** fallback (`favor_precision=True`, `output_format="markdown"`, `include_tables=True`)
- Token budget: trafilatura precision mode + truncate to ~5000 chars per source as safety net
- Parallel extraction via `asyncio.gather` with `Semaphore(5)`
- Error handling: retry once, skip on failure. Source keeps its evaluation score but gets flagged as "snippet only"
- Yield: `StatusEvent` per source

**Stage 5: SYNTHESIZE**
- Three parallel Claude calls via `asyncio.gather`:
  1. Executive Summary (markdown)
  2. Concept Map / Outline (structured markdown)
  3. Flashcards (list of {question, answer} objects)
- Model: `claude-opus-4-6` via `AsyncAnthropic`
- Input: all deep-read content + all evaluation data
- Yield: `ArtifactEvent` per artifact as each completes

**Stage 6: PACKAGE**
- Combine all evaluated sources + all artifacts into `ResearchResult`
- Yield: `CompleteEvent` with session_id and full result

### Data Models (Pydantic)

```
Source: url, title, snippet
EvaluatedSource: Source + IntelligenceSignals + deep_read_content (optional)
IntelligenceSignals: learning_efficiency_score, content_type, time_estimate_minutes, recency, key_insight, coverage
Artifact: artifact_type (summary|concept_map|flashcards), data (str or list)
Flashcard: question, answer
ResearchResult: topic, depth, sources (list[EvaluatedSource]), artifacts (dict[str, Artifact]), session_id, timestamp
```

### Pipeline Events (yielded by async generator)

```
StatusEvent: message (str)
SourcesFoundEvent: sources (list[Source])
SourceEvaluatedEvent: source (EvaluatedSource), index (int), total (int)
ArtifactEvent: artifact_type (str), data (str | list)
ErrorEvent: message (str), recoverable (bool)
CompleteEvent: session_id (str), result (ResearchResult)
```

### Interface
```python
async def run_research(topic: str, depth: str) -> AsyncGenerator[PipelineEvent, None]:
    ...
```

## Error Handling Strategy
- **Transient errors** (timeout, rate limit): retry once with 2s backoff
- **Persistent errors** (invalid URL, parse failure): skip source, yield ErrorEvent
- **Claude structured output failure**: retry once, if still fails use raw text extraction with regex fallback
- **Tavily no results**: yield error, suggest user refine topic
- **All sources fail extraction**: proceed with snippet-only evaluation for synthesis

## Configuration
- Anthropic API key via environment variable
- Tavily API key via environment variable
- Model names configurable (default: sonnet for eval, opus for synthesis)
- Concurrency limits configurable (default: 10 for Claude, 5 for extraction)
