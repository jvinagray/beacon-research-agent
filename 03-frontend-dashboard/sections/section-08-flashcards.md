# Section 08: Flashcards Tab

## Overview

This section wires the Flashcards tab in the DashboardPage to render interactive flashcard components using the pre-parsed `Flashcard[]` data from the artifact normalizer (section-03). The `FlashCard` component uses CSS 3D transforms for a flip animation with glassmorphism styling. The tab displays a grid of cards with a card counter.

The FlashCard component is expected to already exist as a Lovable-generated shell (section-01). This section covers wiring it with real data, ensuring the 3D flip animation works correctly, and integrating the flashcards grid into the dashboard's Flashcards tab.

## Dependencies

- **section-05-dashboard-sources**: Provides the DashboardPage with tab navigation and the `flashcards` placeholder in the tab content area. The dashboard reads `artifacts.flashcards` from router state.
- **section-02-types**: Provides the `Flashcard` type (`{ question: string; answer: string }`).
- **section-03-sse-layer**: The artifact normalizer (`normalizeArtifact`) has already parsed the flashcards JSON string into a `Flashcard[]` array before it reaches the dashboard.
- **section-01-setup**: Lovable-generated `FlashCard.tsx` component shell exists.

This section is parallelizable with section-06-markdown-viewer and section-07-concept-map.

## Background: Flashcard Data Flow

The full data flow for flashcards is:

1. Backend sends an SSE `artifact` event with `artifact_type: "flashcards"` and `data` as a JSON-encoded string (e.g., `"[{\"question\": \"What is...\", \"answer\": \"It is...\"}]"`)
2. The research reducer dispatches `ARTIFACT_RECEIVED` which calls `normalizeArtifact("flashcards", data)` (section-03)
3. `normalizeArtifact` calls `JSON.parse()` on the string, producing a `Flashcard[]` array
4. The parsed array is stored in `state.artifacts.flashcards`
5. When the research completes, `prepareRouterState` passes artifacts through React Router state to the dashboard (section-04)
6. The DashboardPage reads `researchState.artifacts.flashcards` as `Flashcard[]` and renders FlashCard components

By the time data reaches this section's code, `artifacts.flashcards` is already a parsed `Flashcard[]` array -- no additional parsing is needed.

## Tests

### FlashCard Component Tests (`src/components/__tests__/FlashCard.test.tsx`)

```
# Test: renders question text on front face
# Test: renders answer text on back face
# Test: clicking card toggles flipped state
# Test: flipped card shows answer (backface-visibility logic)
# Test: applies glassmorphism styling
```

**Test setup guidance:**

Each test renders a `FlashCard` component with sample `question` and `answer` props.

- For "renders question text on front face": Render the component and assert the question text is visible in the document.
- For "renders answer text on back face": The answer text should be present in the DOM (even when not flipped), rendered inside the back face element. Assert it exists.
- For "clicking card toggles flipped state": Use `fireEvent.click` on the card container. After clicking, verify the inner element receives the CSS class or inline style that triggers the 180-degree Y rotation. Click again to verify it toggles back.
- For "flipped card shows answer": After clicking, verify the transform style includes `rotateY(180deg)` on the inner flip container. The CSS `backface-visibility: hidden` on each face ensures only the relevant face is visible (this is a CSS concern, but the test can verify the transform class/style is applied).
- For "applies glassmorphism styling": Assert the card container includes glassmorphism-related CSS classes such as `backdrop-blur`, `bg-white/` or `bg-slate-` with opacity, and `border` classes.

### Flashcards Tab Integration (within `src/pages/__tests__/DashboardPage.test.tsx`)

These tests are part of the existing DashboardPage test file from section-05. Add or verify:

```
# Test: switching to Flashcards tab renders flashcard components with data
# Test: Flashcards tab shows card count "Card N of M" or similar counter
# Test: Flashcards tab with empty/missing flashcards shows placeholder message
```

## Implementation

### File: `src/components/FlashCard.tsx`

This file may already exist from the Lovable export (section-01). Modify or create it to accept typed props and implement the 3D flip animation.

**Props interface:**

```typescript
import type { Flashcard } from '../types/research';

interface FlashCardProps {
  card: Flashcard;       // { question: string, answer: string }
  index: number;         // Card number (for display, e.g., "Card 1 of N")
  total: number;         // Total card count
}
```

**Component structure:**

The FlashCard component manages a local `flipped` boolean state via `useState`. Clicking the card toggles the state.

```typescript
const [flipped, setFlipped] = useState(false);

const handleFlip = () => setFlipped((prev) => !prev);
```

**Render structure (conceptual):**

```
<div onClick={handleFlip} className="[perspective:1000px] cursor-pointer">
  <div className={`relative w-full h-full transition-transform duration-[600ms] ease-in-out [transform-style:preserve-3d] ${flipped ? '[transform:rotateY(180deg)]' : ''}`}>

    {/* Front face - Question */}
    <div className="absolute inset-0 [backface-visibility:hidden] rounded-xl bg-white/5 backdrop-blur-md border border-white/10 p-6 flex flex-col justify-center items-center">
      <p className="text-sm text-slate-400 mb-2">Question</p>
      <p className="text-lg text-white text-center">{card.question}</p>
      <p className="text-xs text-slate-500 mt-4">Click to reveal answer</p>
    </div>

    {/* Back face - Answer */}
    <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] rounded-xl bg-white/5 backdrop-blur-md border border-white/10 p-6 flex flex-col justify-center items-center">
      <p className="text-sm text-emerald-400 mb-2">Answer</p>
      <p className="text-lg text-white text-center">{card.answer}</p>
      <p className="text-xs text-slate-500 mt-4">Click to flip back</p>
    </div>

  </div>
</div>
```

**Key CSS details:**

