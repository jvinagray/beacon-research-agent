# Section 03: Chat Backend

## Overview

This section adds the chat API backend to the `02-api-streaming` layer. It enables a NotebookLM-style Q&A experience where users ask questions about their research and receive streaming responses grounded in collected sources. The backend consists of three parts:

1. **New Pydantic models** (`ChatMessage`, `ChatRequest`) in `server/models.py`
2. **New chat module** (`server/chat.py`) with context builder and streaming response generator
3. **New route** (`POST /api/chat/{session_id}`) in `server/routes.py`

This section touches only the `02-api-streaming` Python layer and has no frontend dependencies. It blocks **section-04-chat-types-hook** (which builds the frontend hook that calls this endpoint).

---

## Architecture Context

The Beacon API (`02-api-streaming`) is a FastAPI application using `sse-starlette` for SSE streaming. Key details the implementer needs to know:

- **App factory** is in `02-api-streaming/server/app.py`. It creates `app.state.sessions` (a `SessionStore`) and `app.state.research_semaphore` (an `asyncio.Semaphore(3)`).
- **SessionStore** is in `02-api-streaming/server/sessions.py`. It stores `ResearchResult` objects keyed by `session_id` (UUID4) with a 60-minute sliding TTL. The `get(session_id)` method returns `ResearchResult | None`.
- **Existing routes** are in `02-api-streaming/server/routes.py`. The router is an `APIRouter()` instance imported by `app.py`.
- **Pipeline models** are in `01-agent-pipeline/beacon/models.py`. The `ResearchResult` model has fields: `topic`, `depth`, `sources` (list of `EvaluatedSource`), `artifacts` (dict with keys like `"summary"`, `"concept_map"`, etc.), `session_id`, `timestamp`. Each `EvaluatedSource` has `url`, `title`, `snippet`, `signals` (with `learning_efficiency_score`, `key_insight`, etc.), `deep_read_content` (optional string), and `extraction_method`.
- **Config constants** in `01-agent-pipeline/beacon/config.py`: `EVAL_MODEL = "claude-sonnet-4-6"` is the model to use for chat (lighter/faster than SYNTH_MODEL). The Anthropic API key is loaded via `get_config()`.
- **Anthropic SDK**: The pipeline uses `AsyncAnthropic` from the `anthropic` package. For streaming, use `client.messages.stream()` which provides a `.text_stream` async iterator.
- **SSE pattern**: Existing SSE streaming uses `sse_starlette.EventSourceResponse` wrapping an async generator.
- **Test infrastructure**: Tests use `pytest-asyncio` with `asyncio_mode = "auto"`. Fixtures are in `02-api-streaming/tests/conftest.py`. The test client uses `httpx.AsyncClient` with `ASGITransport`. A `sample_research_result` fixture provides a fully populated `ResearchResult`.

---

## Tests (Write First)

### Test File: `02-api-streaming/tests/test_chat.py`

This is a new file. It tests the `build_chat_context` and `stream_chat_response` functions from `server/chat.py`.

```python
"""Tests for the chat module: context builder and streaming response."""
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from beacon.models import EvaluatedSource, IntelligenceSignals, ResearchResult


# ---------------------------------------------------------------------------
# build_chat_context tests
# ---------------------------------------------------------------------------

class TestBuildChatContext:
    # Test: build_chat_context includes summary artifact (truncated to 3000 chars)
    # - Create a ResearchResult with a summary artifact longer than 3000 chars
    # - Call build_chat_context(result)
    # - Assert the returned string contains the first 3000 chars of the summary
    # - Assert the full (>3000 char) summary is NOT present verbatim

    # Test: build_chat_context selects top 8 sources by score
    # - Create a ResearchResult with 12 sources having varied learning_efficiency_scores
    # - Call build_chat_context(result)
    # - Assert only the top 8 sources (by score) appear in the context string
    # - Assert lower-scored sources are excluded

    # Test: build_chat_context truncates deep_read_content to 4000 chars per source
    # - Create a source with deep_read_content longer than 4000 chars
    # - Call build_chat_context(result)
    # - Assert only the first 4000 chars of deep_read_content appear

    # Test: build_chat_context falls back to snippet when deep_read_content is None
    # - Create a source with deep_read_content=None and a snippet
    # - Call build_chat_context(result)
    # - Assert the snippet appears in the context string

    # Test: build_chat_context includes source metadata (title, URL, key_insight)
    # - Create a source with known title, URL, key_insight
    # - Call build_chat_context(result)
    # - Assert all three values appear in the context string


# ---------------------------------------------------------------------------
# stream_chat_response tests
# ---------------------------------------------------------------------------

class TestStreamChatResponse:
    # Test: stream_chat_response yields delta events with text content
    # - Mock AsyncAnthropic client with a streaming response that yields text chunks
    # - Call stream_chat_response and collect events
    # - Assert delta events are yielded with correct content

    # Test: stream_chat_response yields done event with sources at end
    # - Mock AsyncAnthropic client with a streaming response
    # - Call stream_chat_response and collect events
    # - Assert the final event has type "done" and includes source metadata

    # Test: stream_chat_response yields error event on Anthropic failure
    # - Mock AsyncAnthropic client to raise an exception
    # - Call stream_chat_response and collect events
    # - Assert an error event is yielded with a message
```

