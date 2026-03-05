# Section 4: Complexity Slider -- Frontend Hook and UI

## Overview

This section creates the frontend half of the complexity slider feature: a `useRewrite` hook that manages rewrite state with caching and streaming via SSE, and a `ComplexitySlider` component with a 5-step Radix Slider. Both are wired into the summary tab of `DashboardPage.tsx`.

**Dependencies:**
- **Section 2 (citation-ui):** MarkdownViewer must already accept `sources` prop and render `cite:` links as citation badges. The rewritten content preserves citation links, so MarkdownViewer must handle them.
- **Section 3 (rewrite-backend):** The `POST /api/rewrite/{session_id}` SSE endpoint must exist. It accepts `{ level: number }` and streams `{ type: "delta", content }` and `{ type: "done", level }` events.

**Does not block:** No other sections depend on this one.

---

## Files to Create

| File | Purpose |
|------|---------|
| `03-frontend-dashboard/src/hooks/useRewrite.ts` | Hook managing rewrite state, caching, and SSE streaming |
| `03-frontend-dashboard/src/components/ComplexitySlider.tsx` | 5-step slider component with labels |
| `03-frontend-dashboard/src/hooks/__tests__/useRewrite.test.ts` | Tests for the useRewrite hook |
| `03-frontend-dashboard/src/components/__tests__/ComplexitySlider.test.tsx` | Tests for the ComplexitySlider component |

## Files to Modify

| File | Change |
|------|--------|
| `03-frontend-dashboard/src/pages/DashboardPage.tsx` | Import and wire useRewrite hook and ComplexitySlider into summary tab |

---

## Tests First

### useRewrite Hook Tests

**File:** `03-frontend-dashboard/src/hooks/__tests__/useRewrite.test.ts`

Follow the patterns established in `03-frontend-dashboard/src/hooks/__tests__/useChat.test.ts`. Use `vitest`, `renderHook`, and `act` from `@testing-library/react`.

```
# Test: initial state has currentLevel=3, isStreaming=false, empty cachedLevels
- renderHook with useRewrite(sessionId, "original summary text")
- Assert: result.current.currentLevel === 3
- Assert: result.current.isStreaming === false
- Assert: result.current.cachedLevels is empty object {}
- Assert: result.current.content === "original summary text"
- Assert: result.current.error === null

# Test: requestRewrite(3) returns original summary immediately (no fetch call)
- renderHook with useRewrite(sessionId, "original summary text")
- Call result.current.requestRewrite(3) inside act()
- Assert: result.current.content === "original summary text"
- Assert: global.fetch or fetchEventSource was NOT called (mock and verify)

# Test: requestRewrite(1) triggers fetch to /api/rewrite endpoint
- Mock fetchEventSource (from @microsoft/fetch-event-source)
- renderHook with useRewrite(sessionId, "original summary text")
- Call result.current.requestRewrite(1)
- Assert: fetchEventSource was called with URL containing `/api/rewrite/${sessionId}`
- Assert: request body contains { level: 1 }

# Test: requestRewrite caches completed rewrite in cachedLevels
- Mock fetchEventSource to simulate delta + done events
- renderHook, call requestRewrite(1), let streaming complete
- Assert: result.current.cachedLevels[1] contains the accumulated content

# Test: requestRewrite for cached level returns cached content without fetch
- First do a full rewrite cycle for level 1 (populate cache)
- Switch to level 3 (original)
- Call requestRewrite(1) again
- Assert: fetchEventSource was NOT called a second time
- Assert: result.current.content matches cached value

# Test: requestRewrite aborts previous in-flight request when called again
- Mock fetchEventSource
- Call requestRewrite(1) then immediately requestRewrite(2) before first completes
- Assert: the AbortController signal for the first request was aborted

# Test: hook resets cachedLevels when originalSummary changes
- renderHook with originalSummary "text A"
- Populate cache for level 1
- Rerender hook with originalSummary "text B"
- Assert: cachedLevels is now empty

# Test: hook aborts on unmount
- renderHook, start a requestRewrite(1)
- unmount the hook
- Assert: no errors thrown, abort was called
```