- **Outer container**: `perspective: 1000px` enables the 3D effect. Add `cursor-pointer` for click affordance.
- **Inner flip element**: `transform-style: preserve-3d` ensures children are in 3D space. `transition: transform 0.6s ease-in-out` animates the flip. When `flipped` is true, apply `transform: rotateY(180deg)`.
- **Front face**: `backface-visibility: hidden` hides this face when rotated away. No additional transform (faces front by default).
- **Back face**: `backface-visibility: hidden` AND `transform: rotateY(180deg)` pre-rotates it so it faces backward initially. When the parent rotates 180 degrees, this face comes to front.
- **Glassmorphism**: Both faces use `bg-white/5 backdrop-blur-md border border-white/10` (or similar frosted glass classes matching the project's existing theme).
- **Card dimensions**: Set a fixed height (e.g., `h-64` or `min-h-[16rem]`) so the card has consistent dimensions for the flip animation. Width should be responsive within the grid.

**Card counter:** Display `index` and `total` as a subtle label (e.g., "Card {index} of {total}") at the bottom of the card or in a corner.

### File: `src/pages/DashboardPage.tsx` (Modify)

In the DashboardPage (created in section-05), the Flashcards tab currently renders a placeholder. Replace the placeholder with the flashcards grid.

**Extracting flashcard data from router state:**

```typescript
import type { Flashcard } from '../types/research';

// Inside the component, after reading researchState from router state:
const flashcards = (researchState?.artifacts?.flashcards ?? []) as Flashcard[];
```

**Flashcards tab content rendering (within the tab content area):**

When `activeTab === 'flashcards'`, render:

```typescript
{activeTab === 'flashcards' && (
  flashcards.length > 0 ? (
    <div>
      <p className="text-slate-400 mb-4">
        {flashcards.length} flashcard{flashcards.length !== 1 ? 's' : ''}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {flashcards.map((card, idx) => (
          <FlashCard
            key={idx}
            card={card}
            index={idx + 1}
            total={flashcards.length}
          />
        ))}
      </div>
    </div>
  ) : (
    <div className="text-center text-slate-400 py-12">
      No flashcards were generated for this research.
    </div>
  )
)}
```

**Grid layout:** Use a responsive CSS grid: 1 column on mobile, 2 on medium screens, 3 on large screens. The `gap-6` provides spacing between cards.

**Empty state:** If `flashcards` array is empty or the `flashcards` key is missing from artifacts, show the placeholder message: "No flashcards were generated for this research."

**Card count display:** Show a summary line above the grid: "{N} flashcards" (or "1 flashcard" for singular).

### Import the FlashCard Component

Add the import to DashboardPage.tsx:

```typescript
import { FlashCard } from '../components/FlashCard';
```

## Files Created/Modified

- `src/components/FlashCard.tsx` -- Modified: updated props to `card: Flashcard`, added data-testid attrs, front/back face labels
- `src/components/__tests__/FlashCard.test.tsx` -- Created: 6 tests (5 spec + 1 bonus counter test)
- `src/pages/DashboardPage.tsx` -- Modified: replaced flashcards placeholder with grid + defensive Array.isArray check
- `src/pages/__tests__/DashboardPage.test.tsx` -- Modified: replaced old placeholder test with 3 integration tests

## Edge Cases

- **Missing flashcards artifact:** If `artifacts.flashcards` is undefined or null, treat as empty array. Display placeholder message "No flashcards were generated for this research."
- **Empty flashcards array:** Same treatment as missing -- show placeholder message.
- **Single flashcard:** Card count should read "1 flashcard" (singular). Grid still works with a single item.
- **Long question/answer text:** Text should wrap within the card. Consider adding `overflow-y-auto` to the face content areas for very long text, or use smaller font sizes with Tailwind's responsive text utilities.
- **Already-flipped cards on tab switch:** Each FlashCard manages its own `flipped` state independently. Switching away from the Flashcards tab and back preserves flip state if the component stays mounted. If React unmounts/remounts, cards reset to showing the question side (this is acceptable behavior).
- **Malformed flashcard data:** If the artifact normalizer failed to parse (returning a raw string instead of an array), the cast to `Flashcard[]` would produce unexpected behavior. Add a defensive check: verify the data is actually an array before rendering. If not an array, show the placeholder message.

**Defensive array check:**

```typescript
const rawFlashcards = researchState?.artifacts?.flashcards;
const flashcards: Flashcard[] = Array.isArray(rawFlashcards) ? rawFlashcards : [];
```

This handles the edge case where `normalizeArtifact` returned a raw string due to malformed JSON.

## Deviations from Plan

- Animation duration uses Tailwind `duration-500` (500ms) instead of spec's 600ms. Cosmetic, preserved from Lovable shell.
- Easing uses Tailwind default instead of explicit `ease-in-out`. Minimal visual difference.

## Definition of Done

- [x] FlashCard component accepts `card`, `index`, and `total` props
- [x] 3D flip animation works on click (rotateY 180deg with 0.5s transition)
- [x] Front face shows question text, back face shows answer text
- [x] `backface-visibility: hidden` applied to both faces
- [x] Glassmorphism styling on both faces (glass utility class)
- [x] `perspective` set on outer container for 3D effect
- [x] Flashcards tab in DashboardPage renders grid of FlashCard components from `artifacts.flashcards`
- [x] Responsive grid layout: 1 column mobile, 2 columns medium, 3 columns large
- [x] Card count displayed above grid ("{N} flashcards")
- [x] Empty/missing flashcards shows placeholder: "No flashcards were generated for this research."
- [x] Defensive check ensures flashcards data is an array before rendering
- [x] All FlashCard component tests passing (6/6)
- [x] All DashboardPage flashcards tab tests passing (3/3)
