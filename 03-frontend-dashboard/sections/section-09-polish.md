# Section 09: Polish -- Edge Cases, Animations, Error States, and Final Visual Tweaks

## Overview

This is the final section that addresses all remaining edge cases, loading states, entrance animations, and defensive UI behavior. It ties together everything built in sections 01-08 and ensures the application handles failure modes gracefully without crashing. Key areas:

1. **Edge case handling:** empty results, missing artifacts, backend unavailable, 429 errors, browser refresh on dashboard, long topic names
2. **Entrance animations:** staggered fade-in + slide-up for source cards in the progress feed
3. **Status indicator:** pulsing dot animation for streaming status messages
4. **Router guards:** catch-all 404 route, dashboard redirect on refresh, redirect from `/` to `/search`
5. **Evaluation-failed source visual treatment:** dimmed cards with "Failed" badge sorted to bottom

## Dependencies

- Section 06 (markdown-viewer): MarkdownViewer component exists and renders in Summary tab
- Section 07 (concept-map): ConceptMap component exists and renders in Concept Map tab
- Section 08 (flashcards): FlashCard components exist and render in Flashcards tab
- Section 05 (dashboard-sources): DashboardPage, SourceCard, export button, tab navigation all wired
- Section 04 (search-page): SearchPage wired to useResearch, progress feed, error banner, navigation
- Section 03 (sse-layer): useResearch hook, SSE helper, artifact parser all functional
- Section 01 (setup): Router configuration exists in App.tsx

## Tests

### Edge Case Tests (`src/__tests__/edge-cases.test.tsx`)

```
# Test: empty sources array shows "No sources could be evaluated" message
# Test: missing artifact shows placeholder message in tab
# Test: dashboard redirect on refresh (no router state)
# Test: long topic names truncated in header
# Test: 429 error shows "server busy" message
# Test: backend unavailable shows connection error
```

### Router Configuration Tests (`src/__tests__/router.test.tsx`)

```
# Test: / redirects to /search
# Test: unknown routes redirect to /search (catch-all 404)
# Test: /dashboard with state renders correctly
# Test: /dashboard without state redirects to /search
```

## Implementation

This section modifies existing files to add polish. No new modules are created; instead, this section audits and completes behavior in files created by prior sections.

---

### 1. Router Configuration Verification

**File: `src/App.tsx`**

Ensure the router is configured with all required routes, including the catch-all 404:

```typescript
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/search" replace />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="*" element={<Navigate to="/search" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
```

**Key points:**
- `/` redirects to `/search` with `replace` to avoid back-button loops
- `*` catch-all sends unknown routes to `/search` with `replace`
- Both redirects use `<Navigate>` from react-router-dom

---

### 2. Empty Research Results Handling

**File: `src/pages/DashboardPage.tsx` (modify)**

In the Sources tab, when the sources array is empty (all evaluations failed or none returned), display a user-friendly empty state message.

**Condition:** `sources.length === 0`

**Message:** "No sources could be evaluated. Try a different topic."

**Styling:** Center the message in the tab content area with `text-slate-400` muted text, large enough to be clearly visible. Wrap in a glassmorphism container consistent with the theme. Include a "New Search" button/link that navigates back to `/search`.

---

### 3. Missing Artifact Placeholder Messages

**File: `src/pages/DashboardPage.tsx` (modify)**

When switching to a tab whose artifact data is absent (undefined, null, or empty string), render a placeholder message instead of a blank tab or crashing.

**Per-tab placeholders:**
- **Summary tab:** If `artifacts.summary` is falsy: "No summary was generated for this research."
- **Concept Map tab:** If `artifacts.concept_map` is falsy: "No concept map was generated for this research."
- **Flashcards tab:** If `artifacts.flashcards` is falsy or empty array: "No flashcards were generated for this research."

**Styling:** Each placeholder uses `text-slate-400`, centered in the tab content area, with a subtle icon (e.g., an information circle) for visual clarity.

Note: The MarkdownViewer component (section-06) already handles empty/null content with its own placeholder. The ConceptMap component (section-07) already handles empty data via its fallback path. This step ensures the DashboardPage itself also has guards before reaching those components, providing a consistent experience across all tabs.

---

### 4. Backend Unavailable Error Message

**File: `src/pages/SearchPage.tsx` (modify)**

When the SSE connection fails to open (network error, ECONNREFUSED, etc.), the `useResearch` hook dispatches a non-recoverable error. The error banner on SearchPage should display a specific, actionable message.

**Detection:** The SSE helper (`src/lib/sse.ts`, section-03) already calls `onError` with an Error object. If the error is a network failure (connection refused), the error message should include the API URL.

