# Section 07: Concept Map Visualization

## Overview

This section implements the Concept Map tab in the dashboard. The concept map artifact from the backend is a markdown-formatted indented bullet list with **bold** top-level concepts. This section creates a parser that converts that format into a tree data structure, then renders it using `react-d3-tree` with interactive features (zoom, pan, collapsible nodes). If parsing fails, the component falls back to rendering the raw markdown.

## Dependencies

- Section 05 (dashboard-sources): dashboard page and tab structure must exist
- Section 06 (markdown-viewer): MarkdownViewer used as fallback renderer
- Section 01 (setup): `react-d3-tree` must be installed

Can be implemented in parallel with section-06 and section-08.

## Background: Concept Map Format

The backend generates concept maps as indented bullet points with `**bold**` for top-level concepts:

```
- **Core Concept A**
  - Sub-concept A1: Brief description
    - Detail: Explanation
- **Core Concept B**
  - Sub-concept B1
```

This is LLM-generated content, so format may vary. The parser must be defensive.

## Tests (`src/components/__tests__/ConceptMap.test.tsx`)

10 tests total (7 parser + 3 component):

```
# Parser tests:
# Test: parses indented bullet list into tree data structure
# Test: handles bold top-level concepts (**Concept**)
# Test: handles nested indentation (2-space)
# Test: handles nested indentation (4-space)
# Test: returns null for empty input
# Test: wraps multiple top-level nodes in a root
# Test: handles missing bold formatting
# Component tests:
# Test: falls back to MarkdownViewer when parsing fails
# Test: handles empty concept map data
# Test: renders tree with correct node labels (via mock)
```

## Implementation

### File: `src/components/ConceptMap.tsx`

**Types:**
```typescript
interface ConceptMapProps {
  data: string; // Markdown-formatted concept map artifact
}

interface TreeNode {
  name: string;
  children?: TreeNode[];
}
```

### Parsing Logic

**Function:** `parseConceptMap(markdown: string): TreeNode | null`

Algorithm:
1. Split markdown into lines, filter empty lines
2. For each line:
   - Calculate indentation level (count leading spaces, divide by 2)
   - Strip `- ` prefix, strip `**` bold markers, trim
   - Extract clean text as node name
3. Build tree using a stack to track current parent at each indentation level
4. Return root node (or wrap in a "Concept Map" root if multiple top-level nodes)
5. Return `null` if parsing fails or tree is empty

**Critical:** Support both 2-space and 4-space indentation. If a line doesn't start with `- ` (after trimming leading spaces), skip it.

### Fallback Logic

```typescript
if (!data || parseFailed) {
  return (
    <div>
      <p className="text-amber-400 mb-4">
        Could not visualize concept map. Showing raw data:
      </p>
      <MarkdownViewer content={data || 'No concept map data available.'} />
    </div>
  );
}
```

### react-d3-tree Configuration

- Container: `w-full h-[600px]` with glassmorphism background (`glass` class)
- `orientation="vertical"`, `pathFunc="step"`
- `translate={{ x: containerWidth/2, y: 50 }}` (center horizontally, via `useLayoutEffect`)
- `collapsible={true}`, `zoom={0.8}`
- Node styles: custom `renderCustomNodeElement` with slate colors (circle fill `#1e293b`, stroke `#475569`, text fill `#e2e8f0`)
- Link styles: CSS class `.concept-map-link` in `src/index.css` (`stroke: #475569`, `stroke-width: 1.5`)
  - Note: `styles` prop was removed in react-d3-tree v3; using `pathClassFunc` + CSS instead

### Integration with Dashboard

In DashboardPage (section-05):
```typescript
{activeTab === 'concept_map' && (
  <ConceptMap data={artifacts.concept_map as string || ''} />
)}
```

## Edge Cases

- **Empty data:** Show fallback with "No concept map data available."
- **Malformed markdown:** Parser returns null, fallback renders raw markdown
- **Very large trees:** react-d3-tree handles with zoom/pan
- **Single root node:** Renders correctly as single node
- **Missing bold formatting:** Parser still works (bold is convention, not required)

## Files Created/Modified

- `src/components/ConceptMap.tsx` (new) - Component with parser and tree rendering
- `src/components/__tests__/ConceptMap.test.tsx` (new) - 10 tests
- `src/pages/DashboardPage.tsx` (modified) - Integrated ConceptMap in concept-map tab
- `src/index.css` (modified) - Added `.concept-map-link` CSS class

## Definition of Done

- [x] ConceptMap component created with parser and tree rendering
- [x] Parser handles indented bullet lists with bold concepts
- [x] Fallback to MarkdownViewer on parse failure
- [x] Dark theme styling for react-d3-tree (nodes via renderCustomNodeElement, links via CSS)
- [x] Zoom, pan, and collapse/expand work
- [x] All tests passing (10/10)
