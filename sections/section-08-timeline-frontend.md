# Section 8: Timeline -- Frontend Display

## Overview

This section adds the frontend components for displaying timeline events extracted by the backend pipeline (Section 7). It involves:

1. Adding the `TimelineEvent` TypeScript interface
2. Extending `normalizeArtifact()` to parse timeline JSON
3. Creating a `Timeline.tsx` component with vertical layout, alternating cards, significance coloring, and staggered entrance animations via `IntersectionObserver`
4. Making `TabNavigation` accept a `visibleTabs` prop for conditional tab visibility
5. Wiring the timeline tab into `DashboardPage.tsx`

**Dependencies:** Section 7 (Timeline -- Backend Artifact Generation) must be complete so the backend emits `timeline` artifacts.

---

## Files to Create or Modify

| File | Action |
|------|--------|
| `03-frontend-dashboard/src/types/research.ts` | Add `TimelineEvent` interface |
| `03-frontend-dashboard/src/lib/artifacts.ts` | Add `timeline` case to `normalizeArtifact()` |
| `03-frontend-dashboard/src/lib/artifacts.test.ts` | Add timeline parsing tests |
| `03-frontend-dashboard/src/components/Timeline.tsx` | New component |
| `03-frontend-dashboard/src/components/__tests__/Timeline.test.tsx` | New test file |
| `03-frontend-dashboard/src/components/TabNavigation.tsx` | Add `visibleTabs` prop, add `"timeline"` and `"analysis"` to `TabId` |
| `03-frontend-dashboard/src/components/__tests__/TabNavigation.test.tsx` | Add tests for `visibleTabs` filtering |
| `03-frontend-dashboard/src/pages/DashboardPage.tsx` | Wire up timeline tab and `visibleTabs` |

---

## Tests FIRST

### 1. Artifact Parsing Tests

**File:** `03-frontend-dashboard/src/lib/artifacts.test.ts`

Add to the existing `describe('normalizeArtifact', ...)` block:

```
# Test: normalizeArtifact("timeline", jsonString) returns TimelineEvent array
# Test: normalizeArtifact("timeline", malformedJson) returns empty array
# Test: normalizeArtifact("timeline", fencedJson) strips fences and parses
```

### 2. Timeline Component Tests

**File:** `03-frontend-dashboard/src/components/__tests__/Timeline.test.tsx`

```
# Test: renders a timeline item for each event
  - Provide 3 TimelineEvent objects, render, assert 3 data-testid="timeline-event" elements

# Test: displays date, title, description for each event
# Test: displays source_title as badge
# Test: high significance events have primary glow styling
# Test: low significance events have muted styling
# Test: renders empty state gracefully when events array is empty
```

### 3. TabNavigation Tests

**File:** `03-frontend-dashboard/src/components/__tests__/TabNavigation.test.tsx`

```
# Test: renders "Timeline" tab when included in visibleTabs
# Test: does not render "Timeline" tab when excluded from visibleTabs
# Test: accepts visibleTabs prop to control which tabs display
```

---

## Implementation Details

### 1. TimelineEvent Type

**File:** `03-frontend-dashboard/src/types/research.ts`

```typescript
export interface TimelineEvent {
  date: string;
  title: string;
  description: string;
  source_title: string;
  significance: 'high' | 'medium' | 'low';
}
```

### 2. Artifact Parsing -- `normalizeArtifact()` Update

**File:** `03-frontend-dashboard/src/lib/artifacts.ts`

Add `case 'timeline':` using the same fence-stripping + JSON.parse pattern as flashcards. If data is already an array, return directly. If string, strip fences, parse JSON. On failure, return `[]`.

### 3. Timeline Component

**File:** `03-frontend-dashboard/src/components/Timeline.tsx`

Props: `{ events: TimelineEvent[] }`

**Layout:**
- Outer container with relative positioning
- Vertical center line: `w-0.5 bg-glass-border` absolutely positioned, centered horizontally (`left-1/2 -translate-x-1/2`). On mobile: `left-4`
- Events wrapped in `data-testid="timeline-event"` containers
- Events alternate left/right on desktop (even=left, odd=right). All left on mobile with `pl-12`

**Date badge:**
- Centered on the vertical line
- Small circle/pill with date text
- Significance coloring: `high` = `bg-primary shadow-[0_0_8px_hsl(var(--primary))]`, `medium` = `bg-muted`, `low` = `bg-muted/50`

**Event card:**
- Glass card: `glass rounded-xl p-4 border border-glass-border`
- Title bold, description body text, source_title as muted badge
- Significance: `high` = glow shadow, `medium` = normal, `low` = `opacity-75`

**Animation with IntersectionObserver:**
- Cards start with `opacity: 0` and `translate-y-5`
- On intersection: transition to `opacity: 1`, `translate-y-0`
- Stagger with `animation-delay: ${index * 100}ms`
- `unobserve` after trigger (one-shot)
- Clean up observer on unmount

**Empty state:** Return `null` if `events.length === 0`

### 4. TabNavigation Changes

**File:** `03-frontend-dashboard/src/components/TabNavigation.tsx`

Update `TabId`:
```typescript
export type TabId = "sources" | "summary" | "concept-map" | "flashcards" | "timeline" | "analysis" | "chat";
```

Add `allTabs` master list with all tabs in order.

Add optional `visibleTabs?: TabId[]` prop. If provided, filter `allTabs` to only show matching tabs. If not provided, show all (backward compatible).

### 5. DashboardPage Integration

**File:** `03-frontend-dashboard/src/pages/DashboardPage.tsx`

**Parse timeline events:**
```typescript
const timelineEvents = useMemo(() => {
  const raw = researchState?.artifacts?.timeline;
  if (!raw) return [];
  const parsed = normalizeArtifact("timeline", raw as string);
  return Array.isArray(parsed) ? (parsed as TimelineEvent[]) : [];
}, [researchState?.artifacts?.timeline]);
```

**Compute visibleTabs:**
```typescript
const visibleTabs = useMemo(() => {
  const base: TabId[] = ["sources", "summary", "concept-map", "flashcards"];
  if (timelineEvents.length > 0) base.push("timeline");
  // "analysis" added by Section 10
  base.push("chat");
  return base;
}, [timelineEvents]);
```

Pass to `<TabNavigation visibleTabs={visibleTabs} />`.

**Render timeline tab:**
```typescript
{activeTab === "timeline" && <Timeline events={timelineEvents} />}
```

**Edge case:** `useEffect` to reset `activeTab` if it's not in `visibleTabs`.

---

## Styling Reference

- Glass cards: `glass rounded-xl p-4 border border-glass-border`
- Score colors: `text-score-green`/`text-score-yellow`/`text-score-red`
- Primary glow: `shadow-[0_0_12px_hsl(var(--primary)/0.15)]`
- Tab transitions: `animate-fade-in`

## Testing Notes

- Mock `IntersectionObserver` in jsdom (not natively available)
- Use `data-testid` for querying timeline event elements

---

## Implementation Notes

**Deviations from plan:**
- Extracted `stripCodeFences()` as reusable helper in `artifacts.ts` (used by both flashcards and timeline cases)
- Added ARIA accessibility attributes: `role="list"`, `aria-label="Timeline of events"`, `role="listitem"` (code review recommendation)
- Return type of `normalizeArtifact` updated to include `TimelineEvent[]` in the union

**Final test count:** 20 tests across 3 files (9 artifacts + 6 Timeline + 5 TabNavigation), all passing
**Pre-existing failure:** 1 unrelated test in `edge-cases.test.tsx` (localhost:8000 error handling)