**Error banner content for connection failure:**
```
Cannot connect to the research server. Make sure it's running at {API_URL}.
```

Where `{API_URL}` is imported from `src/config.ts`.

**Implementation approach:** In `src/lib/sse.ts`, when `onerror` fires and the error is a TypeError (which `fetch` throws for network failures), construct the error message to include the API URL. The SearchPage error banner already renders `state.error.message` (section-04), so the message just needs to be informative at the source.

---

### 5. 429 Too Many Requests Handling

**File: `src/lib/sse.ts` (verify, modify if needed)**

The SSE helper (section-03) should already handle 429 responses in its `onopen` handler. Verify this is implemented. The handler should:

1. Check `response.status === 429` in `onopen`
2. Throw an error with message: "The server is busy. Please wait a moment and try again."
3. This error flows through `onError` -> reducer `ERROR` action (non-recoverable) -> SearchPage error banner

If the 429 handling was not fully wired in section-03, add it now.

---

### 6. Browser Refresh on Dashboard

**File: `src/pages/DashboardPage.tsx` (verify/modify)**

When the user refreshes the browser while on `/dashboard`, React Router state is lost (it exists only in memory). The redirect guard (section-05) already handles this by navigating to `/search` when `location.state` is null.

**Enhancement:** Add a brief toast or visual message on the search page indicating that the session expired. This can be done by passing state on the redirect:

```typescript
// In DashboardPage, when no state:
navigate('/search', { state: { message: 'Your previous research session has expired.' } });
```

**In SearchPage:** Read `location.state?.message` and display it as a dismissible info banner (not an error banner) at the top of the page. Auto-dismiss after 5 seconds.

**Styling:** Blue/slate accent border (not red), glassmorphism background, with a close button.

---

### 7. Long Topic Name Truncation

**File: `src/components/DashboardHeader.tsx` (modify)**

Long topic names should be truncated in the header to prevent layout breaking.

**CSS approach:**
```
max-w-[400px] truncate
```

Apply `truncate` (which sets `overflow: hidden`, `text-overflow: ellipsis`, `white-space: nowrap`) to the topic text span.

**Tooltip:** Add a `title` attribute with the full topic text so users can hover to see the complete topic:
```typescript
<span className="max-w-[400px] truncate inline-block" title={topic}>
  Research: {topic}
</span>
```

---

### 8. Source Card Entrance Animations

**File: `src/components/ProgressFeed.tsx` (verify/modify)**

Section-04 defined the entrance animation for source cards in the progress feed. Verify and complete the implementation:

**CSS animation definition** (add to `src/index.css` or a dedicated `src/animations.css` imported in `main.tsx`):

```css
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in-up {
  animation: fadeInUp 0.4s ease-out forwards;
  opacity: 0; /* Initial state before animation plays */
}
```

**Staggered timing:** Each source card gets a delay based on its index:

```typescript
<div
  key={source.url}
  className="animate-fade-in-up"
  style={{ animationDelay: `${index * 50}ms` }}
>
  <SourceCard source={source} />
</div>
```

Alternatively, if Tailwind is configured with custom animations, register `fadeInUp` in `tailwind.config.js`:

```javascript
module.exports = {
  theme: {
    extend: {
      keyframes: {
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in-up': 'fadeInUp 0.4s ease-out forwards',
      },
    },
  },
};
```

---

### 9. Status Message Pulsing Dot

**File: `src/components/ProgressFeed.tsx` (verify/modify)**

During streaming, the status message should have a pulsing dot indicator to show that work is in progress.

**CSS animation definition** (add alongside fadeInUp):

```css
@keyframes pulse-dot {
  0%, 100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.3);
    opacity: 0.7;
  }
}

.animate-pulse-dot {
  animation: pulse-dot 1.5s ease-in-out infinite;
}
```

**Usage in ProgressFeed:**

```typescript
<div className="flex items-center gap-2">
  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse-dot" />
  <span className="text-slate-300">{statusMessage}</span>
</div>
```

Only show the pulsing dot when status is `'loading'` or `'streaming'`. Hide it when `'complete'` or `'error'`.

---

### 10. Evaluation-Failed Source Visual Treatment

**File: `src/components/SourceCard.tsx` (verify/modify)**

Section-05 defined the evaluation-failed visual treatment. Verify and complete:

**Conditions for "failed" state:** `source.signals.evaluation_failed === true` OR `source.signals.learning_efficiency_score === 0`

**Visual treatment:**
- Card wrapper gets `opacity-60` to dim it
- Score badge replaced with gray "Failed" badge (no glow): `bg-slate-600 text-slate-300`
- Content type tag still shows if available
- Time estimate still shows if available
- Key insight may be empty; show "Evaluation could not be completed" as fallback

