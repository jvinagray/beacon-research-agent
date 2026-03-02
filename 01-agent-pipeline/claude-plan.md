# Beacon Agent Pipeline — Implementation Plan

## What We're Building

An async Python pipeline that takes a research topic and depth setting, then:
1. Searches the web for relevant sources (Tavily API)
2. Evaluates each source for "learning efficiency" using Claude AI (via Azure Foundry)
3. Deep-reads the top sources by extracting full page content
4. Synthesizes four learning artifacts from the extracted content
5. Yields real-time progress events throughout (consumed by a FastAPI SSE layer, built separately)

The pipeline is the "brain" of Beacon — an AI R&D agent that builds knowledge bases from any topic. Its differentiator is **source intelligence**: it doesn't just find links, it scores each source by how much knowledge you get per minute spent consuming it.

## Why This Architecture

The pipeline is an **async generator** that yields typed events. This design was chosen because:
- The downstream API layer (separate split) needs real-time progress for SSE streaming
- Each pipeline stage produces observable outputs (sources found, source evaluated, artifact generated)
- Async generators provide natural backpressure — the consumer controls the pace
- Error handling is clean: yield error events, don't throw exceptions that kill the stream

Claude is accessed through the **direct Anthropic API** using `AsyncAnthropic` from the `anthropic` Python SDK with a standard API key.

## Project Structure

```
01-agent-pipeline/
  beacon/
    __init__.py
    models.py           # Pydantic data models + event types
    config.py            # Environment config + depth settings
    pipeline.py          # Main orchestrator (run_research async generator)
    search.py            # Tavily search integration
    evaluate.py          # Claude-based source evaluation
    extract.py           # Content extraction (Tavily Extract + trafilatura)
    synthesize.py        # Artifact generation (summary, concept map, flashcards)
    prompts.py           # All Claude prompt templates
  tests/
    conftest.py          # Shared fixtures (mock clients, sample data)
    test_models.py
    test_search.py
    test_evaluate.py
    test_extract.py
    test_synthesize.py
    test_pipeline.py     # Integration test of full pipeline
  pyproject.toml
  .env.example
```

## Data Models

### Core Types (models.py)

```python
class Source(BaseModel):
    """Raw search result from Tavily."""
    url: str
    title: str
    snippet: str

class IntelligenceSignals(BaseModel):
    """Claude's evaluation of a source's learning value."""
    learning_efficiency_score: int   # 1-10, the headline metric
    content_type: Literal["tutorial", "paper", "docs", "opinion", "video", "forum", "repository", "course", "other"]
    time_estimate_minutes: int
    recency: str | None
    key_insight: str                 # 1-2 sentences
    coverage: list[str]              # subtopics this source addresses
    evaluation_failed: bool = False  # True if evaluation call failed and defaults were used

class EvaluatedSource(BaseModel):
    """Source with intelligence signals and optional deep-read content."""
    url: str
    title: str
    snippet: str
    signals: IntelligenceSignals
    deep_read_content: str | None    # markdown content if deep-read succeeded
    extraction_method: str | None    # "tavily_extract", "trafilatura", "snippet_only"

class Flashcard(BaseModel):
    question: str
    answer: str

class ResearchResult(BaseModel):
    """Complete output of a research run."""
    topic: str
    depth: str
    sources: list[EvaluatedSource]
    artifacts: dict[str, Any]        # {"summary": str, "concept_map": str, "flashcards": list, "resources": list}
    session_id: str                  # UUID4, generated at start of run_research()
    timestamp: str                   # ISO 8601 format
```

### Pipeline Events

```python
class StatusEvent(BaseModel):
    type: Literal["status"] = "status"
    message: str

class SourcesFoundEvent(BaseModel):
    type: Literal["sources_found"] = "sources_found"
    count: int
    sources: list[Source]

class SourceEvaluatedEvent(BaseModel):
    type: Literal["source_evaluated"] = "source_evaluated"
    index: int
    total: int
    source: EvaluatedSource

class ArtifactEvent(BaseModel):
    type: Literal["artifact"] = "artifact"
    artifact_type: Literal["summary", "concept_map", "flashcards", "resources"]
    data: str | list[Flashcard]

class ErrorEvent(BaseModel):
    type: Literal["error"] = "error"
    message: str
    recoverable: bool

class CompleteEvent(BaseModel):
    type: Literal["complete"] = "complete"
    session_id: str
    result: ResearchResult

PipelineEvent = StatusEvent | SourcesFoundEvent | SourceEvaluatedEvent | ArtifactEvent | ErrorEvent | CompleteEvent
```

