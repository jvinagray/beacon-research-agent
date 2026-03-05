# 03 - Frontend Dashboard

## Overview
Lovable-generated React application that provides the user interface for Beacon. Displays a search input, real-time progress feed during research, and an interactive knowledge base dashboard with source intelligence cards and artifact tabs.

## Requirements Reference
See `../BEACON_SPEC.md` — Frontend Pages section. This split covers both pages (Home/Search and Knowledge Base Dashboard).

## Dependencies on 02-api-streaming
- **SSE endpoint**: `POST /api/research` returns a Server-Sent Events stream
- **Export endpoint**: `GET /api/export/{session_id}?format=markdown`
- **Event schema**: Must consume all SSE event types (status, sources_found, source_evaluated, artifact, error, complete)

## What This Split Produces

### Page 1: Home / Search
- Clean centered input: "What do you want to learn about?"
- Depth selector: Quick / Standard / Deep (radio group or segmented control)
- "Research" button (primary CTA)
- Below input: real-time progress feed that appears during research
  - Animated status messages ("Searching...", "Evaluating source 3 of 20...")
  - Source cards appearing one by one as `source_evaluated` events arrive
  - Smooth transitions as content fills in

### Page 2: Knowledge Base Dashboard
- Tab navigation: **Sources** | **Summary** | **Concept Map** | **Flashcards**
- Export button (top right) — triggers Markdown download via export endpoint

**Sources tab** (default view):
- Grid or list of source cards, each showing:
  - Title (clickable link to original URL)
  - Learning efficiency badge (e.g., "9/10 — High efficiency")
  - Content type tag (tutorial, paper, docs, etc.)
  - Time estimate ("~5 min read")
  - Key insight (1-2 sentence preview)
  - Expandable for full details (coverage, recency)
- Sorted by learning efficiency score (highest first)

**Summary tab:**
- Rendered Markdown of the executive summary
- Clean typography, headings, bullet points

**Concept Map tab:**
- Structured outline / tree view of concepts
- Indented list with collapsible sections (MVP)
- Interactive graph visualization (stretch goal)

**Flashcards tab:**
- Card-flip UI or Q&A list
- "Question" on front, "Answer" on back
- Simple click/tap to flip

### Real-time SSE Integration
The frontend must:
1. Send POST to `/api/research` with topic + depth
2. Open an EventSource-compatible connection to consume SSE
3. Parse each event and update UI state incrementally
4. Handle errors gracefully (show error message, allow retry)
5. Store the session_id from the `complete` event for export

**Note**: Standard `EventSource` API only supports GET. For POST, need either:
- `fetch` with ReadableStream + manual SSE parsing
- A library like `@microsoft/fetch-event-source`

## Key Decisions for /deep-plan
1. **Lovable prompting strategy**: How to describe the UI to Lovable so it generates a good base. What to prompt first, what to iterate on.
2. **SSE consumption in React**: Library choice (`@microsoft/fetch-event-source` vs manual), state management for streaming data, when to re-render.
3. **Progressive UI**: How to transition from search → progress → results smoothly. Single page with state transitions vs separate routes.
4. **Source card design**: Layout, information hierarchy, expand/collapse behavior. The "wow factor" depends on these cards looking great.
5. **Responsive design**: Should it work on mobile? (Probably desktop-only for demo, but Lovable may generate responsive by default)
6. **Dark/light theme**: Lovable default or custom? Might affect demo aesthetics.

## Technology Stack
- **Lovable** generates: React + TypeScript + Tailwind CSS (Lovable's default stack)
- Manual additions may include:
  - `@microsoft/fetch-event-source` or similar for SSE POST support
  - Markdown rendering library (`react-markdown` or similar)
  - Minimal custom CSS/Tailwind overrides

## Lovable Workflow
1. Prompt Lovable with Page 1 (search + depth selector + progress feed)
2. Prompt Lovable with Page 2 (dashboard with tabs, source cards)
3. Manually add SSE integration code if Lovable can't handle it
4. Iterate on visual design and interactions

## Interface Contract (from 02-api-streaming)
```typescript
// SSE Event types the frontend must handle:
type SSEEvent =
  | { type: "status"; message: string }
  | { type: "sources_found"; count: number; sources: Source[] }
  | { type: "source_evaluated"; index: number; total: number; source: EvaluatedSource }
  | { type: "artifact"; artifact_type: "summary" | "resources" | "concept_map" | "flashcards"; data: string | object }
  | { type: "error"; message: string; recoverable: boolean }
  | { type: "complete"; session_id: string }

// Source with intelligence signals:
type EvaluatedSource = {
  url: string;
  title: string;
  learning_efficiency_score: number; // 1-10
  content_type: "tutorial" | "paper" | "docs" | "opinion" | "video";
  time_estimate_minutes: number;
  recency: string | null;
  key_insight: string;
  coverage: string[];
}
```

## Interview Context
- Frontend is **mostly Lovable-generated** with minimal custom JS
- The **demo wow factor** is source intelligence — the source cards with learning efficiency scores need to look impressive
- User expects to iterate via Lovable prompting, not manual React coding
- Local development only — frontend can run on Lovable's dev server or built static