### ComplexitySlider Tests

**File:** `03-frontend-dashboard/src/components/__tests__/ComplexitySlider.test.tsx`

```
# Test: renders slider with 5 discrete steps
- render <ComplexitySlider currentLevel={3} onLevelChange={vi.fn()} isStreaming={false} />
- Assert: the Radix Slider root element is in the document
- Assert: slider has min=1, max=5, step=1 attributes (check via role="slider" aria attributes)

# Test: renders labels ELI5 / Simple / General / Technical / Expert
- render the component
- Assert: screen.getByText("ELI5") is in the document
- Assert: screen.getByText("Simple") is in the document
- Assert: screen.getByText("General") is in the document
- Assert: screen.getByText("Technical") is in the document
- Assert: screen.getByText("Expert") is in the document

# Test: onValueCommit fires with correct level number
- Note: Radix Slider's onValueCommit fires on pointer-up.
  Testing this in jsdom is tricky since Radix uses pointer events.
  Consider testing the callback prop is passed correctly or using
  a simplified approach: verify the component accepts the prop and renders.

# Test: slider is disabled when isStreaming=true
- render <ComplexitySlider currentLevel={3} onLevelChange={vi.fn()} isStreaming={true} />
- Assert: the slider element has aria-disabled or is disabled

# Test: shows streaming indicator text when isStreaming=true
- render <ComplexitySlider currentLevel={1} onLevelChange={vi.fn()} isStreaming={true} />
- Assert: screen.getByText(/rewriting/i) is in the document
```

---

## Implementation Details

### useRewrite Hook

**File:** `03-frontend-dashboard/src/hooks/useRewrite.ts`

This hook follows the exact same patterns as `useChat.ts`. Key patterns to replicate:

- Uses `@microsoft/fetch-event-source` (`fetchEventSource`) for SSE streaming
- Uses `AbortController` stored in a `useRef` for cancellation
- Cleans up abort on unmount via `useEffect` return
- Parses SSE event data as JSON
- Uses `API_BASE_URL` from `03-frontend-dashboard/src/config.ts`

**State shape:**

```typescript
interface RewriteState {
  content: string;          // currently displayed content (rewritten or original)
  currentLevel: number;     // active complexity level (1-5, default 3)
  isStreaming: boolean;      // true while SSE stream is in progress
  error: string | null;     // error message if rewrite failed
  cachedLevels: Record<number, string>;  // completed rewrites keyed by level
}
```

**Hook signature:**

```typescript
function useRewrite(sessionId: string | null, originalSummary: string): {
  content: string;
  currentLevel: number;
  isStreaming: boolean;
  error: string | null;
  cachedLevels: Record<number, string>;
  requestRewrite: (level: number) => void;
}
```

**`requestRewrite(level)` logic:**

1. If `level === 3`: set `content` to `originalSummary`, set `currentLevel` to 3, return. No API call.
2. If `cachedLevels[level]` exists: set `content` to cached value, set `currentLevel`, return.
3. Otherwise (cache miss):
   - Abort any in-flight request (`abortRef.current?.abort()`)
   - Create new `AbortController`
   - Set `isStreaming = true`, `currentLevel = level`, `content = ""`
   - Call `fetchEventSource` with POST to `/api/rewrite/${sessionId}`
   - Body: `JSON.stringify({ level })`
   - `onmessage`: parse JSON. For `type: "delta"`, accumulate `content`. For `type: "done"`, cache and set `isStreaming = false`.
   - `onerror`: set error, rethrow to close connection

**Cache invalidation:** `useEffect` watching `originalSummary` resets `cachedLevels` to `{}` and restores content/level to defaults.

**Cleanup on unmount:** Return cleanup from `useEffect` that aborts in-flight request.

### ComplexitySlider Component