## Configuration (config.py)

Environment variables:
- `ANTHROPIC_API_KEY` — Anthropic API key
- `TAVILY_API_KEY` — Tavily API key

Depth settings as a dataclass or dict:

| Depth | max_results | num_queries | deep_read_top_n |
|-------|------------|-------------|-----------------|
| quick | 10 | 1 | 3 |
| standard | 20 | 1 | 7 |
| deep | 20 | 2 | 10 |

Concurrency limits:
- Claude evaluation: `Semaphore(10)` — up to 10 parallel scoring calls
- Content extraction: `Semaphore(5)` — up to 5 parallel extract calls

Model selection:
- Evaluation: `claude-sonnet-4-6`
- Synthesis: `claude-opus-4-6`

## Search Module (search.py)

### Responsibilities
- Initialize `AsyncTavilyClient` with API key
- Execute search queries based on depth config
- For "deep" mode: generate a second complementary query and merge/deduplicate results
- Return list of `Source` objects

### Key Design Decisions

**Query generation for deep mode**: Given a topic like "agentic RAG patterns", generate two queries:
1. The original topic query
2. A complementary query with different keywords/angle (e.g., add "best practices 2025" or rephrase)

The second query can be generated by a quick Claude call or by a simple heuristic (append "best practices {year}" / "tutorial guide" etc.). Heuristic is preferred for speed and cost.

**Deduplication**: When merging results from 2 queries, deduplicate by normalized URL. Normalize before comparison: strip trailing slashes, remove `utm_*` query parameters, remove URL fragments (`#...`). Keep the result with the longer snippet.

**Tavily parameters**: Use `search_depth="basic"` (1 credit each), `topic="general"`. Do NOT use `include_raw_content` at search time — we do that separately in the extract stage.

## Evaluate Module (evaluate.py)

### Responsibilities
- Take a list of `Source` objects and the research topic
- Send one Claude call per source (parallel via `asyncio.gather`)
- Parse structured output into `IntelligenceSignals`
- Return list of `EvaluatedSource` objects sorted by learning efficiency

### Key Design Decisions

**Parallel evaluation with semaphore**: Create one async task per source, all awaited via `asyncio.gather(return_exceptions=True)`. Use `asyncio.Semaphore(10)` to limit concurrent Claude API calls to 10.

**Structured output**: Default approach is prompt-based — include the JSON schema in the prompt with few-shot examples, parse the response text as JSON, validate with Pydantic. This is the most reliable and portable path.

If the prompt-based approach proves unreliable, upgrade to the Anthropic API's structured output feature (`output_config` with JSON schema) matching `IntelligenceSignals`.

**max_tokens**: Set `max_tokens=512` for evaluation calls. This is sufficient for the structured JSON output and prevents runaway responses.

**Evaluation prompt design** (prompts.py): The prompt must include:
- The source's URL, title, and snippet
- The user's research topic for relevance context
- Clear rubric for learning_efficiency_score (1-10 scale with anchor descriptions)
- Few-shot example of a scored source
- Instructions to estimate time_estimate_minutes based on content type and length signals

**Scoring rubric** (in the prompt):
- 9-10: Comprehensive tutorial/guide, directly on topic, minimal prerequisite knowledge
- 7-8: Good coverage, on topic, some tangential content
- 5-6: Partially relevant, requires filtering
- 3-4: Tangentially related, mostly noise
- 1-2: Off-topic or low-quality source

**Timeouts**: Wrap each evaluation call with `asyncio.wait_for(coro, timeout=30)` to prevent any single call from hanging indefinitely.

**Error handling**: If a source's evaluation call fails after 1 retry, assign default signals with `score=0`, `content_type="other"`, `key_insight="Evaluation failed"`, and `evaluation_failed=True`. Score of 0 ensures failed sources are never selected for deep-read. Don't block the pipeline.

