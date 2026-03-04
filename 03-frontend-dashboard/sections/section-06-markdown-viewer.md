# Section 06: Markdown Viewer Component

## Overview

This section implements the **MarkdownViewer** component, which wraps `react-markdown` to render the executive summary artifact with proper typography and glassmorphism styling. Used in the Summary tab of the dashboard.

## Dependencies

- section-05-dashboard-sources (DashboardPage wiring with tab navigation)
- section-01-setup (`react-markdown`, `remark-gfm`, `@tailwindcss/typography` installed)

## Tests (`src/components/__tests__/MarkdownViewer.test.tsx`)

```
# Test: renders markdown string as HTML
# Test: renders headings, lists, code blocks
# Test: renders tables (via remark-gfm)
# Test: applies prose-invert classes for dark theme
# Test: handles empty/null markdown gracefully
```

## Implementation

### File: `src/components/MarkdownViewer.tsx`

Rewrote from Lovable scaffold (which used `dangerouslySetInnerHTML`) to use `react-markdown` with `remarkGfm` plugin.

**Component interface:**
```typescript
interface MarkdownViewerProps {
  content: string;
}
```

**Configuration:**
- `react-markdown` with `remarkPlugins: [remarkGfm]`
- Tailwind prose classes: `prose prose-invert max-w-none overflow-auto`

**Custom component overrides:**
- `pre`: Glassmorphism container for fenced code blocks (handles both language-tagged and untagged blocks)
- `code`: Inline code styling only (block code handled by `pre`)
- `table`: Glass borders with overflow wrapper
- `tr`: Alternating row backgrounds via `even:bg-glass-highlight/10`
- `th`/`td`: Consistent padding and border styling
- `a`: Primary color with new tab behavior (`target="_blank" rel="noopener noreferrer"`)

**Deviation from plan:** Code block detection uses `pre` override instead of checking `className?.includes('language-')` on `code`, per code review finding that untagged fenced blocks were missed.

**Empty state:** Shows "No summary was generated for this research." when content is empty/whitespace.

### File: `tailwind.config.ts`

Added `@tailwindcss/typography` plugin alongside existing `tailwindcss-animate`.

### File: `src/pages/DashboardPage.tsx`

Wired MarkdownViewer into Summary tab:
```typescript
<MarkdownViewer content={(researchState.artifacts.summary as string) || ""} />
```

### Files Created/Modified

- `src/components/MarkdownViewer.tsx` (modified - replaced dangerouslySetInnerHTML with react-markdown)
- `src/components/__tests__/MarkdownViewer.test.tsx` (created - 5 tests)
- `tailwind.config.ts` (modified - added typography plugin)
- `src/pages/DashboardPage.tsx` (modified - wired MarkdownViewer into Summary tab)

## Definition of Done

- [x] MarkdownViewer component created with react-markdown
- [x] react-markdown renders with remark-gfm plugin
- [x] prose prose-invert classes applied for dark theme
- [x] Code blocks styled with glassmorphism (via pre override)
- [x] Tables render with glass borders and alternating row backgrounds
- [x] Links open in new tab
- [x] Empty content shows placeholder
- [x] All 62 tests passing (5 new MarkdownViewer tests)
