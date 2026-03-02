# Opus Review

**Model:** claude-opus-4-6
**Generated:** 2026-03-02

---

## Overall Assessment

Well-structured plan for hackathon scope. Async generator with typed events is the right choice. Several concrete issues from spec inconsistencies to runtime footguns.

## Critical Issues

### 1. Async generator cannot yield from callbacks (2a, 2b)
The plan's "callback" pattern for real-time evaluation events won't work — you can't yield from a callback inside asyncio.gather. Must use producer-consumer with asyncio.Queue. Need concrete design for the drain-and-gather coordination.

### 2. trafilatura is synchronous and will block the event loop (5c)
trafilatura.extract() does CPU-intensive HTML parsing synchronously. Must use asyncio.to_thread() or loop.run_in_executor(). The extraction semaphore won't help because it blocks the event loop thread.

## High Priority Issues

### 3. Default score of 5 for failed evaluations corrupts ranking (3a)
Score of 5 places failed sources in the middle of ranking — they could be selected for deep-read. Should assign score 0 or add evaluation_failed flag.

### 4. Missing "resources" artifact type breaks contract with split 02 (1b)
BEACON_SPEC specifies 4 artifacts including Ranked Resource List. Plan only generates 3. ArtifactEvent.artifact_type doesn't include "resources". Split 02 expects it.

### 5. No cancellation of in-flight tasks on consumer disconnect (8c)
If SSE consumer disconnects, generator continues making expensive Claude calls. contextlib.aclosing doesn't auto-cancel asyncio.gather tasks — need explicit cancellation.

### 6. No max_tokens specified for Claude calls (4c)
Evaluation calls should have ~512 max_tokens. Synthesis calls need bounded limits (4096 summary, 2048 concept map, 2048 flashcards).

## Medium Priority Issues

### 7. ResearchResult shape differs from claude-spec (1c)
Plan flattens artifacts into individual fields vs dict. Split 02 must know.

### 8. No timeout on individual Claude calls (3b)
Opus synthesis calls could take 30-60+ seconds. Need asyncio.wait_for with concrete timeouts (30s eval, 120s synthesis).

### 9. content_type Literal too narrow (8e)
Missing: forum, repository, newsletter, course, "other". Claude forced to miscategorize.

### 10. No logging strategy (8f)
Pipeline with concurrent async stages needs structured logging for debugging.

### 11. Tavily Extract batch failure underspecified (3c)
If entire batch call fails, fall back to trafilatura for ALL URLs individually.

### 12. Empty extraction results not handled (3d)
Paywalled sites may return login pages. Add minimum content length check (>200 chars).

### 13. 5000 char truncation may be too aggressive (4a)
Consider 8000-10000 for standard/deep, or proportional allocation by score.

### 14. Session ID generation not specified (8a)
Should be UUID4 at start of run_research().

### 15. Timestamp format not specified (8b)
Should be ISO 8601.

### 16. URL deduplication incomplete (8d)
Normalize URLs (strip trailing slash, remove utm_* params, remove fragments).

### 17. Structured output should be fallback-first (6a)
Beta features on Foundry — prompt+JSON parse should be default, structured output the upgrade path.

### 18. PipelineEvent union type needs discriminated union (minor)
Use Annotated[..., Discriminator("type")] for proper Pydantic serialization.

### 19. respx won't mock trafilatura internal calls (minor)
Mock trafilatura.extract directly with unittest.mock.patch.