## Extract Module (extract.py)

### Responsibilities
- Take the top N `EvaluatedSource` objects (by learning efficiency score)
- Extract full page content for each
- Update `deep_read_content` and `extraction_method` on each source

### Extraction Cascade (per source)

1. **Tavily Extract API**: Try first. Handles JS-rendered pages, paywalls. Use `format="markdown"`, `extract_depth="basic"`.
2. **trafilatura fallback**: If Tavily Extract fails or returns empty. Use `favor_precision=True`, `output_format="markdown"`, `include_tables=True`, `include_links=True`. **Important**: trafilatura is synchronous — all calls must be wrapped with `asyncio.to_thread(trafilatura.extract, ...)` to avoid blocking the event loop.
3. **Snippet-only fallback**: If both fail, keep the original snippet from search. Set `extraction_method="snippet_only"`.

### Content Validation

After extraction, validate content quality:
- **Minimum content length**: If extracted content is less than 200 characters, treat it as a failed extraction (likely a paywall login page or error page). Fall to the next cascade step or set `extraction_method="snippet_only"`.
- **Char limit safety net**: Truncate each source's `deep_read_content` to 8,000 characters max. trafilatura's `favor_precision=True` already filters aggressively, so most sources will be well under this.
- This prevents any single massive page from blowing up the synthesis prompt.

### Concurrency

Parallel extraction via `asyncio.gather` with `Semaphore(5)`. Tavily Extract can handle multiple URLs in one call (up to 20), so batch the Tavily calls rather than one-per-source.

**Optimization**: Send ALL top-N URLs to Tavily Extract in a single API call. For any URLs in the `failed_results`, fall back to trafilatura individually. If the entire batch call fails (network error, API down), fall back to trafilatura for ALL URLs individually.

## Synthesize Module (synthesize.py)

### Responsibilities
- Take all evaluated sources (with deep-read content for top N)
- Generate three artifacts in parallel via Claude Opus
- Emit the ranked resource list as a fourth artifact (no Claude call needed)
- Return all four artifacts

### Four Artifacts (Three Parallel Claude Calls + One Direct)

Three synthesis calls launch simultaneously via `asyncio.gather`. The fourth artifact (resources) is assembled directly from the evaluated sources without a Claude call.

1. **Executive Summary**: Input = all deep-read content + all source evaluations. Output = 1-2 page markdown synthesis. Prompt instructs Claude to synthesize across sources, highlight consensus and disagreements, and structure with clear headings. `max_tokens=4096`.

2. **Concept Map / Outline**: Input = same as summary. Output = structured markdown outline showing key concepts, relationships, prerequisites. Hierarchical structure with indentation. Prompt instructs Claude to organize by concept hierarchy, not by source. `max_tokens=2048`.

3. **Flashcards**: Input = same as summary. Output = list of `Flashcard` objects (question/answer pairs). Prompt instructs Claude to extract 10-20 key facts/concepts as testable flashcards. Use prompt-based JSON output with Pydantic validation. `max_tokens=2048`.

4. **Ranked Resource List**: No Claude call. Assemble from the already-evaluated sources — serialize each `EvaluatedSource` with its `IntelligenceSignals` into the artifact data. This is emitted as an `ArtifactEvent(artifact_type="resources")` for the SSE stream.

**Timeouts**: Wrap each synthesis call with `asyncio.wait_for(coro, timeout=120)` to prevent indefinite hangs on complex topics.

### Model Selection

All synthesis calls use `claude-opus-4-6` for highest quality output. These are the user-facing artifacts — quality matters more than cost here.

### Prompt Context Assembly

Build a shared context block used by all three prompts:
- Topic and depth setting
- For each deep-read source: title, URL, learning efficiency score, key insight, and the extracted content
- For snippet-only sources: title, URL, score, key insight, snippet (clearly marked as snippet-only)

This context block is assembled once and reused across all three prompts to ensure consistent artifact generation.

## Pipeline Orchestrator (pipeline.py)

### The Main Function

```python
async def run_research(topic: str, depth: str) -> AsyncGenerator[PipelineEvent, None]:
    """Main pipeline entry point. Yields events as research progresses."""
```