**File:** `03-frontend-dashboard/src/components/ComplexitySlider.tsx`

**Props:**

```typescript
interface ComplexitySliderProps {
  currentLevel: number;
  onLevelChange: (level: number) => void;
  isStreaming: boolean;
}
```

**Rendering:**

- Import `Slider` from `@/components/ui/slider` (already exists)
- Configure with `min={1}`, `max={5}`, `step={1}`
- `value={[currentLevel]}` (Radix Slider takes array)
- `onValueCommit={(value) => onLevelChange(value[0])}` — fires on pointer-up only
- `disabled={isStreaming}`
- Labels below slider: "ELI5" / "Simple" / "General" / "Technical" / "Expert" in flex with `justify-between`
- Active level label highlighted in `text-primary`
- When `isStreaming`: show "Rewriting..." with `animate-pulse`

### DashboardPage Integration

**File:** `03-frontend-dashboard/src/pages/DashboardPage.tsx`

1. **Import** `useRewrite` and `ComplexitySlider`
2. **Initialize hook** outside the `<div key={activeTab}>` wrapper (prevents state destruction on tab switch):
   ```typescript
   const originalSummary = (researchState?.artifacts?.summary as string) || "";
   const rewriteState = useRewrite(researchState?.sessionId ?? null, originalSummary);
   ```
3. **Summary tab** renders `<ComplexitySlider>` above `<MarkdownViewer>`:
   - Pass `rewriteState.content || originalSummary` to MarkdownViewer content prop
   - During streaming: `opacity-50 transition-opacity` on MarkdownViewer wrapper
   - Show pipe cursor when streaming (same as ChatPanel)
   - Pass `researchState.sources` (unsorted) to MarkdownViewer

---

## Key Design Decisions

- **`onValueCommit` not `onValueChange`:** Prevents API calls on every drag pixel
- **Cache at hook level:** Users slide back and forth to compare; caching avoids redundant API calls
- **Hook outside keyed div:** `<div key={activeTab}>` unmounts children on tab switch; hook at top level preserves state
- **Level 3 = original:** Center position, no API call, user slides in either direction

## SSE Event Format

```json
{"type": "delta", "content": "partial text chunk"}
{"type": "done", "level": 1}
{"type": "error", "message": "Something went wrong"}
```

## Error States

- **404:** Session expired → "Session expired. Please start a new research first."
- **429:** Stream active → "A rewrite is already in progress."
- **Network error:** Set error state, stop streaming
- **Abort:** Silently ignore (intentional user action)

---

## Implementation Record

**Status:** Complete

### Actual Files Created
- `03-frontend-dashboard/src/hooks/useRewrite.ts` -- hook with useState, useRef for cache, fetchEventSource SSE streaming, cache invalidation on summary change
- `03-frontend-dashboard/src/components/ComplexitySlider.tsx` -- Radix Slider with 5 labels, disabled state, streaming indicator
- `03-frontend-dashboard/src/hooks/__tests__/useRewrite.test.ts` -- 8 tests covering initial state, cache, abort, rerender
- `03-frontend-dashboard/src/components/__tests__/ComplexitySlider.test.tsx` -- 5 tests with ResizeObserver polyfill for jsdom

### Actual Files Modified
- `03-frontend-dashboard/src/pages/DashboardPage.tsx` -- imported useRewrite + ComplexitySlider, wired into summary tab

### Deviations from Plan
- Used `useRef` for cache alongside `useState` (per code review) to avoid stale closure in `requestRewrite` callback
- Added `onclose` handler (per code review) to handle unexpected SSE connection drops — matches useChat pattern
- `data-disabled` attribute checked in test instead of `aria-disabled` — Radix Slider uses data attributes
- Added `ResizeObserver` polyfill in ComplexitySlider test file for jsdom compatibility

### Test Summary
- 13 new tests total (8 hook, 5 component)
- Full frontend suite: 145/146 passing (1 pre-existing failure in edge-cases.test.tsx unrelated to this section)
