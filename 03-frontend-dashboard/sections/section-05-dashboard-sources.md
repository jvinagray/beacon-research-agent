# Section 05: Dashboard Sources Tab

## Overview

This section implements the core dashboard page structure and the Sources tab. The dashboard reads research results from React Router state (passed from the search page) and provides four tabbed views. This section covers:

- DashboardPage component wiring with router state reading
- Redirect guard (no state or null sessionId -> redirect to /search)
- Sources tab with sorted, scored source cards
- Dashboard header with topic and source count
- Export button with download and error handling
- Evaluation-failed source handling (dimmed cards, sorted to bottom)

## Dependencies

- section-04-search-page (provides router state via prepareRouterState)
- section-02-types (EvaluatedSource, ResearchState types)
- Lovable-generated components: DashboardHeader, TabNavigation, SourceCard

## Tests

### DashboardPage Tests (`src/pages/__tests__/DashboardPage.test.tsx`)

```
# Test: redirects to /search when no router state present
# Test: renders Sources tab by default with source cards
# Test: sources sorted by learning_efficiency_score descending
# Test: evaluation_failed sources appear dimmed at bottom
# Test: switching to Summary tab renders markdown content area
# Test: switching to Flashcards tab renders flip cards area
# Test: export button triggers file download
# Test: export button shows error toast on 404 (expired session)
# Test: redirects to /search when sessionId is null
```

### SourceCard Tests (`src/components/__tests__/SourceCard.test.tsx`)

```
# Test: renders title as link to source URL (opens new tab)
# Test: score badge shows green glow for scores 8-10
# Test: score badge shows yellow glow for scores 5-7
# Test: score badge shows red glow for scores 0-4
# Test: evaluation_failed source shows "Failed" badge instead of score
# Test: renders content type tag
# Test: renders time estimate in "~N min read" format
# Test: renders key insight text
# Test: expandable section shows coverage topics, recency, snippet
```

## Implementation

### File: `src/pages/DashboardPage.tsx`

**1. Read router state with redirect guard:**
```typescript
const location = useLocation();
const navigate = useNavigate();
const researchState = location.state as PreparedRouterState | null;

useEffect(() => {
  if (!researchState || !researchState.sessionId) {
    navigate('/search');
  }
}, [researchState, navigate]);
```

**2. Tab state management:**
Uses `TabId` type imported from `TabNavigation` component (`"sources" | "summary" | "concept-map" | "flashcards"` - note: hyphenated, not underscored).

**3. Export handler:**
- Fetch `GET {API_BASE_URL}/api/export/{sessionId}`
- On 200: Create blob, create temp anchor element, trigger download with filename `beacon-research-{slug}.md`
- On 404: Show sonner toast "Research session has expired. Please run a new search."
- On network error: Show sonner toast "Export failed. Check your connection and try again."
- Button disabled when sessionId is null (but page redirects in this case)

**4. Render structure:**
- DashboardHeader with topic, sourceCount, export handler
- TabNavigation with activeTab and onTabChange
- Tab content area: conditionally render based on activeTab
  - `sources` -> sorted SourceCard list (this section)
  - `summary` -> placeholder with data-testid (wired in section-06)
  - `concept-map` -> placeholder with data-testid (wired in section-07)
  - `flashcards` -> placeholder with data-testid (wired in section-08)

### Sources Tab Sorting Logic

```typescript
const sortedSources = useMemo(() => {
  const successful = sources.filter(s => !s.signals.evaluation_failed);
  const failed = sources.filter(s => s.signals.evaluation_failed);
  const sorted = [...successful].sort((a, b) =>
    b.signals.learning_efficiency_score - a.signals.learning_efficiency_score
  );
  return [...sorted, ...failed];
}, [researchState]);
```

**Deviation from plan:** Used defensive copy `[...successful].sort()` instead of in-place `successful.sort()` per code review.

**Empty state:** If sources is empty, show "No sources could be evaluated. Try a different topic."

### File: `src/components/SourceCard.tsx`

Rewrote from Lovable scaffold to accept typed `source` prop (`Omit<EvaluatedSource, "deep_read_content">`).

Data bindings:
- `source.title` -> card title (link to `source.url`, `target="_blank"`)
- `source.signals.learning_efficiency_score` -> score badge with conditional glow classes
- `source.signals.evaluation_failed` -> gray "Failed" badge, no glow, `opacity-60`
- `source.signals.content_type` -> tag/badge
- `source.signals.time_estimate_minutes` -> "~{N} min read"
- `source.signals.key_insight` -> text below card header
- Expandable section: `coverage` (topic list), `recency` (date), `snippet`

### File: `src/components/DashboardHeader.tsx`

Updated props: `topic`, `sourceCount`, `onExport`, `exportDisabled`

**Deviation from plan:** Layout is "Beacon / {topic}" left, "{N} sources evaluated" + Export button right (instead of centered text). This works better for responsive layouts.

### File: `src/components/ProgressFeed.tsx`

Updated to pass `source` prop to SourceCard instead of individual props (adapting to new SourceCard interface).

### Files Created/Modified

- `src/pages/DashboardPage.tsx` (modified - replaced mock data with router state)
- `src/pages/__tests__/DashboardPage.test.tsx` (created - 9 tests)
- `src/components/SourceCard.tsx` (modified - new typed source prop)
- `src/components/__tests__/SourceCard.test.tsx` (created - 9 tests)
- `src/components/DashboardHeader.tsx` (modified - export props)
- `src/components/ProgressFeed.tsx` (modified - adapted to new SourceCard interface)
- `package.json` / `package-lock.json` (added @testing-library/user-event)

## Edge Cases

- **Empty results:** 0 sources -> "No sources could be evaluated. Try a different topic."
- **Evaluation-failed sources:** Dimmed (opacity-60), sorted to bottom, "Failed" badge
- **Export 404:** Session expired toast via sonner
- **Export network error:** Generic error toast via sonner
- **Null sessionId:** Redirects to /search (per user decision during code review)
- **Missing router state:** Redirect to /search
- **Long topic names:** CSS truncation with `truncate max-w-xs`, tooltip via `title` attribute

## Definition of Done

- [x] DashboardPage reads router state, redirects if missing or null sessionId
- [x] Sources tab renders sorted source cards (score descending)
- [x] Evaluation-failed sources dimmed at bottom
- [x] Dashboard header shows topic and source count
- [x] Export button triggers download with error handling
- [x] Null sessionId redirects to /search
- [x] Tab navigation switches between 4 tabs
- [x] Score badges have conditional glow colors
- [x] All 57 tests passing (18 new: 9 DashboardPage + 9 SourceCard)