### Test File: `02-api-streaming/tests/test_routes.py` (append to existing)

Add a new test class at the bottom of the existing file for chat route tests.

```python
# ---------------------------------------------------------------------------
# POST /api/chat/{session_id}
# ---------------------------------------------------------------------------

class TestChatEndpoint:
    # Test: POST /api/chat/{session_id} returns 404 for unknown session
    # - POST to /api/chat/nonexistent-id with a valid ChatRequest body
    # - Assert 404 response

    # Test: POST /api/chat/{session_id} returns 404 for expired session
    # - Store a session, manually expire its timestamp
    # - POST to the chat endpoint
    # - Assert 404 response

    # Test: POST /api/chat/{session_id} returns 200 with SSE content-type for valid session
    # - Store a valid session via app.state.sessions
    # - POST to /api/chat/{session_id} with a valid message
    # - Assert 200 status and "text/event-stream" content-type

    # Test: POST /api/chat/{session_id} validates message max_length (4000)
    # - POST with a message longer than 4000 characters
    # - Assert 422 response

    # Test: POST /api/chat/{session_id} validates history max_length (40)
    # - POST with a history array containing more than 40 messages
    # - Assert 422 response

    # Test: POST /api/chat/{session_id} returns 429 when concurrent stream active for same session
    # - Simulate an active chat stream for session X
    # - POST another chat request for session X
    # - Assert 429 response
```

---

## Implementation Details

### 1. New Pydantic Models

**File: `02-api-streaming/server/models.py`**

Add two new models to the existing file. Do not modify existing models.

```python
class ChatMessage(BaseModel):
    """A single message in a chat conversation."""
    role: Literal["user", "assistant"]
    content: str

class ChatRequest(BaseModel):
    """POST /api/chat/{session_id} request body."""
    message: str = Field(..., max_length=4000)
    history: list[ChatMessage] = Field(default=[], max_length=40)
```

The `Literal` import already exists in the file. `Field` is also already imported. The `max_length` constraint on the `history` list uses Pydantic v2's `Field(max_length=N)` which validates the list length.

### 2. Chat Module

**Create: `02-api-streaming/server/chat.py`**

This module contains two functions.

**`build_chat_context(result: ResearchResult) -> str`**

Builds the system prompt string from a `ResearchResult`:

1. Start with a role instruction: `"You are a research assistant. Answer questions based on the sources below. Cite sources by title when relevant."`
2. Include the `summary` artifact from `result.artifacts.get("summary", "")`, truncated to 3000 characters, as an overview section.
3. Select the top 8 sources from `result.sources`, sorted by `source.signals.learning_efficiency_score` in descending order.
4. For each selected source, include:
   - Title and URL
   - `key_insight` from signals
   - `learning_efficiency_score` from signals
   - `deep_read_content` truncated to 4000 characters. If `deep_read_content` is `None`, use `snippet` instead.
5. Return the assembled string.

**`stream_chat_response(result: ResearchResult, message: str, history: list[ChatMessage]) -> AsyncGenerator[str, None]`**

Streams a chat response as JSON-encoded SSE data lines:

1. Build the system prompt via `build_chat_context(result)`.
2. Construct the messages array: convert each `ChatMessage` in `history` to `{"role": msg.role, "content": msg.content}`, then append `{"role": "user", "content": message}`.
3. Create an `AsyncAnthropic` client using `get_config().anthropic_api_key`.
4. Use `client.messages.stream()` as an async context manager with:
   - `model=EVAL_MODEL` (imported from `beacon.config` — this is `"claude-sonnet-4-6"`)
   - `max_tokens=4096`
   - `system=system_prompt` (the built context)
   - `messages=messages_array`
5. Iterate over the stream's `.text_stream` async iterator. For each text chunk, yield a JSON string: `json.dumps({"type": "delta", "content": chunk})`.
6. After the stream completes, determine which sources were used in context (the top 8 selected by `build_chat_context`). Yield a final JSON string: `json.dumps({"type": "done", "sources": [{"title": s.title, "url": s.url} for s in top_sources]})`.
7. Wrap the entire streaming section in a try/except. On any exception, yield `json.dumps({"type": "error", "message": str(e)})`.

The function is an `AsyncGenerator[str, None]` — each yielded string becomes an SSE `data:` line. The route handler wraps this in `EventSourceResponse`.