**Sorting:** Already handled by the Sources tab sorting logic in DashboardPage (section-05). Failed sources are filtered to the bottom.

---

### 11. Export Button Edge Cases

**File: `src/pages/DashboardPage.tsx` (verify/modify)**

Verify the export button handles all error cases:

1. **Null sessionId:** Export button should render with `disabled` attribute and muted styling (`opacity-50 cursor-not-allowed`). No click handler fires.

2. **404 response (session expired):** Show toast notification: "Research session has expired. Please run a new search."

3. **Network error (fetch throws):** Show toast notification: "Export failed. Check your connection and try again."

**Toast implementation:** If a toast library (like `sonner` or ShadCN's toast) is available from Lovable, use it. Otherwise, implement a simple toast component:

- Fixed position `bottom-4 right-4`
- Glassmorphism background with appropriate accent color (amber for warning, red for error)
- Auto-dismiss after 4 seconds
- Fade-in/fade-out transition

A simple approach using local state:

```typescript
const [toast, setToast] = useState<{ message: string; type: 'error' | 'warning' } | null>(null);

useEffect(() => {
  if (toast) {
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }
}, [toast]);
```

Render the toast at the bottom of the DashboardPage JSX, outside the main content flow.

---

### 12. Tab Transitions

**File: `src/pages/DashboardPage.tsx` (modify)**

Tab content transitions should be snappy. A simple fade transition when switching tabs improves perceived polish:

```css
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.animate-fade-in {
  animation: fadeIn 0.2s ease-out;
}
```

Wrap each tab content panel in a div with `className="animate-fade-in"` and use a `key={activeTab}` to force re-render (and thus re-trigger the animation) on tab change:

```typescript
<div key={activeTab} className="animate-fade-in">
  {activeTab === 'sources' && <SourcesContent />}
  {activeTab === 'summary' && <SummaryContent />}
  {/* ... */}
</div>
```

---

### 13. Concept Map "Fit to View" Consideration

**File: `src/components/ConceptMap.tsx` (modify, optional)**

For large concept maps, the default zoom may not show the full tree. Add a "Reset View" button in the top-right corner of the concept map container that resets the tree translation to center and zoom to the initial value.

This is a convenience enhancement. Implementation: Store a ref to the tree container, and on button click, reset the `translate` and `zoom` props to their initial values. If react-d3-tree provides an API for this, use it; otherwise, use a key-reset pattern (changing the component key forces a full re-mount).

---

## All Animation Definitions Summary

Collect all custom animations in one place. Either add them to `src/index.css` or register them in `tailwind.config.js` under `theme.extend`.

**Animations needed:**

| Name | Purpose | Duration | Timing |
|------|---------|----------|--------|
| `fadeInUp` | Source card entrance in progress feed | 0.4s | ease-out, forwards |
| `fadeIn` | Tab content transition | 0.2s | ease-out |
| `pulse-dot` | Status message indicator | 1.5s | ease-in-out, infinite |

**FlashCard 3D flip** (from section-08) uses CSS `transition: transform 0.6s ease-in-out` rather than a keyframe animation.

---

## File Paths Summary

Files to **modify** (all created in prior sections):

- `src/App.tsx` -- verify router catch-all and redirects
- `src/pages/SearchPage.tsx` -- info banner for expired session, verify error banner messages
- `src/pages/DashboardPage.tsx` -- empty state messages, missing artifact placeholders, toast for export errors, tab fade transition
- `src/components/DashboardHeader.tsx` -- long topic name truncation with title attribute
- `src/components/ProgressFeed.tsx` -- verify entrance animations, pulsing dot
- `src/components/SourceCard.tsx` -- verify evaluation-failed visual treatment
- `src/components/ConceptMap.tsx` -- optional "Reset View" button
- `src/lib/sse.ts` -- verify 429 and connection-refused error messages
- `src/index.css` (or `src/animations.css`) -- all keyframe animation definitions
- `tailwind.config.js` -- optional: register custom animation utilities

Files to **create**:

- `src/__tests__/edge-cases.test.tsx` -- edge case tests
- `src/__tests__/router.test.tsx` -- router configuration tests

---

## Edge Cases Checklist

| Scenario | Expected Behavior | Where Handled |
|----------|-------------------|---------------|
| 0 sources evaluated | "No sources could be evaluated. Try a different topic." | DashboardPage Sources tab |
| Missing summary artifact | "No summary was generated for this research." | DashboardPage Summary tab |
| Missing concept_map artifact | "No concept map was generated for this research." | DashboardPage Concept Map tab |
| Missing flashcards artifact | "No flashcards were generated for this research." | DashboardPage Flashcards tab |
| Backend server down | "Cannot connect to the research server. Make sure it's running at {API_URL}." | SearchPage error banner (via sse.ts error) |
| 429 Too Many Requests | "The server is busy. Please wait a moment and try again." | SearchPage error banner (via sse.ts onopen) |
| Browser refresh on /dashboard | Redirect to /search with info message | DashboardPage redirect guard |
| Direct navigation to /dashboard (no state) | Redirect to /search | DashboardPage redirect guard |
| Unknown route (e.g., /foo) | Redirect to /search | App.tsx catch-all route |
| Long topic name in header | Truncated with ellipsis, full text on hover | DashboardHeader |
| Export with expired session (404) | Toast: "Research session has expired." | DashboardPage export handler |
| Export with network error | Toast: "Export failed. Check your connection." | DashboardPage export handler |
| Export with null sessionId | Button disabled | DashboardPage |
| All sources evaluation_failed | Cards dimmed, "Failed" badge, sorted to bottom | SourceCard + DashboardPage sorting |

## Implementation Notes

### Deviations from Plan

1. **Router catch-all**: Changed from `<NotFound />` component to `<Navigate to="/search" replace />`. `NotFound.tsx` still exists on disk (dead code, not deleted).
2. **429 error message**: Kept existing wording "Server is busy. Please try again later." rather than plan's "The server is busy. Please wait a moment and try again." (functionally equivalent, tests pass with flexible matcher).
3. **Placeholder icons**: Plan specified info circle icons alongside placeholder messages; implemented as plain text (cleaner, less visual noise).
4. **fade-in duration**: Pre-existing 0.3s (plan said 0.2s) — kept as-is since change is imperceptible.
5. **Failed badge styling**: Kept `bg-destructive/15 text-destructive` (more visible) instead of plan's `bg-slate-600 text-slate-300`.
6. **SSE double-onError fix**: Code review found `onerror` + `.catch()` both called `onError`. Fixed with `errorHandled` flag.
7. **DashboardHeader CSS**: Code review found `inline-block` conflicting with `hidden sm:inline`. Fixed to `hidden sm:inline-block`.
8. **ConceptMap Reset View**: Implemented as a key-reset pattern with `RotateCcw` icon button.
9. **Pulsing dot**: Changed from `animate-ping` (built-in Tailwind) to custom `animate-pulse-dot` per spec.

### Files Modified

- `src/App.tsx` — catch-all route changed to Navigate redirect
- `src/pages/SearchPage.tsx` — added info banner for expired session redirect
- `src/pages/DashboardPage.tsx` — missing artifact placeholders, empty sources with "New Search" button, tab key={activeTab} for animation, redirect passes state message
- `src/components/DashboardHeader.tsx` — topic truncation with `max-w-[400px]` and responsive `sm:inline-block`
- `src/components/ProgressFeed.tsx` — custom pulse-dot animation for status indicator
- `src/components/SourceCard.tsx` — key_insight fallback text for failed sources
- `src/components/ConceptMap.tsx` — "Reset View" button with key-reset pattern
- `src/lib/sse.ts` — connection error includes API_BASE_URL, fixed double-onError
- `tailwind.config.ts` — added `pulse-dot` keyframe and animation
- `src/pages/__tests__/DashboardPage.test.tsx` — updated redirect expectations

### Files Created

- `src/__tests__/edge-cases.test.tsx` — 8 edge case tests
- `src/__tests__/router.test.tsx` — 5 router configuration tests

### Test Results

- 93 tests passing across 13 test files
- 13 new tests added (8 edge case + 5 router)

## Definition of Done

- [x] Router: `/` redirects to `/search`
- [x] Router: unknown routes redirect to `/search` (catch-all `*`)
- [x] Empty sources shows "No sources could be evaluated" message with "New Search" link
- [x] Missing artifacts show per-tab placeholder messages
- [x] Backend unavailable shows connection error with API URL
- [x] 429 shows "server busy" message
- [x] Browser refresh on dashboard redirects to /search with info banner
- [x] Long topic names truncated with hover tooltip in dashboard header
- [x] Source cards have staggered fadeInUp entrance animation in progress feed
- [x] Status message has pulsing dot indicator during streaming
- [x] Tab content has subtle fade transition on switch
- [x] Evaluation-failed sources dimmed with "Failed" badge
- [x] Export error toasts display and auto-dismiss
- [x] Export button disabled when sessionId is null
- [x] All animation keyframes defined (fadeInUp, fadeIn, pulse-dot)
- [x] All edge case tests passing
- [x] All router tests passing
