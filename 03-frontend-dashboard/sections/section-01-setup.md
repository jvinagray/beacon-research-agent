# Section 01: Project Setup and Configuration

## Overview

This section covers exporting the UI scaffolding from Lovable, installing additional dependencies, and configuring the project environment for manual development. After this section, you'll have a working Vite + React + TypeScript project with all required dependencies and routing configured.

## Background Context

Beacon is an AI-powered research agent with a FastAPI backend that streams research progress via Server-Sent Events (SSE). The frontend is a React dashboard built in two phases:

1. **Phase 1 (Lovable):** Generate UI scaffolding for the search page and dashboard page using Lovable, an AI code generator
2. **Phase 2+ (Manual):** Export the Lovable code and add SSE integration, state management, and data wiring

Lovable excels at layout and styling but cannot handle SSE streaming or complex state management. This section focuses on Phase 1-2 from the implementation plan.

## Dependencies on Other Sections

None. This is the first section and must be completed before any other work.

## Blocks

All other sections (02-09) depend on this setup being complete.

## Tests

No automated tests for this section. Verification is manual: the project must build successfully with `npm run dev` and display the Lovable-generated pages at the configured routes.

## Implementation

### Step 1: Generate UI in Lovable

Use Lovable (lovable.dev or similar AI code generator) to create the visual scaffolding. Provide the following two prompts:

**Lovable Prompt 1: Search Page**

```
Build a research search page with a dark theme and glassmorphism aesthetic.

Layout:
- Full-height centered layout with the app name "Beacon" at the top
- Large centered search input: placeholder "What do you want to learn about?"
- Below the input: a segmented control with three options: Quick, Standard, Deep
  - Each option shows a subtitle: Quick (~2 min), Standard (~5 min), Deep (~8 min)
- Below that: a large "Research" button (primary CTA, gradient or glowing accent)
- Below the button: an empty container (id="progress-feed") that will later show streaming results

Design:
- Dark background (slate-900 or similar)
- Glassmorphism cards with backdrop-blur and subtle borders
- The search input should have a frosted glass look
- Use Inter or system font
- ShadCN UI components where appropriate
- The segmented control should visually indicate the selected depth

Components needed:
- SearchInput component
- DepthSelector component (segmented control)
- ProgressFeed component (empty placeholder for now)
- SourceCard component (for later use in the progress feed):
  - Shows: title (link), score badge (0-10 with glow), content type tag, time estimate, key insight text
  - Frosted glass background
  - Score badge should glow green for 8-10, yellow for 5-7, red for 0-4
  - Expandable section for additional details
  - Support a "failed evaluation" state that shows a dimmed card with warning badge

Use React Router. This page is at /search route. Add a redirect from / to /search.
```

**Lovable Prompt 2: Dashboard Page**

```
Add a Knowledge Base Dashboard page at /dashboard route. Same dark glassmorphism theme.

Layout:
- Header bar with "Beacon" logo/name on left, "Export" button on right
- Below header: tab navigation with 4 tabs: Sources, Summary, Concept Map, Flashcards
- Tab content area below

Sources tab (default):
- Grid of SourceCard components (reuse from search page)
- Cards sorted by learning efficiency score (highest first)
- Show a summary bar: "{N} sources evaluated | Research: {topic}"

Summary tab:
- Rendered markdown content area
- Clean typography with proper heading hierarchy
- Frosted glass container

Concept Map tab:
- Large container for a tree visualization (placeholder div for now)
- Will later use react-d3-tree

Flashcards tab:
- Grid of flashcard components with 3D flip animation
- Each card has a front (question) and back (answer)
- Click to flip with CSS 3D perspective transform
- Cards should have the same glassmorphism styling
- Show card count: "Card 1 of {N}"

Components needed:
- DashboardHeader (with export button)
- TabNavigation (Sources | Summary | Concept Map | Flashcards)
- FlashCard component with 3D flip CSS
- MarkdownViewer component (wrapper for markdown rendering area)
- ConceptMapContainer (placeholder)

The Export button should be styled as a secondary/outline button with a download icon.
```

**Important Note:** Lovable's output may differ from the exact component structure described in the full plan. Phase 3+ (manual coding) may require refactoring Lovable's component boundaries, prop interfaces, and file organization. Budget time for this adaptation.

Iterate on the visual design in Lovable until:
- Source cards look polished with proper glassmorphism effects
- Score badges have visible glow effects (green/yellow/red)
- Flashcards have smooth 3D flip animations
- The overall dark theme aesthetic is cohesive

### Step 2: Export from Lovable