**Key imports for chat.py:**
- `AsyncAnthropic` from `anthropic`
- `EVAL_MODEL` from `beacon.config`
- `get_config` from `beacon.config`
- `ResearchResult` from `beacon.models`
- `ChatMessage` from `server.models`
- `json`, `logging`, `collections.abc.AsyncGenerator`

### 3. Chat Route

**Modify: `02-api-streaming/server/routes.py`**

Add a new endpoint to the existing router. The chat route does NOT use the research semaphore (chat is independent of research). Instead, it implements per-session locking to prevent concurrent chat streams to the same session.

**Per-session lock mechanism:**

At module level in `routes.py`, create a `dict[str, bool]` to track active chat streams:

```python
_active_chat_streams: dict[str, bool] = {}
```

**Endpoint: `POST /api/chat/{session_id}`**

```python
@router.post("/api/chat/{session_id}")
async def chat(request: Request, session_id: str, body: ChatRequest):
    """Stream a chat response grounded in research results."""
    # 1. Retrieve session from request.app.state.sessions.get(session_id)
    # 2. Return 404 if not found
    # 3. Check _active_chat_streams — return 429 if already active
    # 4. Set _active_chat_streams[session_id] = True
    # 5. Create async generator wrapper that:
    #    - Calls stream_chat_response(result, body.message, body.history)
    #    - In finally block: del _active_chat_streams[session_id]
    # 6. Return EventSourceResponse wrapping the generator
```

Add these imports at the top of routes.py:
- `from server.models import ResearchRequest, ChatRequest` (add `ChatRequest` to existing import)
- `from server.chat import stream_chat_response`

The `EventSourceResponse` import and `sse_starlette` import already exist.

### 4. Conftest Updates for Chat Tests

The existing `conftest.py` at `02-api-streaming/tests/conftest.py` already has `sample_research_result` and `app`/`client` fixtures. For the chat route tests, the `app` fixture needs to be usable, and the `sample_research_result` fixture already provides sources with `deep_read_content` and intelligence signals.

For the `test_chat.py` unit tests (testing `build_chat_context` and `stream_chat_response` directly), create test-local fixtures or use the shared `sample_research_result` fixture. The route tests in `test_routes.py` can use the existing `client`, `app`, and `sample_research_result` fixtures.

For chat route tests that need a stored session, follow the same pattern as `TestExportEndpoint`: store a session via `app.state.sessions.store()` before making the request.

For testing `stream_chat_response`, mock the `AsyncAnthropic` client. The Anthropic SDK's `client.messages.stream()` returns an async context manager. The context manager's `__aenter__` returns a stream object with a `.text_stream` async iterator. Mock this chain to yield controlled text chunks.

---

## File Summary

| File | Action | Description |
|------|--------|-------------|
| `02-api-streaming/server/models.py` | MODIFY | Add `ChatMessage` and `ChatRequest` Pydantic models |
| `02-api-streaming/server/chat.py` | CREATE | Chat context builder + streaming response generator |
| `02-api-streaming/server/routes.py` | MODIFY | Add `POST /api/chat/{session_id}` with per-session lock |
| `02-api-streaming/tests/test_chat.py` | CREATE | Tests for `build_chat_context` and `stream_chat_response` |
| `02-api-streaming/tests/test_routes.py` | MODIFY | Add `TestChatEndpoint` class with route tests |

---

## Verification

After implementation, run the Python test suite from the `02-api-streaming` directory:

```bash
cd C:\git_repos\playground\hackathon\02-api-streaming
uv run pytest -x
```

All existing tests must continue to pass, and all new chat tests must pass. The frontend test command (`npm test`) is not relevant to this section.

---

## Implementation Notes (Post-Implementation)

**Status: COMPLETE** — 109 tests pass (14 new + 95 existing).

### Deviations from Plan

1. **Extracted `_select_top_sources()` helper** in `chat.py` — the plan described computing the top-8 sort inline in both `build_chat_context` and `stream_chat_response`. During code review, the duplicated sort was refactored into a shared `_select_top_sources(result)` function.

2. **Added SSE parameters to chat EventSourceResponse** — the plan showed a bare `EventSourceResponse(_stream())`. For consistency with the research endpoint, `ping=15`, `send_timeout=30`, and cache/buffering headers were added.

3. **Test naming**: The `test_selects_top_8_sources_by_score` test uses NATO phonetic alphabet names (alpha, bravo, etc.) instead of numeric `Source-N` titles to avoid substring collision issues (e.g., "Source-1" matching "Source-10").

### Final Test Count
- `test_chat.py`: 8 tests (5 build_chat_context + 3 stream_chat_response)
- `test_routes.py`: 6 new tests in `TestChatEndpoint` class (29 total in file)