### Orchestration Flow

1. Generate `session_id` (UUID4) and `timestamp` (ISO 8601), validate inputs, load config
2. Yield `StatusEvent("Searching for sources...")`
3. Call `search(topic, depth_config)` → sources
4. Yield `SourcesFoundEvent(sources)`
5. Yield `StatusEvent("Evaluating sources...")`
6. Launch evaluation tasks that put results on an `asyncio.Queue`; drain the queue yielding `SourceEvaluatedEvent` per source
7. Yield `StatusEvent("Reading top sources...")`
8. Call `extract(top_n_sources)` → updated sources with content
9. Yield `StatusEvent("Generating learning artifacts...")`
10. Call `synthesize(all_sources)` → summary, concept_map, flashcards, resources
11. Yield `ArtifactEvent` for each artifact as it completes
12. Package into `ResearchResult`
13. Yield `CompleteEvent(result)`

### Real-Time Evaluation Events (Producer-Consumer Pattern)

You cannot yield from inside a callback or from within `asyncio.gather` tasks. Instead, use a producer-consumer pattern with `asyncio.Queue`:

1. The orchestrator creates an `asyncio.Queue`
2. The `evaluate` module accepts the queue as a parameter
3. Each evaluation task, upon completion, puts its `EvaluatedSource` onto the queue
4. The orchestrator runs a coordination loop: launch all evaluation tasks via `asyncio.gather` in a background task, then drain the queue yielding `SourceEvaluatedEvent` for each result as it arrives
5. When all tasks complete and the queue is empty, proceed to the next stage

This provides real-time progress (each source evaluation is yielded as it completes) without the impossible "yield from callback" pattern.

### Task Cancellation

When the async generator is closed (consumer disconnects), all in-flight tasks must be cancelled to avoid wasted Claude API calls. Use a try/finally pattern in the orchestrator:
- Track all `asyncio.Task` objects created during evaluation and synthesis
- In the finally block, cancel any still-running tasks and await their cancellation
- `contextlib.aclosing` in the consumer triggers generator cleanup on disconnect

### Error Handling in the Orchestrator

- Wrap each stage in try/except
- On non-fatal errors: yield `ErrorEvent(recoverable=True)`, continue to next stage
- On fatal errors (e.g., no search results at all): yield `ErrorEvent(recoverable=False)`, then `CompleteEvent` with partial results
- Use `contextlib.aclosing` pattern in the consumer for cleanup

### Logging

Use Python's `logging` module throughout the pipeline. Each log message should include `session_id`, the current stage name, and relevant context (e.g., source URL, error details). Key log points: stage entry/exit, individual task completion, errors and retries, timing for each stage.

## Prompt Templates (prompts.py)

Store all Claude prompt templates as constants or functions in a dedicated module. This keeps prompts maintainable and testable separately from logic.

Key prompts to define:
1. `EVALUATE_SOURCE_PROMPT` — template for scoring a single source
2. `GENERATE_SUMMARY_PROMPT` — template for executive summary
3. `GENERATE_CONCEPT_MAP_PROMPT` — template for concept map/outline
4. `GENERATE_FLASHCARDS_PROMPT` — template for flashcard generation
5. `GENERATE_COMPLEMENTARY_QUERY_PROMPT` — (optional) for deep mode second query

Each prompt should include:
- Clear role/persona instruction
- The specific task
- Output format specification
- Few-shot examples where helpful (especially for evaluation scoring)

## Dependencies (pyproject.toml)

```
anthropic>=0.52.0
tavily-python>=0.5.0
trafilatura>=2.0.0
httpx>=0.28.0
pydantic>=2.10.0
python-dotenv>=1.0.0
```

Dev dependencies:
```
pytest>=8.0
pytest-asyncio>=0.25.0
respx>=0.22.0        # httpx mocking (for Tavily/Anthropic HTTP calls)
```

**Testing note**: trafilatura uses its own HTTP internals, so `respx` cannot mock its network calls. Mock `trafilatura.extract` directly with `unittest.mock.patch` in tests.

## Environment Setup (.env.example)

```
ANTHROPIC_API_KEY=your-anthropic-api-key
TAVILY_API_KEY=tvly-your-tavily-key
```
