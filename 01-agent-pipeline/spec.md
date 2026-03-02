# 01 - Agent Pipeline

## Overview
The core research agent that powers Beacon. Takes a topic + depth setting as input, searches the web, evaluates and ranks sources by learning efficiency, deep-reads top sources, and generates four learning artifacts.

## Requirements Reference
See `../BEACON_SPEC.md` for full product spec. This split covers the "Agent Pipeline" section.

## What This Split Produces
- **Pydantic models** for Source, IntelligenceSignals, Artifact, ResearchResult — shared with 02-api-streaming
- **Pipeline orchestrator** — an async generator function that yields typed progress events as it works
- **Search module** — Tavily API integration for web search
- **Evaluate module** — Claude API calls to score each source for learning efficiency
- **Extract module** — Content extraction (Tavily extract or httpx+BeautifulSoup) for deep-reading top sources
- **Synthesize module** — Claude API calls to generate 4 artifacts from extracted content

## Pipeline Flow
```
Input: (topic: str, depth: "quick" | "standard" | "deep")
  ↓
[SEARCH] → Tavily API → list of raw results (url, title, snippet)
  ↓
[EVALUATE] → Claude (batch or parallel) → each source gets:
  - learning_efficiency_score (1-10)
  - content_type (tutorial | paper | docs | opinion | video)
  - time_estimate_minutes
  - recency (date if available)
  - key_insight (1-2 sentences)
  - coverage (list of subtopics covered)
  ↓
[RANK + SELECT] → sort by learning_efficiency_score → select top N for deep-read
  ↓
[DEEP-READ] → extract full text from top N sources
  ↓
[SYNTHESIZE] → Claude calls (can be parallel):
  - Executive Summary (markdown)
  - Concept Map / Outline (structured markdown)
  - Flashcards (list of {question, answer} pairs)
  ↓
Output: ResearchResult containing all scored sources + all artifacts
```

## Depth Configuration
| Level | Tavily max_results | Deep-read top N |
|-------|-------------------|-----------------|
| quick | 10 | 3 |
| standard | 20 | 7 |
| deep | 30 | 10 |

## Key Decisions for /deep-plan
1. **Pipeline orchestration**: How should the async generator yield events? What's the event type taxonomy?
2. **Evaluation prompt engineering**: How to get Claude to consistently and accurately score learning efficiency. Need few-shot examples.
3. **Parallel vs sequential Claude calls**: Can evaluation calls be batched/parallelized? Can synthesis calls (summary, concept map, flashcards) run in parallel?
4. **Content extraction strategy**: Tavily extract API vs httpx+BeautifulSoup. Fallback when extraction fails.
5. **Error handling**: What happens when Tavily returns no results? When a source can't be extracted? When Claude returns malformed JSON?
6. **Token budget management**: Deep-read content can be large. How to truncate/summarize before passing to synthesis prompts?

## Technology Stack
- Python 3.11+
- `anthropic` SDK for Claude API calls
- `tavily-python` for search
- `httpx` for HTTP requests (content extraction fallback)
- `beautifulsoup4` for HTML parsing (extraction fallback)
- `pydantic` for data models
- Async throughout (`asyncio`, `async for`)

## Interface to 02-api-streaming
The pipeline exposes an async generator:
```python
async def run_research(topic: str, depth: str) -> AsyncGenerator[PipelineEvent, None]:
    yield StatusEvent(message="Searching...")
    yield SourcesFoundEvent(sources=[...])
    yield SourceEvaluatedEvent(source=...)
    ...
    yield ArtifactEvent(artifact_type="summary", data="...")
    yield CompleteEvent(result=ResearchResult(...))
```
The API layer in split 02 consumes this generator and translates events to SSE.

## Interview Context
- User's biggest uncertainty is **overall system design** — how pieces fit together
- Evaluation and synthesis are seen as **two distinct problems** within the pipeline
- Learning efficiency is the **headline metric** and differentiator
- Source intelligence (showing HOW the agent evaluates) is the **demo wow factor**
