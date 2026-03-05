# Section 02: Replace Concept Map with Mind Map Cards

## Overview

Replace the current react-d3-tree SVG concept map with a custom HTML/CSS recursive mind map using Tailwind-styled glass cards. The current SVG tree renders squished, truncated nodes that are unreadable. The new implementation uses standard document flow (vertical scrolling), full-text display, depth-coded colored borders, and collapsible branches.

This section touches only the `03-frontend-dashboard` layer. It has no dependencies on other sections.

---

## Architecture Context

- **`03-frontend-dashboard/src/components/ConceptMap.tsx`** currently contains both the `parseConceptMap()` function (lines 19-88) and the react-d3-tree rendering. The parser is solid and well-tested — it handles 2-space and 4-space indentation, bold markers (`**text**`), and multiple roots (wraps in a synthetic "Concept Map" root). The parser will be extracted to a shared utility.
- **`03-frontend-dashboard/src/components/ConceptMapContainer.tsx`** is an unused placeholder component that references the old approach. It should be deleted.
- **`03-frontend-dashboard/src/components/__tests__/ConceptMap.test.tsx`** has existing tests that mock `react-d3-tree`. These mocks will be removed and tests updated.
- **`03-frontend-dashboard/package.json`** includes `react-d3-tree` as a dependency (line ~55). It should be removed.
- The project uses a glass dark theme with CSS HSL variables, `backdrop-blur`, and a `.glass` utility class. New components should use this styling.
- `TreeNode` interface: `{ name: string; children?: TreeNode[] }`
- The concept map data comes from `researchState.artifacts.concept_map` as a markdown string with bullet-list indentation representing hierarchy.

---

## Tests (Write First)

### Parser Tests

**File: `03-frontend-dashboard/src/lib/__tests__/conceptMapParser.test.ts`** (create new)

These are the existing parser tests from ConceptMap.test.tsx, moved to the new import path. No new test logic needed — just verify the extracted parser works at its new location.

```typescript
// Test: parseConceptMap returns null for empty string
// - Call parseConceptMap("")
// - Assert returns null

// Test: parseConceptMap parses single root with children
// - Input: "- Root\n  - Child A\n  - Child B"
// - Assert root.name === "Root", root.children has 2 items

// Test: parseConceptMap handles multi-root input (wraps in "Concept Map" root)
// - Input: "- Root A\n- Root B"
// - Assert result.name === "Concept Map", result.children has 2 items

// Test: parseConceptMap strips bold markers from text
// - Input: "- **Bold Root**\n  - Child"
// - Assert root.name === "Bold Root" (no ** markers)

// Test: parseConceptMap handles mixed 2-space and 4-space indentation
// - Input with mixed indentation levels
// - Assert correct tree structure
```

### MindMapNode Tests

**File: `03-frontend-dashboard/src/components/__tests__/MindMapNode.test.tsx`** (create new)

```typescript
// Test: renders node name text without truncation
// - Render MindMapNode with { name: "Full Long Node Name", children: [] } at depth 0
// - Assert the full text "Full Long Node Name" appears in the document

// Test: leaf node (no children) does not render chevron icon
// - Render MindMapNode with { name: "Leaf" } (no children) at depth 0
// - Assert no chevron/toggle button is present

// Test: node with children at depth 0 is initially expanded (children visible)
// - Render with { name: "Root", children: [{ name: "Child" }] } at depth 0
// - Assert "Child" text is visible

// Test: node with children at depth 1 is initially expanded
// - Render at depth 1 with children
// - Assert children are visible

// Test: node with children at depth 2 is initially collapsed (children not visible)
// - Render at depth 2 with children
// - Assert children are NOT visible

// Test: clicking collapsed node expands it (children become visible)
// - Render at depth 2 with children (collapsed)
// - Click the toggle/header
// - Assert children become visible

// Test: clicking expanded node collapses it (children hidden)
// - Render at depth 0 with children (expanded)
// - Click the toggle/header
// - Assert children become hidden

// Test: depth 0 has primary border color class
// - Render at depth 0
// - Assert the node element has the primary border color class (border-primary)

// Test: depth 1 has blue border color class
// - Render at depth 1
// - Assert the node element has border-blue-500 class
```

### ConceptMap Component Tests

**File: `03-frontend-dashboard/src/components/__tests__/ConceptMap.test.tsx`** (modify existing)

Remove react-d3-tree mocks. Update tests:

```typescript
// Test: renders "No concept map data available" when data is empty
// - Render ConceptMap with data=""
// - Assert "No concept map data available" text appears

// Test: renders MarkdownViewer fallback when data can't be parsed
// - Render with data that parseConceptMap returns null for
// - Assert MarkdownViewer is used as fallback

// Test: renders MindMapNode tree when data parses successfully
// - Render with valid concept map markdown
// - Assert root node text is visible

// Test: displays full text content of root node (no truncation)
// - Render with a node that has a long name
// - Assert the full text appears (not truncated to 30 chars like before)

// Test: scrollable container is present with correct classes
// - Render with valid data
// - Assert container has overflow-y-auto class
```

---

## Implementation Details

### 1. Extract Parser to Shared Utility

**CREATE: `03-frontend-dashboard/src/lib/conceptMapParser.ts`**

Extract `TreeNode` interface and `parseConceptMap()` function from `ConceptMap.tsx` lines 19-88. This is a pure file extraction — no logic changes.

```typescript
export interface TreeNode {
  name: string;
  children?: TreeNode[];
}

export function parseConceptMap(markdown: string): TreeNode | null {
  // ... exact same implementation as currently in ConceptMap.tsx lines 20-88
}
```

