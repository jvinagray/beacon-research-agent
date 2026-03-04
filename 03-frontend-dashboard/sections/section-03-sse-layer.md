# Section 03: SSE Layer (SSE Helper, Artifact Parser, Research Hook)

## Overview

This section implements the Server-Sent Events (SSE) connection layer that communicates with the Beacon backend API. It consists of three interconnected modules:

1. **SSE Helper** (`src/lib/sse.ts`) — Wrapper around `@microsoft/fetch-event-source` for POST-based SSE connections
2. **Artifact Parser** (`src/lib/artifacts.ts`) — Normalizes artifact data from different formats
3. **Research Hook** (`src/hooks/useResearch.ts`) — React hook with `useReducer` for managing streaming research state

This layer bridges the gap between the backend's SSE stream and the React components.

## Dependencies

- Section 02: All TypeScript types defined in `src/types/research.ts`
- Section 01: `@microsoft/fetch-event-source` package installed, `src/config.ts` with API_BASE_URL

## Background: SSE Named Events

The backend uses `sse-starlette`'s `ServerSentEvent` with the `event` parameter set to the event type name (e.g., "status", "source_evaluated"). With `@microsoft/fetch-event-source`:
- `event.event` contains the SSE event type string
- `event.data` contains the JSON string payload
- The `type` field inside the parsed JSON data is redundant with `event.event` but can be used as a cross-check

**Critical:** The backend's research process is stateful and cannot be resumed. Both `onerror` and `onclose` handlers must throw to prevent reconnection attempts.

## Background: Artifact Formats

The backend sends artifacts with different data formats:
- `summary` — Plain markdown string, use as-is
- `concept_map` — Plain markdown string (indented bullet list), use as-is
- `flashcards` — JSON-encoded string containing array of `{ question, answer }` objects (must be parsed with `JSON.parse`)
- `resources` — JSON-encoded string (intentionally ignored by frontend; the Sources tab uses `EvaluatedSource` objects from `source_evaluated` events instead)

## Tests

### Artifact Parser Tests (`src/lib/artifacts.test.ts`)

```
# Test: normalizeArtifact returns summary string as-is
# Test: normalizeArtifact returns concept_map string as-is
# Test: normalizeArtifact parses flashcards JSON string into Flashcard array
# Test: normalizeArtifact handles already-parsed flashcards object (defensive)
# Test: normalizeArtifact returns null for resources artifact (intentionally ignored)
# Test: normalizeArtifact handles malformed JSON gracefully (returns raw string)
```

### Research Reducer Tests (`src/hooks/useResearch.test.ts`)

```
# Test: initial state has status idle, empty sources, null sessionId
# Test: START_RESEARCH sets status to loading, stores topic and depth
# Test: STATUS_UPDATE sets statusMessage, transitions loading->streaming on first status event
# Test: STATUS_UPDATE when already streaming keeps status as streaming
# Test: SOURCES_FOUND sets sourceTotal
# Test: SOURCE_EVALUATED appends source to array, maintains sort by score descending
# Test: SOURCE_EVALUATED with evaluation_failed source sorts it to bottom
# Test: ARTIFACT_RECEIVED stores normalized artifact in artifacts record
# Test: ERROR with recoverable=true keeps status as streaming, appends to statusMessage
# Test: ERROR with recoverable=false sets status to error, stores error details
# Test: COMPLETE sets sessionId, status to complete, stores summary
# Test: RESET returns to initial state
# Test: multiple SOURCE_EVALUATED events accumulate correctly in order
```

### SSE Helper Tests (`src/lib/sse.test.ts`)

```
# Test: connectSSE sends POST with correct URL, headers, and lowercase depth
# Test: connectSSE calls onEvent for each parsed SSE message
# Test: connectSSE calls onError when connection fails
# Test: connectSSE respects AbortSignal cancellation
# Test: connectSSE handles 429 response with specific error message
# Test: connectSSE does not retry on error (throws in onerror/onclose)
```

## Implementation

### File 1: `src/lib/artifacts.ts`

**Purpose:** Normalize artifact data from backend into frontend-friendly formats.

**Key function signature:**
```typescript
import type { Flashcard } from '../types/research';

export function normalizeArtifact(
  artifact_type: string,
  data: string | object
): string | Flashcard[] | null
```

**Logic:**
- `summary` -> return `data` as string
- `concept_map` -> return `data` as string
- `flashcards` -> if `data` is string, `JSON.parse()` to `Flashcard[]`; if already object/array, return as-is
- `resources` -> return `null` (intentionally ignored)
- Malformed JSON -> catch parse error, return raw string as fallback

**Error handling:** Wrap `JSON.parse` in try-catch. Log parse failures but don't throw (graceful degradation).

### File 2: `src/lib/sse.ts`

