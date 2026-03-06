# Section 10: Conflict Detection + Assumption Surfacing -- Frontend

## Overview

This section adds frontend rendering for conflict detection and assumption surfacing artifacts (from Section 9). It introduces `Conflict` and `Assumption` TypeScript interfaces, `ConflictCard` and `AssumptionCard` display components, artifact parsing, an "Analysis" tab, and DashboardPage wiring.

### Dependencies

- **Section 9 (conflicts-backend):** Backend generates `conflicts` and `assumptions` artifacts
- **Section 8 (timeline-frontend):** Introduces `visibleTabs` prop on TabNavigation and updates `TabId` union

### Files to Create

| File | Purpose |
|------|---------|
| `03-frontend-dashboard/src/components/ConflictCard.tsx` | Single source disagreement display |
| `03-frontend-dashboard/src/components/AssumptionCard.tsx` | Single hidden assumption display |
| `03-frontend-dashboard/src/components/__tests__/ConflictCard.test.tsx` | Tests |
| `03-frontend-dashboard/src/components/__tests__/AssumptionCard.test.tsx` | Tests |

### Files to Modify

| File | Change |
|------|--------|
| `03-frontend-dashboard/src/types/research.ts` | Add `Conflict` and `Assumption` interfaces |
| `03-frontend-dashboard/src/lib/artifacts.ts` | Add `conflicts` and `assumptions` cases |
| `03-frontend-dashboard/src/lib/artifacts.test.ts` | Add tests for new artifact types |
| `03-frontend-dashboard/src/components/TabNavigation.tsx` | Ensure `"analysis"` in `TabId` |
| `03-frontend-dashboard/src/components/__tests__/TabNavigation.test.tsx` | Add Analysis tab test |
| `03-frontend-dashboard/src/pages/DashboardPage.tsx` | Parse and render Analysis tab |

---

## Tests First

### Artifact Parsing Tests (`artifacts.test.ts`)

```typescript
// Test: normalizeArtifact("conflicts", jsonString) returns Conflict array
// Test: normalizeArtifact("assumptions", jsonString) returns Assumption array
// Test: normalizeArtifact for conflicts/assumptions handles malformed JSON (returns [])
```

### ConflictCard Tests (`ConflictCard.test.tsx`)

```typescript
// Helper: makeConflict(overrides) returns a Conflict with defaults

// Test: renders topic heading
// Test: renders source_a title and claim
// Test: renders source_b title and claim
// Test: renders assessment text
// Test: shows AlertTriangle icon (check for SVG element)
```

### AssumptionCard Tests (`AssumptionCard.test.tsx`)

```typescript
// Helper: makeAssumption(overrides) returns an Assumption with defaults

// Test: renders assumption text as heading
// Test: renders why_it_matters section
// Test: renders risk_level badge with correct color (high=red, medium=yellow, low=green)
// Test: renders sources_relying as inline badges
// Test: shows Lightbulb icon (check for SVG element)
```

### TabNavigation Tests (`TabNavigation.test.tsx`)

```typescript
// Test: renders "Analysis" tab when included in visibleTabs
```

---

## Implementation Details

### 1. Type Additions -- `types/research.ts`

```typescript
export interface Conflict {
  topic: string;
  source_a: { title: string; claim: string };
  source_b: { title: string; claim: string };
  assessment: string;
}

export interface Assumption {
  assumption: string;
  why_it_matters: string;
  sources_relying: string[];
  risk_level: 'high' | 'medium' | 'low';
}
```

### 2. Artifact Parsing -- `artifacts.ts`

Add `case 'conflicts':` and `case 'assumptions':` sharing a single case block (same fence-stripping + JSON.parse logic as flashcards). Returns parsed array or `[]` on failure.

### 3. ConflictCard Component

**File:** `03-frontend-dashboard/src/components/ConflictCard.tsx`

Props: `{ conflict: Conflict }`

**Visual structure:**
- Glass card: `glass p-5 border border-glass-border rounded-xl`
- Header: `AlertTriangle` icon (lucide-react, `text-score-yellow`) + topic heading (`text-lg font-semibold`)
- Two-column grid (`grid grid-cols-1 md:grid-cols-2 gap-4 mt-4`):
  - Source A: `border-l-2 border-primary/50 pl-3`, title badge in primary tint, claim in italic
  - Source B: `border-l-2 border-violet-500/50 pl-3`, title badge in violet tint, claim in italic
- Assessment below in italics with `border-t border-glass-border`

