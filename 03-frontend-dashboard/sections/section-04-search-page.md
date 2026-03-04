# Section 04: Search Page — SSE Wiring and Router State Preparation

## Overview

This section connects the Lovable-generated SearchPage UI to the `useResearch` hook. It implements form submission, real-time progress display with animated source cards, error handling with retry, and automatic navigation to the dashboard upon completion. A critical utility `prepareRouterState` strips large `deep_read_content` fields before passing data through React Router to avoid History API size limits.

## Dependencies

- section-01-setup (Lovable-generated SearchPage component)
- section-02-types (ResearchState, ResearchAction types)
- section-03-sse-layer (useResearch hook)

## Tests

### SearchPage Component Tests (`src/pages/__tests__/SearchPage.test.tsx`)

```
# Test: renders search input, depth selector, and research button
# Test: clicking Research button disables input and button
# Test: progress feed shows statusMessage during streaming
# Test: source cards appear as source_evaluated events arrive
# Test: error banner appears on non-recoverable error
# Test: "Try Again" button resets state and re-submits
# Test: navigates to /dashboard on complete
```

### prepareRouterState Tests (`src/lib/__tests__/prepareRouterState.test.ts`)

```
# Test: strips deep_read_content from all sources
# Test: preserves all other source fields
# Test: preserves artifacts, sessionId, topic, depth
# Test: handles sources with null deep_read_content
```

## Implementation

### File: `src/lib/prepareRouterState.ts`

**Purpose:** Strip `deep_read_content` from sources before passing through React Router.

**Problem:** `EvaluatedSource` objects contain `deep_read_content` with full web page text (potentially megabytes). React Router uses the History API, which has size limits. The dashboard UI does not display `deep_read_content`.

```typescript
import type { ResearchState, EvaluatedSource } from '../types/research';

export interface PreparedRouterState {
  topic: string;
  depth: string;
  sources: Array<Omit<EvaluatedSource, 'deep_read_content'>>;
  artifacts: Record<string, string | object>;
  sessionId: string | null;
  sourceTotal: number;
}

export function prepareRouterState(state: ResearchState): PreparedRouterState
```

Implementation: Map over `state.sources`, destructure to exclude `deep_read_content`, return cleaned state object with topic, depth, sources, artifacts, sessionId, sourceTotal.

### File: `src/pages/SearchPage.tsx` (Modify Lovable output)

**Wire the Lovable-generated search page to the `useResearch` hook:**

1. **Local state for form inputs:**
   - `topic` (string, from SearchInput)
   - `depth` (string, default 'standard', from DepthSelector)

2. **Hook up useResearch:**
   ```typescript
   const { state, startResearch, reset } = useResearch();
   const navigate = useNavigate();
   ```

3. **Form submission handler:**
   - Call `startResearch(topic, depth)` when user clicks "Research"
   - Guard: skip if `topic.trim()` is empty

4. **Disable UI during streaming:**
   - `const isActive = state.status === 'loading' || state.status === 'streaming'`
   - Pass `disabled={isActive}` to SearchInput and Research button

5. **Navigation on completion:**
   ```typescript
   useEffect(() => {
     if (state.status === 'complete') {
       navigate('/dashboard', { state: prepareRouterState(state) });
     }
   }, [state.status]);
   ```

6. **Error banner:**
   - When `state.status === 'error'` and `state.error` is non-null
   - Show error message with red accent border (glassmorphism style)
   - "Try Again" button calls `reset()` then `startResearch(topic, depth)`

### File: `src/components/ProgressFeed.tsx` (Wire Lovable output)

**Wire the progress feed to display streaming data:**

1. **Status message:** Show `state.statusMessage` with pulsing dot animation
2. **Progress indicator:** "Evaluating source {sources.length} of {sourceTotal}" when sourceTotal > 0
3. **Source cards:** Render SourceCard for each source in `state.sources` with entrance animation:
   - CSS keyframe `fadeInUp`: opacity 0->1, translateY 20px->0
   - Stagger using `animationDelay: ${index * 50}ms`

### Animations

Add CSS animation for source card entrance:
```css
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-fade-in-up {
  animation: fadeInUp 0.4s ease-out forwards;
}
```

The pulsing dot uses a scale keyframe (1 -> 1.2 -> 1) with a glow effect.

## Error Handling Details

1. **Non-recoverable errors** (`state.error.recoverable === false`): Error banner with message + "Try Again" button
2. **Recoverable errors**: Warnings appended to `statusMessage` by reducer, shown in progress feed
3. **Network errors**: "Cannot connect to the research server. Make sure it's running at {API_URL}."
4. **429 Too Many Requests**: "The server is busy. Please wait a moment and try again."

## Edge Cases

- **Empty topic submission:** Guard with `topic.trim()` check
- **Rapid re-submission:** `isActive` flag disables button during streaming
- **User navigates away during streaming:** Hook cleans up (abort) on unmount

## File Paths (Actual)

- `src/lib/prepareRouterState.ts` — Created
- `src/lib/__tests__/prepareRouterState.test.ts` — Created (4 tests)
- `src/pages/SearchPage.tsx` — Modified (wired to useResearch, navigation, error banner)
- `src/pages/__tests__/SearchPage.test.tsx` — Created (7 tests)
- `src/components/ProgressFeed.tsx` — Modified (accepts state props, renders source cards)
- `src/components/SearchInput.tsx` — Modified (added disabled prop)
- `src/components/DepthSelector.tsx` — Modified (added disabled prop)
- `tailwind.config.ts` — Modified (added fade-in-up animation)

## Definition of Done

- [x] SearchPage wired to useResearch hook
- [x] Form submits topic and depth, button disabled during streaming
- [x] Progress feed shows status messages and animated source cards
- [x] Error banner appears with "Try Again" on non-recoverable error
- [x] Auto-navigates to /dashboard on complete
- [x] prepareRouterState strips deep_read_content from sources
- [x] All tests passing (39/39 total)

## Deviations from Plan

- Added disabled prop to DepthSelector (review finding: all form controls should be disabled during streaming)
- Pulsing dot uses Tailwind's animate-ping instead of custom scale keyframe (acceptable UX alternative)
- SourceCard key uses `${url}-${index}` for uniqueness (review finding: duplicate URLs possible)
