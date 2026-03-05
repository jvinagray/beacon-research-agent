# Section 04: Chat Types and useChat Hook

## Overview

This section adds the frontend chat infrastructure: TypeScript types for chat messages and SSE events, and a `useChat` hook implementing the `useReducer` pattern for chat state management with SSE streaming. This mirrors the existing `useResearch` hook pattern.

**Dependency:** Requires section-03 (chat backend) to be complete — the hook connects to `POST /api/chat/{session_id}`.

**Blocks:** section-05 (chat UI) which builds the ChatPanel component that consumes this hook.

---

## Architecture Context

- **`03-frontend-dashboard/src/types/research.ts`** contains all TypeScript types for the research feature: `SSEEvent` (discriminated union), `ResearchState`, `ResearchAction`, `Flashcard`, `EvaluatedSource`, etc. Chat types will be added here.
- **`03-frontend-dashboard/src/hooks/useResearch.ts`** is the template for useChat. It uses `useReducer` with a discriminated union of action types, `AbortController` for cancellation, and `connectSSE` from `../lib/sse` for SSE connections.
- **`03-frontend-dashboard/src/lib/sse.ts`** exports `connectSSE()` which wraps `@microsoft/fetch-event-source`. It uses `fetchEventSource` with POST method, handles connection lifecycle, and tracks a `completed` flag to prevent errors on intentional close.
- **`03-frontend-dashboard/src/config.ts`** exports `API_BASE_URL` (defaults to `http://localhost:8000`, overridden by `VITE_API_URL` env var).
- The chat backend (section-03) streams SSE events as JSON strings with three types:
  - `{"type": "delta", "content": "text chunk"}`
  - `{"type": "done", "sources": [{"title": "...", "url": "..."}]}`
  - `{"type": "error", "message": "..."}`
- The backend endpoint is `POST /api/chat/{session_id}` accepting `{ message: string, history: ChatMessage[] }`.

---

## Tests (Write First)

### useChat Hook Tests

**File: `03-frontend-dashboard/src/hooks/__tests__/useChat.test.ts`** (create new)

```typescript
// Test: initial state has empty messages, isStreaming false, error null
// - Render the hook with renderHook(() => useChat("session-123"))
// - Assert messages is [], isStreaming is false, error is null

// Test: SEND_MESSAGE action adds user message and empty assistant message
// - Dispatch SEND_MESSAGE action via the reducer directly (or via sendMessage)
// - Assert messages array has 2 entries: user message with content, assistant message with empty content

// Test: STREAM_START action sets isStreaming to true
// - Start from a state with a sent message
// - Dispatch STREAM_START
// - Assert isStreaming is true

// Test: STREAM_DELTA appends content to last assistant message
// - Start from a state with an empty assistant message and isStreaming true
// - Dispatch STREAM_DELTA with content "Hello"
// - Assert last message content is "Hello"
// - Dispatch another STREAM_DELTA with content " world"
// - Assert last message content is "Hello world"

// Test: STREAM_DONE sets isStreaming false and attaches sources to last message
// - Start from a state with streaming assistant message
// - Dispatch STREAM_DONE with sources array
// - Assert isStreaming is false
// - Assert last message has sources attached

// Test: ERROR action sets error message and isStreaming false
// - Dispatch ERROR with message "Something failed"
// - Assert error is "Something failed" and isStreaming is false

// Test: RESET action returns to initial state
// - Start from a state with messages and error
// - Dispatch RESET
// - Assert state matches initial state

// Test: sendMessage is no-op when sessionId is null
// - Render hook with useChat(null)
// - Call sendMessage("hello")
// - Assert messages array remains empty
```

---

## Implementation Details

### 1. Add Chat Types

**MODIFY: `03-frontend-dashboard/src/types/research.ts`**

Add the following types at the end of the file (after existing type definitions):

```typescript
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: { title: string; url: string }[];
}

export type ChatSSEEvent =
  | { type: 'delta'; content: string }
  | { type: 'done'; sources: { title: string; url: string }[] }
  | { type: 'error'; message: string };
```

`ChatMessage` represents a single message in the conversation. The `sources` field is optional and only populated on assistant messages after streaming completes (attached by the STREAM_DONE action).

`ChatSSEEvent` is a discriminated union matching the three event types from the chat backend SSE stream.

### 2. Create Chat State Types and Reducer

**CREATE: `03-frontend-dashboard/src/hooks/useChat.ts`**

**State shape:**
```typescript
export interface ChatState {
  messages: ChatMessage[];
  isStreaming: boolean;
  error: string | null;
}

const initialState: ChatState = {
  messages: [],
  isStreaming: false,
  error: null,
};
```

**Action types (discriminated union):**
```typescript
type ChatAction =
  | { type: 'SEND_MESSAGE'; message: string }
  | { type: 'STREAM_START' }
  | { type: 'STREAM_DELTA'; content: string }
  | { type: 'STREAM_DONE'; sources: { title: string; url: string }[] }
  | { type: 'ERROR'; message: string }
  | { type: 'RESET' };
```

