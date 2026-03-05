# Section 6: Drill Down -- Frontend Hook and UI

## Overview

This section implements the frontend side of the drill-down feature: a React hook that manages a tree of drill-down sessions, a panel component rendering nested accordions, and the completion of `drill://` link handling in `MarkdownViewer`. When a user clicks a drill-down link in the research summary (or within a drill-down result itself), the frontend streams a focused sub-research response from the backend and displays it in an expandable accordion below the summary.

### Dependencies

- **Section 2 (Evidence Anchoring -- Frontend Citation UI):** `MarkdownViewer.tsx` must already have the `sources` prop, custom `urlTransform`, and memoized `components` object with `cite:` link handling. This section adds the `drill://` link handling branch to the existing `a` override.
- **Section 5 (Drill Down -- Backend Endpoint):** The `POST /api/drilldown/{session_id}` endpoint must exist and stream SSE events with `{"type": "delta", "content": "..."}` and `{"type": "done", "concept": "..."}` payloads.

### Files Created or Modified

| File | Action |
|------|--------|
| `03-frontend-dashboard/src/hooks/useDrillDown.ts` | Create |
| `03-frontend-dashboard/src/hooks/__tests__/useDrillDown.test.ts` | Create |
| `03-frontend-dashboard/src/components/DrillDownPanel.tsx` | Create |
| `03-frontend-dashboard/src/components/__tests__/DrillDownPanel.test.tsx` | Create |
| `03-frontend-dashboard/src/components/MarkdownViewer.tsx` | Modify (add `drill://` handling) |
| `03-frontend-dashboard/src/components/__tests__/MarkdownViewer.test.tsx` | Modify (add `drill://` tests) |
| `03-frontend-dashboard/src/pages/DashboardPage.tsx` | Modify (integrate hook and panel) |

---

## Tests (16 total, all passing)

### 1. useDrillDown Hook Tests (6 tests)

**File:** `03-frontend-dashboard/src/hooks/__tests__/useDrillDown.test.ts`

- initial state is empty sessions array
- startDrillDown creates new session with depth=0, isStreaming=true
- startDrillDown with parentId creates session with correct depth
- startDrillDown at depth >= 3 does not create session (returns 'max-depth')
- startDrillDown when sessions >= 10 does not create session (returns 'max-sessions')
- returns ok for null sessionId without creating session

Note: `streaming completion sets isStreaming=false` test was not implemented — requires complex fetchEventSource mocking.

### 2. DrillDownPanel Component Tests (6 tests)

**File:** `03-frontend-dashboard/src/components/__tests__/DrillDownPanel.test.tsx`

- renders accordion items for each top-level session
- shows concept text as accordion trigger
- shows pipe cursor for streaming sessions
- shows 'Maximum depth reached' message at depth >= 2 (requires fireEvent.click to open accordion)
- returns null when no top-level sessions
- nested sessions render as child accordions when parent is opened

Mock MarkdownViewer used to isolate component.

### 3. MarkdownViewer drill:// Tests (4 tests, extends existing test file)

**File:** `03-frontend-dashboard/src/components/__tests__/MarkdownViewer.test.tsx`

- drill:// links render as styled buttons with border-dotted class
- clicking drill:// link calls onDrillDown with concept text
- drill:// link extracts plain text after drill:// (uses href.slice(8))
- without onDrillDown prop renders drill:// as plain text

Note: Tests use single-word/hyphenated concepts (transformers, backpropagation, gradient-descent, regularization) because the markdown parser does not parse URLs containing spaces as valid links.

---

## Implementation Details

### 1. useDrillDown Hook

**File:** `03-frontend-dashboard/src/hooks/useDrillDown.ts`

**DrillDownSession interface:**

```typescript
export interface DrillDownSession {
  id: string;          // crypto.randomUUID()
  concept: string;     // the concept being explored
  content: string;     // accumulated streamed markdown
  isStreaming: boolean;
  parentId: string | null;  // null for top-level, parent session ID for nested
  depth: number;       // 0 = top-level, 1 = first nested, etc.
}
```

**State management:** Use `useReducer` with action types:
- `ADD_SESSION` — adds new session to array
- `STREAM_DELTA` — appends content to session by id
- `STREAM_DONE` / `STREAM_ERROR` — sets `isStreaming = false` (combined case)

**`startDrillDown(concept: string, parentId?: string)` logic:**

1. Read sessions from `sessionsRef` (not closure) for stable callback identity
2. Deduplicate: reject if session with same `(concept, parentId)` already exists
3. Compute depth from parent chain (parentId → find parent → parent.depth + 1)
4. If `depth >= 3`, return `"max-depth"` indicator
5. If `sessions.length >= 10`, return `"max-sessions"` indicator
6. Create new session with `id = crypto.randomUUID()`, `isStreaming = true`
7. Dispatch `ADD_SESSION`
8. POST to `${API_BASE_URL}/api/drilldown/${sessionId}` via `fetchEventSource`
   - Body: `JSON.stringify({ concept })`