The parser logic:
1. Splits input by newlines, filters empty lines
2. Strips ` - ` prefix from each line and calculates indent level (by number of leading spaces / 2)
3. Removes `**bold**` markers from text
4. Builds tree by tracking a stack of parent nodes at each depth level
5. If multiple root-level items found, wraps them in a synthetic `{ name: "Concept Map", children: [...] }` node
6. Returns null for empty input

### 2. Create MindMapNode Component

**CREATE: `03-frontend-dashboard/src/components/MindMapNode.tsx`**

A recursive React component rendering a single `TreeNode` and its children as collapsible glass cards.

**Props:**
```typescript
interface MindMapNodeProps {
  node: TreeNode;
  depth: number;
}
```

**Visual design:**
- Each node is a glass card with `backdrop-blur`, semi-transparent background, rounded corners
- Left border color varies by depth, cycling through: `border-primary` (0), `border-blue-500` (1), `border-violet-500` (2), `border-amber-500` (3), `border-emerald-500` (4)
- Full node text displayed — NO truncation
- If node has children: `ChevronRight` icon from `lucide-react` that rotates 90° on expand via CSS `transition-transform duration-200`
- Children rendered inside a `ml-6` container with a `border-l` connecting line in a muted color (e.g., `border-white/10`)

**Collapse behavior:**
- `useState` for `isExpanded`, initialized to `depth < 2`
- `depth < 2` → initially expanded (levels 0 and 1 visible)
- `depth >= 2` → initially collapsed
- Toggle by clicking the card header area (the row with chevron + text)

**Rendering children:**
- Conditionally render children block based on `isExpanded`
- Simple mount/unmount (no complex height animations)
- Each child rendered as `<MindMapNode node={child} depth={depth + 1} />`

### 3. Update ConceptMap Component

**MODIFY: `03-frontend-dashboard/src/components/ConceptMap.tsx`**

Remove ALL react-d3-tree code:
- Remove `Tree` import from `react-d3-tree`
- Remove `RotateCcw` icon import (Reset View button removed)
- Remove `containerRef`, `translate` state, `treeKey` state
- Remove `useLayoutEffect` for container measurement
- Remove `handleResetView` function
- Remove `renderNode` callback and `nodeStyle` constant
- Remove the `convertToD3Tree` helper function (if present)

Replace with:
- Import `parseConceptMap`, `TreeNode` from `../lib/conceptMapParser`
- Import `MindMapNode` from `./MindMapNode`
- Parse data: `const tree = parseConceptMap(data)`
- Render tree inside scrollable container:
  ```tsx
  <div className="max-h-[80vh] overflow-y-auto glass rounded-lg p-6">
    <MindMapNode node={tree} depth={0} />
  </div>
  ```

Keep existing fallback rendering:
- No data → "No concept map data available" message
- Parse failure (tree is null but data is non-empty) → raw markdown via `MarkdownViewer`

### 4. Remove Unused Files and Dependencies

**DELETE: `03-frontend-dashboard/src/components/ConceptMapContainer.tsx`**
- Unused placeholder component. Remove the file entirely.

**MODIFY: `03-frontend-dashboard/package.json`**
- Remove `react-d3-tree` from dependencies. Run `npm uninstall react-d3-tree` to cleanly remove from both `package.json` and `package-lock.json`.

### 5. Update Tests

**MODIFY: `03-frontend-dashboard/src/components/__tests__/ConceptMap.test.tsx`**
- Remove the `vi.mock('react-d3-tree', ...)` block
- Update `parseConceptMap` import to `from '../../../lib/conceptMapParser'` (or wherever tests import from)
- Update rendering assertions: instead of checking for SVG tree elements, check for card text content
- Test that full text content is visible (no 30-char truncation)

---

## File Summary

| File | Action | Description |
|------|--------|-------------|
| `03-frontend-dashboard/src/lib/conceptMapParser.ts` | CREATE | Extract parser + TreeNode interface from ConceptMap.tsx |
| `03-frontend-dashboard/src/lib/__tests__/conceptMapParser.test.ts` | CREATE | Parser unit tests (moved from ConceptMap tests) |
| `03-frontend-dashboard/src/components/MindMapNode.tsx` | CREATE | Recursive mind map card component |
| `03-frontend-dashboard/src/components/__tests__/MindMapNode.test.tsx` | CREATE | MindMapNode unit tests |
| `03-frontend-dashboard/src/components/ConceptMap.tsx` | MODIFY | Replace react-d3-tree with MindMapNode rendering |
| `03-frontend-dashboard/src/components/__tests__/ConceptMap.test.tsx` | MODIFY | Remove d3 mocks, test card rendering |
| `03-frontend-dashboard/src/components/ConceptMapContainer.tsx` | DELETE | Unused placeholder |
| `03-frontend-dashboard/package.json` | MODIFY | Remove react-d3-tree dependency |

---

## Verification

After implementation, run the frontend test suite:

```bash
cd C:\git_repos\playground\hackathon\03-frontend-dashboard
npm uninstall react-d3-tree
npm test
```

All existing tests must continue to pass (with updated imports/assertions), and all new mind map tests must pass. Visually verify the concept map renders as collapsible cards with full text, depth-coded borders, and smooth expand/collapse animations.

---

## Implementation Notes

**Status:** Complete. All changes implemented exactly as planned, no deviations.

**Test Results:**
- Parser: 5/5 tests pass
- MindMapNode: 9/9 tests pass
- ConceptMap component: 5/5 tests pass
- Full suite: 105/106 pass (1 pre-existing failure in edge-cases.test.tsx unrelated to this section)

**Code Review:** PASS - No fixes required. Minor non-blocking observations (a11y, array keys) documented in `implementation/code_review/section-02-review.md`.
