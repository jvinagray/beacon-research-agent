# Integration Notes — Opus Review Feedback

**Reviewer:** claude-opus-4-6
**Date:** 2026-03-02

---

## Issues Integrated

### 1. Async generator cannot yield from callbacks (Critical — Issue #1)
**Integrating fully.** The plan's pipeline.py section already mentioned asyncio.Queue but the evaluate module section still described a "callback" pattern. Updating both sections to use a consistent producer-consumer Queue design throughout. The orchestrator drains the queue between gather chunks.

### 2. trafilatura is synchronous and blocks the event loop (Critical — Issue #2)
**Integrating fully.** Adding `asyncio.to_thread(trafilatura.extract, ...)` wrapping in the extract module. The extraction semaphore still applies but now limits concurrent threads rather than blocking the event loop.

### 3. Default score of 5 for failed evaluations (High — Issue #3)
**Integrating fully.** Changing failed evaluation default from score=5 to score=0 with an `evaluation_failed=True` flag on IntelligenceSignals. This ensures failed sources never get selected for deep-read.

### 4. Missing "resources" artifact type (High — Issue #4)
**Integrating fully.** Adding `"resources"` to ArtifactEvent.artifact_type and adding a resources artifact generation step in the synthesize module. The ranked resource list is already in ResearchResult.sources — the ArtifactEvent just needs to emit it for the SSE stream so split-02 can consume it.

### 5. No cancellation on consumer disconnect (High — Issue #5)
**Integrating.** Adding guidance on explicit task cancellation via try/finally in the orchestrator. When the generator is closed (consumer disconnect), cancel all in-flight tasks.

### 6. No max_tokens specified for Claude calls (High — Issue #6)
**Integrating fully.** Adding concrete max_tokens: 512 for evaluation, 4096 for summary, 2048 for concept map, 2048 for flashcards.

### 7. ResearchResult shape differs from spec (Medium — Issue #7)
**Integrating.** Updating ResearchResult to use `artifacts: dict[str, Any]` matching the spec's structure rather than flat fields. This ensures split-02 can consume the output without translation.

### 8. No timeout on individual Claude calls (Medium — Issue #8)
**Integrating.** Adding `asyncio.wait_for` with concrete timeouts: 30s for evaluation, 120s for synthesis.

### 9. content_type Literal too narrow (Medium — Issue #9)
**Integrating.** Expanding to include: "tutorial", "paper", "docs", "opinion", "video", "forum", "repository", "course", "other".

### 10. No logging strategy (Medium — Issue #10)
**Integrating briefly.** Adding a note about using Python's `logging` module with structured context (topic, session_id, stage) at key pipeline points. Not over-engineering for hackathon scope.

### 11. Tavily Extract batch failure (Medium — Issue #11)
**Integrating.** Clarifying that if the entire batch call fails, fall back to trafilatura for ALL URLs individually.

### 12. Empty extraction results not handled (Medium — Issue #12)
**Integrating.** Adding minimum content length check (>200 chars) after extraction. Below that threshold, treat as failed and fall to next cascade step or snippet-only.

### 13. 5000 char truncation too aggressive (Medium — Issue #13)
**Partially integrating.** Increasing default to 8000 chars. Not doing proportional allocation — too complex for hackathon scope.

### 14. Session ID generation (Medium — Issue #14)
**Integrating.** Specifying UUID4 at start of run_research().

### 15. Timestamp format (Medium — Issue #15)
**Integrating.** Specifying ISO 8601 format.

### 16. URL deduplication incomplete (Medium — Issue #16)
**Integrating.** Adding URL normalization: strip trailing slash, remove utm_* params, remove fragments before dedup comparison.

### 17. Structured output should be fallback-first (Medium — Issue #17)
**Integrating.** Making prompt + JSON parse the default approach, with structured output (output_config) as an upgrade path if Foundry beta stabilizes.

### 19. respx won't mock trafilatura (Minor — Issue #19)
**Integrating.** Noting that trafilatura should be mocked with `unittest.mock.patch` rather than respx.

---

## Issues NOT Integrated

### 18. PipelineEvent discriminated union (Minor)
**Not integrating.** Using `Annotated[..., Discriminator("type")]` is a nice Pydantic optimization but adds complexity. The simple Union type with literal type fields is sufficient for hackathon scope — Pydantic will serialize correctly since each event has a unique `type` literal.