9. Accumulate deltas, handle done/error events
10. `onclose` dispatches `STREAM_DONE` to prevent stuck streaming indicators
11. `onerror` throws to prevent fetchEventSource retries

**Callback stability (code review fix):** `startDrillDown` depends only on `[sessionId]`. A `sessionsRef` mirrors `state.sessions` for guard checks, avoiding stale closures and preventing re-renders on every streaming delta.

**AbortController:** Store a `Map<string, AbortController>` in a ref keyed by drill-down session id. Abort all on unmount.

**Return value:**

```typescript
{
  sessions: DrillDownSession[];
  startDrillDown: (concept: string, parentId?: string) => "ok" | "max-depth" | "max-sessions";
}
```

### 2. DrillDownPanel Component

**File:** `03-frontend-dashboard/src/components/DrillDownPanel.tsx`

**Props:**

```typescript
interface DrillDownPanelProps {
  sessions: DrillDownSession[];
  sources: EvaluatedSource[];
  onDrillDown: (concept: string, parentId?: string) => void;
}
```

**Rendering:**
- Use `<Accordion type="multiple">` from `@/components/ui/accordion`
- Filter sessions to get top-level ones (`parentId === null`), recursively render via `SessionNode` (renamed `children` prop to `allSessions` to avoid React naming collision)
- Each session as `AccordionItem`:
  - Trigger: concept text
  - Content: `<MarkdownViewer content={session.content} sources={sources} onDrillDown={(concept) => onDrillDown(concept, session.id)} />`
  - Streaming: pipe cursor with `animate-pulse`
- Visual nesting: `border-l-2 border-primary/30` and `ml-4` per level
- Glass card styling: `glass rounded-xl border border-glass-border`
- At depth >= 2: show "Maximum depth reached. Use the chat to explore further."

### 3. MarkdownViewer drill:// Link Handling

**File:** `03-frontend-dashboard/src/components/MarkdownViewer.tsx`

Complete the `drill://` branch in the `a` override (stub from Section 2):

When `href` starts with `"drill://"`:
- Extract concept: `href.slice(8)` (8 chars for `drill://`, no URL decoding needed)
- If `onDrillDown` not provided: render as plain text
- If `onDrillDown` provided: render as styled inline button:
  - `<button>` with `onClick={() => onDrillDown(concept)}`
  - Styling: `text-primary cursor-pointer border-b border-dotted border-primary/50 hover:border-primary transition-colors inline-flex items-center gap-1`
  - Include `Search` icon from `lucide-react` (size 12-14px) after text

### 4. DashboardPage Integration

**File:** `03-frontend-dashboard/src/pages/DashboardPage.tsx`

1. **Hook initialization** (alongside useChat, outside keyed div):
   ```typescript
   const drillDown = useDrillDown(researchState?.sessionId ?? null);
   ```

2. **Callback wrapper:**
   ```typescript
   const handleDrillDown = useCallback((concept: string, parentId?: string) => {
     const status = drillDown.startDrillDown(concept, parentId);
     if (status === "max-depth") {
       toast.info("Maximum depth reached. Use the chat to explore further.");
     } else if (status === "max-sessions") {
       toast.info("Too many drill-downs. Use the chat to explore further.");
     }
   }, [drillDown.startDrillDown]);
   ```

3. **Summary tab:** Pass `onDrillDown={handleDrillDown}` to MarkdownViewer. Render `<DrillDownPanel>` below summary when sessions exist:
   ```typescript
   {drillDown.sessions.length > 0 && (
     <div className="mt-6">
       <DrillDownPanel
         sessions={drillDown.sessions}
         sources={researchState.sources}
         onDrillDown={handleDrillDown}
       />
     </div>
   )}
   ```

**Note:** Pass `researchState.sources` (unsorted), NOT `sortedSources`.

---

## SSE Event Contract

- **Delta:** `{"type": "delta", "content": "chunk"}`
- **Done:** `{"type": "done", "concept": "the concept"}`
- **Error:** `{"type": "error", "message": "description"}`

Request body: `{ "concept": "concept text" }` with Content-Type `application/json`.

HTTP errors: 404 (session expired), 429 (stream active), 400 (invalid concept).

---

## Styling Notes

- `glass` for card backgrounds
- `border border-glass-border` for borders
- `text-primary` for interactive elements
- Pipe cursor: `<span className="inline-block animate-pulse">&#9610;</span>`