### 4. AssumptionCard Component

**File:** `03-frontend-dashboard/src/components/AssumptionCard.tsx`

Props: `{ assumption: Assumption }`

**Visual structure:**
- Glass card: `glass p-5 border border-glass-border rounded-xl`
- Header: `Lightbulb` icon (lucide-react, `text-primary`) + assumption text heading
- Risk level badge using score colors:
  - `high` → `text-score-red bg-score-red/15`
  - `medium` → `text-score-yellow bg-score-yellow/15`
  - `low` → `text-score-green bg-score-green/15`
- "Why it matters" section: `text-sm text-muted-foreground mt-3`
- Sources relying: inline badges with `text-xs px-2 py-0.5 rounded-full bg-secondary`

### 5. Tab Integration -- `TabNavigation.tsx`

Ensure `"analysis"` is in `TabId` union and `allTabs` array (after `"timeline"`, before `"chat"`).

### 6. DashboardPage Integration

**Parse artifacts:**
```typescript
const conflicts = useMemo(() => {
  const raw = researchState?.artifacts?.conflicts;
  if (!raw) return [];
  return normalizeArtifact('conflicts', raw as string) as Conflict[];
}, [researchState?.artifacts?.conflicts]);

const assumptions = useMemo(() => {
  const raw = researchState?.artifacts?.assumptions;
  if (!raw) return [];
  return normalizeArtifact('assumptions', raw as string) as Assumption[];
}, [researchState?.artifacts?.assumptions]);
```

**Include "analysis" in visibleTabs** (always visible when research complete).

**Analysis tab content:**
```tsx
{activeTab === "analysis" && (
  <div className="space-y-8 animate-fade-in">
    <section>
      <h2 className="text-xl font-semibold mb-4">Source Disagreements</h2>
      {conflicts.length > 0 ? (
        <div className="space-y-4">
          {conflicts.map((c, i) => <ConflictCard key={i} conflict={c} />)}
        </div>
      ) : (
        <p className="text-muted-foreground text-center py-6 glass rounded-xl">
          No disagreements detected between sources.
        </p>
      )}
    </section>
    <section>
      <h2 className="text-xl font-semibold mb-4">Hidden Assumptions</h2>
      {assumptions.length > 0 ? (
        <div className="space-y-4">
          {assumptions.map((a, i) => <AssumptionCard key={i} assumption={a} />)}
        </div>
      ) : (
        <p className="text-muted-foreground text-center py-6 glass rounded-xl">
          No notable assumptions identified.
        </p>
      )}
    </section>
  </div>
)}
```

---

## Styling Notes

- Glass cards: `glass` + `border border-glass-border`
- Score colors: `text-score-green`/`text-score-yellow`/`text-score-red`
- Badges: `text-xs px-2 py-0.5 rounded-full`
- Icons: `AlertTriangle` and `Lightbulb` from `lucide-react`
- Tab transitions: `animate-fade-in`

---

## Implementation Notes

### What Was Actually Built
Implementation matched the plan with two minor auto-fix improvements from code review:
1. Fixed React key collision risk in AssumptionCard sources_relying list
2. Removed redundant `animate-fade-in` on analysis tab (parent div already applies it)

### Files Created
- `03-frontend-dashboard/src/components/ConflictCard.tsx` — Conflict display card
- `03-frontend-dashboard/src/components/AssumptionCard.tsx` — Assumption display card
- `03-frontend-dashboard/src/components/__tests__/ConflictCard.test.tsx` — 5 tests
- `03-frontend-dashboard/src/components/__tests__/AssumptionCard.test.tsx` — 5 tests

### Files Modified
- `03-frontend-dashboard/src/types/research.ts` — Added `Conflict` and `Assumption` interfaces
- `03-frontend-dashboard/src/lib/artifacts.ts` — Added `conflicts` and `assumptions` parsing cases
- `03-frontend-dashboard/src/lib/artifacts.test.ts` — Added 4 new artifact parsing tests
- `03-frontend-dashboard/src/components/__tests__/TabNavigation.test.tsx` — Added Analysis tab test
- `03-frontend-dashboard/src/pages/DashboardPage.tsx` — Analysis tab integration with conflicts/assumptions rendering

### Test Results
- 29 frontend tests pass (15 new + 14 existing)
- All existing tests unaffected

### Code Review
- Verdict: PASS
- 2 auto-fixes applied (key collision, redundant animation)
- 2 observations let go (DRY opportunity, implicit test coverage)
