<!-- PROJECT_CONFIG
runtime: python-uv
test_command: uv run pytest
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-foundation
section-02-models
section-03-search
section-04-evaluate
section-05-extract
section-06-synthesize
section-07-pipeline
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-foundation | - | all | Yes |
| section-02-models | 01 | 03, 04, 05, 06, 07 | No |
| section-03-search | 02 | 07 | Yes |
| section-04-evaluate | 02 | 07 | Yes |
| section-05-extract | 02 | 07 | Yes |
| section-06-synthesize | 02 | 07 | Yes |
| section-07-pipeline | 03, 04, 05, 06 | - | No |

## Execution Order

1. section-01-foundation (no dependencies)
2. section-02-models (after 01)
3. section-03-search, section-04-evaluate, section-05-extract, section-06-synthesize (parallel after 02)
4. section-07-pipeline (after 03, 04, 05, 06)

## Section Summaries

### section-01-foundation
Project scaffolding: pyproject.toml, .env.example, directory structure, conftest.py with shared fixtures, config.py with environment loading and depth settings.

### section-02-models
All Pydantic data models (Source, IntelligenceSignals, EvaluatedSource, Flashcard, ResearchResult) and pipeline event types (StatusEvent, SourcesFoundEvent, SourceEvaluatedEvent, ArtifactEvent, ErrorEvent, CompleteEvent, PipelineEvent union). Also prompts.py with all Claude prompt templates.

### section-03-search
Tavily search integration: AsyncTavilyClient setup, single/dual query execution, URL normalization, deduplication logic. Tests with mocked Tavily responses.

### section-04-evaluate
Claude-based source evaluation: parallel evaluation with semaphore, prompt-based JSON parsing, asyncio.Queue producer pattern, timeout handling, failed evaluation defaults (score=0). Tests with mocked Claude responses.

### section-05-extract
Content extraction cascade: Tavily Extract batch API, trafilatura fallback (via asyncio.to_thread), snippet-only fallback, content validation (200 char minimum, 8000 char truncation). Tests with mocked Tavily Extract and patched trafilatura.

### section-06-synthesize
Artifact generation: three parallel Claude Opus calls (summary, concept_map, flashcards) with max_tokens and timeouts, plus direct resources artifact assembly. Shared context block builder. Tests with mocked Claude responses.

### section-07-pipeline
Main orchestrator: run_research async generator, producer-consumer Queue pattern for evaluation events, stage sequencing, task cancellation on disconnect, error handling (recoverable vs fatal), logging setup. Integration test of full pipeline with all mocked dependencies.
