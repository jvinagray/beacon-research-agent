# Beacon Agent Pipeline — TDD Plan

Companion to `claude-plan.md`. Defines what tests to write BEFORE implementing each section.

**Testing stack**: pytest + pytest-asyncio + respx (httpx mocking) + unittest.mock.patch (trafilatura mocking)

**Test location**: `tests/` directory with `conftest.py` for shared fixtures.

---

## Data Models (models.py)

```python
# Test: Source model accepts valid url, title, snippet
# Test: IntelligenceSignals enforces score range 1-10
# Test: IntelligenceSignals accepts all valid content_type literals
# Test: IntelligenceSignals evaluation_failed defaults to False
# Test: EvaluatedSource deep_read_content and extraction_method are optional (None)
# Test: Flashcard requires both question and answer
# Test: ResearchResult artifacts field accepts dict with expected keys
# Test: ResearchResult session_id and timestamp are strings
# Test: All PipelineEvent types serialize to JSON with correct "type" discriminator
# Test: StatusEvent, SourcesFoundEvent, SourceEvaluatedEvent, ArtifactEvent, ErrorEvent, CompleteEvent each have correct literal type
# Test: ArtifactEvent artifact_type includes "resources" literal
```

## Configuration (config.py)

```python
# Test: config loads ANTHROPIC_API_KEY from environment
# Test: config loads TAVILY_API_KEY from environment
# Test: config raises on missing required env vars
# Test: depth_settings returns correct values for "quick" (max_results=10, num_queries=1, deep_read_top_n=3)
# Test: depth_settings returns correct values for "standard" (max_results=20, num_queries=1, deep_read_top_n=7)
# Test: depth_settings returns correct values for "deep" (max_results=20, num_queries=2, deep_read_top_n=10)
# Test: invalid depth value raises ValueError
```

## Search Module (search.py)

```python
# Test: search returns list of Source objects from Tavily response
# Test: search passes correct params (search_depth="basic", topic="general", max_results from depth config)
# Test: search does NOT pass include_raw_content
# Test: search with "quick" depth makes 1 Tavily call
# Test: search with "deep" depth makes 2 Tavily calls with different queries
# Test: deep mode deduplicates results by normalized URL (trailing slash, utm params, fragments)
# Test: deep mode dedup keeps the result with the longer snippet
# Test: search returns empty list gracefully when Tavily returns no results
# Test: search raises or returns error on Tavily API failure
```

## Evaluate Module (evaluate.py)

```python
# Test: evaluate_source makes a Claude API call with correct model (claude-sonnet-4-6)
# Test: evaluate_source sets max_tokens=512
# Test: evaluate_source prompt contains the source URL, title, snippet, and research topic
# Test: evaluate_source parses JSON response into IntelligenceSignals
# Test: evaluate_source handles malformed JSON response (retry then default)
# Test: evaluate_sources runs calls in parallel (verify asyncio.gather usage)
# Test: evaluate_sources respects semaphore limit of 10
# Test: failed evaluation assigns score=0, content_type="other", evaluation_failed=True
# Test: evaluation results are put onto asyncio.Queue when queue is provided
# Test: returned list is sorted by learning_efficiency_score descending
# Test: evaluate_source wraps call with asyncio.wait_for timeout of 30s
# Test: timeout produces failed evaluation defaults (score=0)
```

## Extract Module (extract.py)

```python
# Test: extract sends all URLs to Tavily Extract in a single batch call
# Test: extract uses format="markdown" and extract_depth="basic" for Tavily Extract
# Test: successful Tavily Extract sets extraction_method="tavily_extract"
# Test: failed Tavily Extract URL falls back to trafilatura
# Test: entire Tavily Extract batch failure falls back to trafilatura for all URLs
# Test: trafilatura is called via asyncio.to_thread (not blocking event loop)
# Test: trafilatura called with favor_precision=True, output_format="markdown", include_tables=True, include_links=True
# Test: successful trafilatura sets extraction_method="trafilatura"
# Test: both extraction methods failing sets extraction_method="snippet_only" and keeps original snippet
# Test: content shorter than 200 chars is treated as failed extraction
# Test: content longer than 8000 chars is truncated to 8000
# Test: extraction respects Semaphore(5) concurrency limit
```

## Synthesize Module (synthesize.py)

```python
# Test: synthesize makes 3 parallel Claude API calls (summary, concept_map, flashcards)
# Test: all synthesis calls use model claude-opus-4-6
# Test: summary call sets max_tokens=4096
# Test: concept_map call sets max_tokens=2048
# Test: flashcards call sets max_tokens=2048
# Test: synthesis calls wrapped with asyncio.wait_for timeout of 120s
# Test: shared context block includes deep-read sources with content and snippet-only sources with snippet
# Test: summary returns markdown string
# Test: concept_map returns markdown string
# Test: flashcards returns list of Flashcard objects parsed from JSON
# Test: resources artifact is assembled from EvaluatedSource list without Claude call
# Test: resources artifact contains all sources with their IntelligenceSignals
# Test: synthesis failure for one artifact doesn't block others (partial results)
```

## Prompt Templates (prompts.py)

```python
# Test: EVALUATE_SOURCE_PROMPT is a non-empty string containing scoring rubric
# Test: EVALUATE_SOURCE_PROMPT contains few-shot example
# Test: GENERATE_SUMMARY_PROMPT is a non-empty string
# Test: GENERATE_CONCEPT_MAP_PROMPT is a non-empty string
# Test: GENERATE_FLASHCARDS_PROMPT is a non-empty string
# Test: prompt template functions accept topic and source data, return formatted strings
```

## Pipeline Orchestrator (pipeline.py)

```python
# Test: run_research is an async generator yielding PipelineEvent types
# Test: run_research generates session_id as UUID4
# Test: run_research generates timestamp in ISO 8601 format
# Test: pipeline yields StatusEvent before each stage
# Test: pipeline yields SourcesFoundEvent after search
# Test: pipeline yields SourceEvaluatedEvent for each source (via Queue drain)
# Test: pipeline yields ArtifactEvent for each of 4 artifacts (summary, concept_map, flashcards, resources)
# Test: pipeline yields CompleteEvent with full ResearchResult at end
# Test: pipeline yields ErrorEvent(recoverable=True) on non-fatal stage error and continues
# Test: pipeline yields ErrorEvent(recoverable=False) on fatal error (e.g., no search results)
# Test: pipeline cancels in-flight tasks when generator is closed
# Test: invalid depth value yields ErrorEvent
# Test: full pipeline integration test with all mocked dependencies produces complete event stream
```

## Shared Test Fixtures (conftest.py)

```python
# Fixture: mock_anthropic_client — returns AsyncAnthropic mock with preset responses
# Fixture: mock_tavily_client — returns AsyncTavilyClient mock with preset search/extract responses
# Fixture: sample_sources — list of 5 Source objects for testing
# Fixture: sample_evaluated_sources — list of 5 EvaluatedSource objects with signals
# Fixture: sample_intelligence_signals — IntelligenceSignals with typical values
# Fixture: sample_deep_read_content — realistic markdown content string
```