**Reducer logic:**

- `SEND_MESSAGE`: Append two messages to the array: `{ role: 'user', content: action.message }` and `{ role: 'assistant', content: '' }` (empty placeholder for streaming). Set `error: null`.
- `STREAM_START`: Set `isStreaming: true`.
- `STREAM_DELTA`: Clone messages array, append `action.content` to the last message's `content`. (The last message is always the assistant placeholder.)
- `STREAM_DONE`: Set `isStreaming: false`. Attach `action.sources` to the last assistant message.
- `ERROR`: Set `error: action.message`, `isStreaming: false`.
- `RESET`: Return `initialState`.

### 3. Create useChat Hook

**In the same file: `03-frontend-dashboard/src/hooks/useChat.ts`**

```typescript
export function useChat(sessionId: string | null) {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (message: string) => {
    // No-op when sessionId is null
    if (!sessionId) return;

    // Cancel any in-progress stream
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    dispatch({ type: 'SEND_MESSAGE', message });

    // Truncate history to last 40 messages before sending
    const history = state.messages.slice(-40).map(m => ({
      role: m.role,
      content: m.content,
    }));

    // Connect to chat SSE endpoint
    // URL: `${API_BASE_URL}/api/chat/${sessionId}`
    // Method: POST
    // Body: JSON.stringify({ message, history })
    // Headers: { 'Content-Type': 'application/json' }
    //
    // onopen: dispatch STREAM_START
    // onmessage: parse event.data as ChatSSEEvent
    //   - delta: dispatch STREAM_DELTA with content
    //   - done: dispatch STREAM_DONE with sources
    //   - error: dispatch ERROR with message
    // onerror: check response status
    //   - 404: dispatch ERROR with "Session expired" message
    //   - other: dispatch ERROR with generic message
    //
    // Pass abortRef.current.signal for cancellation
  }, [sessionId, state.messages]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ type: 'RESET' });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return { ...state, sendMessage, reset };
}
```

**SSE connection approach:**

Use `fetchEventSource` from `@microsoft/fetch-event-source` (already a project dependency). Follow the same pattern as `connectSSE` in `src/lib/sse.ts`, but inline or create a simpler wrapper since the chat SSE has different event handling:

- The existing `connectSSE` is tailored for research events. For chat, either:
  - (a) Call `fetchEventSource` directly in the hook, or
  - (b) Create a lightweight wrapper function

Option (a) is simpler and recommended — avoid adding unnecessary abstractions.

**Important implementation details:**
- `fetchEventSource` is imported from `@microsoft/fetch-event-source`
- The `onmessage` callback receives events with `event.data` as a string — parse with `JSON.parse(event.data)` and type-check `parsed.type`
- Skip empty `event.data` strings (SSE keep-alive/comments)
- The `onopen` callback should dispatch `STREAM_START`
- The `onerror` callback should check if the error has a response with status 404 for session expiry
- AbortController signal is passed to fetchEventSource for cancellation

**Imports needed:**
- `useReducer`, `useCallback`, `useRef`, `useEffect` from `react`
- `fetchEventSource` from `@microsoft/fetch-event-source`
- `ChatMessage`, `ChatSSEEvent` from `../types/research`
- `API_BASE_URL` from `../config`

---

## File Summary

| File | Action | Description |
|------|--------|-------------|
| `03-frontend-dashboard/src/types/research.ts` | MODIFY | Add `ChatMessage` and `ChatSSEEvent` types |
| `03-frontend-dashboard/src/hooks/useChat.ts` | CREATE | Chat state reducer + useChat hook with SSE streaming |
| `03-frontend-dashboard/src/hooks/__tests__/useChat.test.ts` | CREATE | Hook and reducer unit tests |

---

## Verification

After implementation, run the frontend test suite:

```bash
cd C:\git_repos\playground\hackathon\03-frontend-dashboard
npm test
```

All existing tests must continue to pass, and all new useChat tests must pass. The Python test command (`uv run pytest`) is not relevant to this section.

---

## Implementation Notes (Post-Implementation)

**Status: COMPLETE** — 8 new tests pass, 114 total (1 pre-existing failure in edge-cases.test.tsx unrelated to this section).

### Deviations from Plan

1. **404 check in onopen vs onerror** — the plan suggested checking 404 in onerror, but the implementation checks it in onopen where the Response object is directly available. This is more reliable since fetchEventSource's onerror doesn't always receive HTTP responses.

2. **Added 429 handling in onopen** — not in plan but mirrors the existing connectSSE pattern in sse.ts for consistency.

3. **Added onclose guard** — dispatches ERROR if stream closes before a 'done' event, matching the pattern from sse.ts.

### Final Test Count
- `useChat.test.ts`: 8 tests (7 reducer unit tests + 1 hook integration test)
