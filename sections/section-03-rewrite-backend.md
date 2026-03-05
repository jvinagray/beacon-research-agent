# Section 3: Complexity Slider -- Backend Rewrite Endpoint

## Overview

This section creates a new streaming SSE endpoint that rewrites the research summary at a requested complexity level (1-5). It follows the exact same pattern as the existing chat endpoint in `02-api-streaming/server/chat.py`. Level 3 ("General audience") is the original summary and is handled client-side (no API call), so the backend only needs to handle levels 1, 2, 4, and 5.

This section has no dependencies on other sections. It is a standalone backend addition. The frontend consumer (Section 4: Complexity Slider -- Frontend Hook and UI) depends on this section.

## Files to Create

- `02-api-streaming/server/rewrite.py` -- new module with `stream_rewrite()` async generator
- `02-api-streaming/tests/test_rewrite.py` -- unit tests for the rewrite module

## Files to Modify

- `02-api-streaming/server/models.py` -- add `RewriteRequest` model
- `02-api-streaming/server/routes.py` -- add `POST /api/rewrite/{session_id}` route

---

## Tests (Write First)

Create `02-api-streaming/tests/test_rewrite.py` with the following test cases. These tests follow the exact patterns established in `test_chat.py`: mock the Anthropic client, use `_make_source()` and `_make_result()` helpers, and verify the event structure.

### Rewrite Module Tests

```python
"""Tests for the rewrite module: level prompts and streaming rewrite."""
import json
from unittest.mock import AsyncMock, MagicMock, patch

from beacon.models import EvaluatedSource, IntelligenceSignals, ResearchResult


# ---------------------------------------------------------------------------
# Helpers (same pattern as test_chat.py)
# ---------------------------------------------------------------------------

def _make_source(title="Test", url="https://example.com", score=5, snippet="snippet"):
    """Create a minimal EvaluatedSource for testing."""
    return EvaluatedSource(
        url=url, title=title, snippet=snippet,
        signals=IntelligenceSignals(
            learning_efficiency_score=score, content_type="tutorial",
            time_estimate_minutes=10, recency="2024",
            key_insight="insight", coverage=["test"],
        ),
    )


def _make_result(sources=None, summary="Short summary"):
    """Create a minimal ResearchResult for testing."""
    return ResearchResult(
        topic="test topic", depth="standard",
        sources=sources or [], artifacts={"summary": summary},
        session_id="test-session", timestamp="2024-01-01T00:00:00Z",
    )


# ---------------------------------------------------------------------------
# LEVEL_PROMPTS tests
# ---------------------------------------------------------------------------

class TestLevelPrompts:
    # Test: LEVEL_PROMPTS contains entries for levels 1-5
    # Verify all five levels are present as keys in the dict.

    # Test: LEVEL_PROMPTS does not contain entry for level 3 (handled client-side)
    # -- OR -- level 3 is present but the client short-circuits before calling
    # the endpoint. The plan says level 3 = "General audience" and the
    # client returns original summary without API call. Having the prompt
    # present is harmless, but the dict MUST cover 1-5 for completeness.
    pass


# ---------------------------------------------------------------------------
# stream_rewrite tests
# ---------------------------------------------------------------------------

class TestStreamRewrite:
    # Test: stream_rewrite yields delta events with content strings
    # Mock the Anthropic client to return a text_stream yielding two chunks.
    # Collect all JSON-decoded events. Verify delta events exist with content.
    # Pattern: identical to TestStreamChatResponse.test_yields_delta_events_with_text

    # Test: stream_rewrite yields a done event with level number at the end
    # The final event must be {"type": "done", "level": <requested_level>}.

    # Test: stream_rewrite uses EVAL_MODEL, not SYNTH_MODEL
    # After calling stream_rewrite, inspect mock_client.messages.stream call
    # and verify the `model` kwarg equals EVAL_MODEL ("claude-sonnet-4-6").
    pass
```

### Route Tests for Rewrite Endpoint

Add these test cases to the existing `02-api-streaming/tests/test_routes.py` file, in a new `TestRewriteEndpoint` class. Follow the same patterns as the existing `TestChatEndpoint` class.

```python
class TestRewriteEndpoint:
    # Test: POST /api/rewrite/{session_id} returns 404 for unknown session
    # Send POST to /api/rewrite/nonexistent-session-id with {"level": 1}.
    # Assert 404.

    # Test: POST /api/rewrite/{session_id} returns 400 for level out of range (0, 6)
    # Store a valid session. Send POST with {"level": 0} and {"level": 6}.
    # Assert 422 (Pydantic validation rejects ge=1/le=5 violations).
    # NOTE: FastAPI returns 422 for Pydantic validation failures, not 400.

    # Test: POST /api/rewrite/{session_id} returns 429 if stream already active
    # Manually insert session_id into _active_rewrite_streams dict.
    # Send POST. Assert 429. Clean up.
    # Pattern: identical to TestChatEndpoint.test_returns_429_concurrent_stream

    # Test: POST /api/rewrite/{session_id} returns EventSourceResponse with correct content-type
    # Store a valid session. Mock stream_rewrite to yield a single done event.
    # Send POST with {"level": 1}. Assert 200 and content-type contains "text/event-stream".
    # Pattern: identical to TestChatEndpoint.test_returns_200_sse_for_valid_session
    pass
```