1. In Lovable, use the export feature to download the complete project as a zip file
2. Extract the zip contents into `C:\git_repos\playground\hackathon\03-frontend-dashboard\`
3. Verify the exported structure includes:
   - `package.json`
   - `src/` directory with components
   - `vite.config.ts`
   - `tsconfig.json`
   - `index.html`

### Step 3: Install Additional Dependencies

Lovable provides React + TypeScript + Tailwind CSS + Vite + ShadCN UI by default. You need to add these libraries for manual development:

```bash
cd C:\git_repos\playground\hackathon\03-frontend-dashboard
npm install @microsoft/fetch-event-source react-markdown remark-gfm @tailwindcss/typography react-d3-tree
```

**Dependency purposes:**
- `@microsoft/fetch-event-source` — SSE client with POST support (required for `/api/research` endpoint)
- `react-markdown` — Render markdown artifacts (summary tab)
- `remark-gfm` — GitHub Flavored Markdown plugin (tables, strikethrough)
- `@tailwindcss/typography` — Prose classes for markdown content
- `react-d3-tree` — Concept map visualization

### Step 4: Configure Environment Variables

Create `.env` file in the project root:

```
VITE_API_URL=http://localhost:8000
```

Create `.env.example` as a template for other developers:

```
VITE_API_URL=http://localhost:8000
```

### Step 5: Create API Configuration Module

Create `src/config.ts`:

```typescript
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
```

This module exports a single constant that all API calls will use. The backend must be running at this URL.

### Step 6: Verify Router Configuration

Inspect `src/App.tsx` (or wherever Lovable placed the router configuration). Ensure these routes exist:

- `/` — redirects to `/search`
- `/search` — search page
- `/dashboard` — dashboard page
- `*` — catch-all 404, redirects to `/search`

If Lovable generated a different routing structure, refactor to match. Example using React Router v6:

```typescript
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import SearchPage from './pages/SearchPage';
import DashboardPage from './pages/DashboardPage';

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

### Step 7: Verify Build

Run the development server:

```bash
npm run dev
```

Expected behavior:
- Vite dev server starts without errors
- Navigate to `http://localhost:5173`
- `/` redirects to `/search`
- Search page displays with search input, depth selector, and Research button
- Manually navigate to `/dashboard` — dashboard displays with tabs
- Manually navigate to `/invalid-route` — redirects to `/search`

### Step 8: Commit Baseline

Once the build succeeds and routes work correctly, commit the Lovable-generated baseline.

## Expected Directory Structure (Post-Setup)

```
03-frontend-dashboard/
├── .env                        # VITE_API_URL=http://localhost:8000
├── .env.example                # Template for env vars
├── package.json                # Dependencies (Vite scaffold + manual additions)
├── tsconfig.json
├── tsconfig.app.json           # App-specific TS config with @/ alias
├── vite.config.ts              # Vite + React + Tailwind CSS plugin
├── index.html
├── src/
│   ├── main.tsx                # App entry point
│   ├── App.tsx                 # Router setup (react-router-dom v6)
│   ├── config.ts               # API_BASE_URL from env
│   ├── vite-env.d.ts           # Vite client type reference
│   ├── index.css               # Tailwind v4 + glassmorphism utilities
│   ├── lib/
│   │   └── utils.ts            # cn() helper (clsx + tailwind-merge)
│   ├── pages/
│   │   ├── SearchPage.tsx      # /search route
│   │   └── DashboardPage.tsx   # /dashboard route
│   └── components/
│       ├── SearchInput.tsx
│       ├── DepthSelector.tsx
│       ├── ProgressFeed.tsx
│       ├── SourceCard.tsx
│       ├── DashboardHeader.tsx
│       ├── TabNavigation.tsx
│       ├── FlashCard.tsx
│       ├── MarkdownViewer.tsx
│       └── ConceptMap.tsx
```

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `.env` | Create | Store VITE_API_URL environment variable |
| `.env.example` | Create | Template for environment configuration |
| `src/config.ts` | Create | Export API_BASE_URL constant |
| `src/App.tsx` | Verify/Modify | Ensure correct routing (/, /search, /dashboard, *) |
| `package.json` | Modify | Add 5 manual dependencies via npm install |

## Definition of Done

- [x] Lovable UI generated for both pages (search and dashboard)
- [x] Code exported from Lovable and extracted to `03-frontend-dashboard/`
- [x] Additional dependencies installed (@microsoft/fetch-event-source, react-markdown, remark-gfm, react-d3-tree)
- [x] lovable-tagger dev dependency removed (not needed outside Lovable)
- [x] `.env` created (gitignored) and `.env.example` tracked, both with VITE_API_URL
- [x] `src/config.ts` created with API_BASE_URL constant
- [x] Router configured with `/`, `/search`, `/dashboard`, and `*` (NotFound)
- [x] `vite build` runs without errors
- [x] ShadCN UI component library included (full set from Lovable)
- [x] Tailwind v3 with PostCSS, custom glassmorphism CSS variables
- [x] FlashCard 3D flip with inline perspective/backface-visibility styles
- [x] Score badge glow effects (green/yellow/red via CSS custom properties)

## Deviations from Plan

- **Catch-all route:** Lovable generated a NotFound page instead of redirecting to `/search`. Kept as-is since it provides better UX.
- **Vite config:** Removed `lovable-tagger` plugin, simplified to standard `@vitejs/plugin-react-swc`.
- **Tailwind v3:** Lovable uses Tailwind v3 with `tailwind.config.ts` and PostCSS (not Tailwind v4 CSS-first).
