# Section 5: Drill Down -- Backend Endpoint

## Overview

This section creates a streaming SSE endpoint for focused sub-research on specific concepts from the summary. When a user clicks a drill-down link in the summary, the frontend posts to this endpoint, and the backend generates a structured deep-dive using the existing research sources as context. This section also modifies the summary generation prompt to include `drill://` links, which was deferred from Section 1 to avoid broken links during incremental implementation.

**Files created:**
- `02-api-streaming/server/drilldown.py`
- `02-api-streaming/tests/test_drilldown.py`

**Files modified:**
- `02-api-streaming/server/models.py` -- added `DrillDownRequest` with whitespace validator
- `02-api-streaming/server/routes.py` -- added `POST /api/drilldown/{session_id}` route with concurrency guard
- `02-api-streaming/tests/test_routes.py` -- added `TestDrilldownEndpoint` class (7 tests)
- `01-agent-pipeline/beacon/prompts.py` -- added drill-down link instructions to `GENERATE_SUMMARY_PROMPT`

**Dependencies:** None (Batch 1 -- no dependencies on other sections). This section blocks Section 6 (Drill Down Frontend).

---

## Implementation Summary

### 1. Prompt Modification
**File:** `01-agent-pipeline/beacon/prompts.py`

Added drill-down link instructions to `GENERATE_SUMMARY_PROMPT`, appended after the "Focus on..." paragraph. Coexists with the `cite:N` citation instructions from Section 1.

### 2. DrillDownRequest Model
**File:** `02-api-streaming/server/models.py`

```python
class DrillDownRequest(BaseModel):
    concept: str = Field(..., min_length=1, max_length=500)

    @field_validator("concept")
    @classmethod
    def concept_not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("concept must not be blank")
        return v
```

**Deviation from plan:** Added `field_validator` to strip whitespace and reject blank concepts (code review fix).

### 3. Drilldown Module
**File:** `02-api-streaming/server/drilldown.py`

- Reuses `build_chat_context(result)` from `chat.py`
- Uses string concatenation (`context + "\n\n" + _DRILLDOWN_INSTRUCTIONS`) instead of `str.format()` to avoid crashes when source content contains curly braces (code review fix)
- User message: `f"Deep dive into: {concept}"`
- Uses `EVAL_MODEL`, `max_tokens=4096`
- Streaming loop identical to `stream_chat_response`
- Yields `delta`, `done` (with concept), and `error` events

### 4. Route Addition
**File:** `02-api-streaming/server/routes.py`

- `POST /api/drilldown/{session_id}` follows the same pattern as chat/rewrite endpoints
- Session lookup with 404, concurrency guard with 429, EventSourceResponse with ping/timeout

---

## Tests

### Drilldown Module Tests (`test_drilldown.py`) -- 5 tests
- `test_yields_delta_events_with_content` - Verifies delta events contain streamed text
- `test_yields_done_event_with_concept` - Verifies done event includes the concept
- `test_uses_build_chat_context` - Verifies chat context reuse
- `test_uses_eval_model` - Verifies EVAL_MODEL and max_tokens=4096
- `test_yields_error_event_on_failure` - Verifies error handling on API failure

### Route Tests (`test_routes.py` - TestDrilldownEndpoint) -- 7 tests
- `test_returns_404_unknown_session` - Unknown session
- `test_returns_404_expired_session` - Expired session (code review addition)
- `test_returns_422_for_whitespace_only_concept` - Whitespace-only validation (code review addition)
- `test_returns_422_for_empty_concept` - Empty concept validation
- `test_returns_422_for_concept_over_500_chars` - Max length validation
- `test_returns_200_sse_for_valid_session` - Happy path SSE response
- `test_returns_429_concurrent_stream` - Concurrency guard

Total: **12 new tests**, all passing. Full suite: 130 tests passing with no regressions.

---

## Code Review Deviations

1. **str.format() replaced with string concatenation** -- The plan used `_DRILLDOWN_SYSTEM_TEMPLATE.format(context=context)` but source content may contain curly braces, causing crashes. Fixed by using `context + "\n\n" + _DRILLDOWN_INSTRUCTIONS`.
2. **Whitespace validator added** -- `DrillDownRequest.concept` now strips whitespace and rejects blank-after-strip to prevent meaningless API calls.
3. **Additional tests** -- Added expired-session test and whitespace-only concept test beyond the plan's test outline.
