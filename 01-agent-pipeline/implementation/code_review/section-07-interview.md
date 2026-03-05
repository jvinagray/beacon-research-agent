# Section 07 Pipeline - Code Review Interview

## User Decisions

### 1. Client creation gap (MEDIUM -> FIX)
**Decision:** Fix in pipeline - create AsyncAnthropic and AsyncTavilyClient in pipeline and pass to synthesize/extract.
**Action:** Create clients after get_config() and pass them through.

### 2. Top-level exception handler (HIGH -> FIX)
**Decision:** Yes, add catch-all around entire pipeline body that yields ErrorEvent + CompleteEvent on unexpected errors.

## Auto-Fixes

### 3. Redundant exception handler (LOW -> AUTO-FIX)
`except (ValueError, Exception)` -> `except Exception` (line 61)

### 4. Wrap eval_task await in try/except (CRITICAL -> AUTO-FIX)
Wrap `evaluated_sources = await eval_task` to handle evaluate_sources exceptions gracefully.

## Let Go

- Stage timing logging (observability nice-to-have)
- Debug logging for individual evaluations
- SourcesFoundEvent count=0 semantics (test expects it)
- Test cancellation assertion strength
- ArtifactEvent isinstance check performance