---

## Implementation Details

### 1. RewriteRequest Model

**File:** `02-api-streaming/server/models.py`

Add a new Pydantic model after the existing `ChatRequest`:

```python
class RewriteRequest(BaseModel):
    """POST /api/rewrite/{session_id} request body."""
    level: int = Field(..., ge=1, le=5)
```

This uses Pydantic's `ge` (greater-than-or-equal) and `le` (less-than-or-equal) validators, so levels 0 and 6 are rejected at validation time with a 422 response from FastAPI.

### 2. Rewrite Module

**File:** `02-api-streaming/server/rewrite.py` (new file)

This module contains two things:

**`LEVEL_PROMPTS`** -- a dict mapping integer levels 1-5 to rewrite instruction strings:

| Level | Label | Instruction |
|-------|-------|-------------|
| 1 | ELI5 | "Explain like I'm 8 years old. Use simple analogies, no jargon." |
| 2 | Simple | "Write for a high-school student. Define key terms when first used." |
| 3 | General | "General audience." (present for completeness; client short-circuits) |
| 4 | Technical | "Write for a working professional. Use technical terms freely." |
| 5 | Expert | "Write for a domain expert. Use precise language, include caveats and methodologies." |

**`stream_rewrite(result: ResearchResult, level: int)`** -- an async generator that:

1. Retrieves the summary text from `result.artifacts["summary"]`
2. Constructs a system prompt: "You are a research communicator. Rewrite the following summary at the requested complexity level. Preserve all factual claims. Best-effort preserve citation links `[Title](cite:N)` and concept links `[text](drill://...)`. Keep markdown structure."
3. Builds messages with the summary text and the level-specific instruction from `LEVEL_PROMPTS`
4. Creates an `AsyncAnthropic` client using the API key from `get_config()`
5. Streams via `client.messages.stream()` with `model=EVAL_MODEL` (sonnet), `max_tokens=4096`
6. For each text chunk, yields `json.dumps({"type": "delta", "content": text})`
7. After completion, yields `json.dumps({"type": "done", "level": level})`
8. On exception, yields `json.dumps({"type": "error", "message": str(e)})`

This follows the exact pattern of `stream_chat_response()` in `chat.py`.

Key imports from existing codebase:
- `from beacon.config import EVAL_MODEL, get_config`
- `from beacon.models import ResearchResult`
- `from anthropic import AsyncAnthropic`

### 3. Route Addition

**File:** `02-api-streaming/server/routes.py`

Add the following, following the exact chat endpoint pattern (lines 79-113):

1. Import `stream_rewrite` from `server.rewrite` and `RewriteRequest` from `server.models`
2. Add module-level concurrency guard: `_active_rewrite_streams: dict[str, bool] = {}`
3. Add endpoint:

```python
@router.post("/api/rewrite/{session_id}")
async def rewrite(request: Request, session_id: str, body: RewriteRequest):
    """Stream a summary rewrite at the requested complexity level."""
```

The endpoint:
1. Gets session from `request.app.state.sessions`
2. Raises `HTTPException(404)` if not found
3. Checks `_active_rewrite_streams`, raises `HTTPException(429)` if active
4. Sets active flag, defines `_stream()` inner generator with `finally` cleanup
5. Returns `EventSourceResponse` with ping/timeout/headers

---

## Architecture Notes

- **Model used:** `EVAL_MODEL` (sonnet) for fast response
- **Concurrency guard:** One rewrite stream per session at a time
- **Error handling:** Follows the chat pattern -- LLM errors yielded as error events
- **Level 3 short-circuit:** Client returns original text without API call. Backend still accepts level 3 if sent.

---

## Implementation Record

**Status:** Complete

### Actual Files Created
- `02-api-streaming/server/rewrite.py` -- `LEVEL_PROMPTS` dict, `_SYSTEM_PROMPT` constant, `stream_rewrite()` async generator
- `02-api-streaming/tests/test_rewrite.py` -- 5 tests (2 LEVEL_PROMPTS, 3 stream_rewrite)

### Actual Files Modified
- `02-api-streaming/server/models.py` -- added `RewriteRequest` model
- `02-api-streaming/server/routes.py` -- added imports, `_active_rewrite_streams` guard, `POST /api/rewrite/{session_id}` endpoint
- `02-api-streaming/tests/test_routes.py` -- added `TestRewriteEndpoint` class with 4 tests

### Deviations from Plan
- `_SYSTEM_PROMPT` extracted as a module-level constant (plan had it inline) -- cleaner than chat.py's approach
- Used `LEVEL_PROMPTS[level]` (direct access) instead of `.get()` with fallback -- per code review, fails fast since Pydantic validates at API boundary
- Test for `EVAL_MODEL` imports the constant from `beacon.config` rather than hardcoding the string -- per code review

### Test Summary
- 9 new tests total (5 in test_rewrite.py, 4 in test_routes.py)
- Full suite: 118 tests passing, zero regressions