**Purpose:** Wrapper around `@microsoft/fetch-event-source` for POST-based SSE connections.

**Key function signature:**
```typescript
import type { SSEEvent } from '../types/research';

export function connectSSE(params: {
  topic: string;
  depth: string;
  signal: AbortSignal;
  onEvent: (event: SSEEvent) => void;
  onError: (error: Error) => void;
}): void
```

**Implementation notes:**
- Build POST body: `{ topic, depth: depth.toLowerCase() }` (lowercase depth value)
- URL: `${API_BASE_URL}/api/research` (from `src/config.ts`)
- Headers: `{ 'Content-Type': 'application/json' }`
- `onopen`: Validate response status. If not 200, throw error. If 429, throw specific "server busy" error.
- `onmessage`: Parse `event.data` as JSON, call `onEvent(parsedData)`. Use `event.event` as the SSE event type name for cross-checking.
- `onerror`: Call `onError`, then **throw** to stop retry loop
- `onclose`: **Throw** to prevent reconnection (research is stateful)
- Pass `signal` to `fetchEventSource` for abort support

### File 3: `src/hooks/useResearch.ts`

**Purpose:** React hook managing research state via `useReducer`.

**Exports:**
```typescript
export function useResearch(): {
  state: ResearchState;
  startResearch: (topic: string, depth: string) => void;
  reset: () => void;
}
```

**Reducer logic by action type:**

1. **START_RESEARCH** — Set `status: 'loading'`, store `topic` and `depth`, clear previous data
2. **STATUS_UPDATE** — Update `statusMessage`. If current status is 'loading', transition to 'streaming' (first status event)
3. **SOURCES_FOUND** — Set `sourceTotal`. Do not store the raw source list.
4. **SOURCE_EVALUATED** — Append source to `sources` array, sort by `signals.learning_efficiency_score` descending. Sources with `evaluation_failed: true` or score 0 are sorted to the bottom.
5. **ARTIFACT_RECEIVED** — Call `normalizeArtifact(artifact_type, data)`, store result in `artifacts[artifact_type]`
6. **ERROR** — If `recoverable: true`: append warning to `statusMessage`, keep status as 'streaming'. If `recoverable: false`: set `status: 'error'`, store error details.
7. **COMPLETE** — Set `sessionId`, store `summary` data, set `status: 'complete'`
8. **RESET** — Return to initial state

**Hook implementation:**
- Use `useReducer` with the reducer defined above
- `startResearch`: Create new `AbortController`, dispatch `START_RESEARCH`, call `connectSSE` mapping SSE events to reducer actions
- `reset`: Dispatch `RESET` action
- `useEffect` cleanup: abort on unmount
- Store AbortController in `useRef` to survive re-renders

## File Paths

- `src/lib/artifacts.ts` — Created
- `src/lib/artifacts.test.ts` — Created (6 tests)
- `src/lib/sse.ts` — Created
- `src/lib/sse.test.ts` — Created (6 tests)
- `src/hooks/useResearch.ts` — Created (exports `initialState`, `researchReducer`, `useResearch`)
- `src/hooks/useResearch.test.ts` — Created (15 tests: 13 reducer + 2 hook)
- `src/types/research.ts` — Modified (added `summary: CompleteSummary | null` to `ResearchState`)

## Edge Cases

- **Malformed JSON in artifact data:** Parser catches exception, returns raw string
- **Missing artifact types:** Artifacts record may not have all keys; dashboard must check before rendering
- **Evaluation failures:** Sources with score 0 and `evaluation_failed: true` sorted to bottom
- **Connection abort:** Hook cleans up AbortController on unmount
- **429 Too Many Requests:** SSE helper throws specific error
- **Recoverable errors:** Displayed as warnings, research continues
- **Non-recoverable errors:** Stop streaming, show error state in UI

## Definition of Done

- [x] All three files created with correct interfaces
- [x] `startResearch('React', 'Quick')` sends POST with `{ topic: 'React', depth: 'quick' }` (lowercased)
- [x] State transitions: loading -> streaming -> complete
- [x] Sources accumulate in array, sorted by score
- [x] Flashcards parsed from JSON string to `Flashcard[]`
- [x] Resources artifact ignored (returns null)
- [x] No auto-retry on connection failure
- [x] All tests passing (27/27)

## Deviations from Plan

- Added `summary: CompleteSummary | null` to `ResearchState` type (review finding: COMPLETE reducer was dropping summary payload)
- Added try-catch around `JSON.parse` in `sse.ts` `onmessage` handler (review finding: malformed SSE data would throw unhandled)
- Added `.catch(onError)` to `fetchEventSource` promise in `sse.ts` (review finding: unhandled promise rejection)
- `mapSSEEventToAction` returns `ResearchAction | null` with null guard in caller (review finding: unknown event types returned undefined)
