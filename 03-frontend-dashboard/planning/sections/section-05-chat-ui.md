# Section 05: Chat UI — ChatPanel Component and Tab Integration

## Overview

This section builds the ChatPanel component and integrates it as a new "Chat" tab in the dashboard. The ChatPanel provides a NotebookLM-style Q&A interface with suggestion chips, streaming message display, source citations, and smart scroll-to-bottom behavior. Chat state is hoisted to DashboardPage level so it persists across tab switches.

**Dependency:** Requires section-04 (chat types and useChat hook) to be complete.

---

## Architecture Context

- **`03-frontend-dashboard/src/hooks/useChat.ts`** (from section-04) exports `useChat(sessionId: string | null)` returning `{ messages, isStreaming, error, sendMessage, reset }`. The `ChatState` interface has `messages: ChatMessage[]`, `isStreaming: boolean`, `error: string | null`.
- **`03-frontend-dashboard/src/types/research.ts`** has `ChatMessage` with `role`, `content`, and optional `sources` (array of `{title, url}`).
- **`03-frontend-dashboard/src/components/TabNavigation.tsx`** defines `TabId = "sources" | "summary" | "concept-map" | "flashcards"` and a `tabs` array. Needs `"chat"` added.
- **`03-frontend-dashboard/src/pages/DashboardPage.tsx`** renders tab content inside `<div key={activeTab} className="animate-fade-in">`. This keyed div forces remount on tab switch — chat must render OUTSIDE this div to preserve state.
- **`03-frontend-dashboard/src/pages/DashboardPage.tsx`** receives data from React Router `location.state` as `PreparedRouterState`, which includes `sessionId: string | null` and `topic: string`.
- **`03-frontend-dashboard/src/components/MarkdownViewer.tsx`** renders markdown content. Used for assistant message rendering.
- The project uses a glass dark theme with Tailwind CSS. Key utilities: `.glass` (backdrop-blur card), `bg-primary/15` (tinted background), `text-muted-foreground` (subdued text).
- **`lucide-react`** is the icon library. Available icons include `Send`, `MessageCircle`, `ExternalLink`, etc.

---

## Tests (Write First)

### ChatPanel Component Tests

**File: `03-frontend-dashboard/src/components/__tests__/ChatPanel.test.tsx`** (create new)

```typescript
// Test: renders suggestion chips in empty state
// - Render ChatPanel with empty messages array, sessionId="test", topic="AI"
// - Assert at least 3 suggestion chip buttons are visible

// Test: suggestion chips include the topic name
// - Render with topic="Machine Learning"
// - Assert at least one chip contains "Machine Learning"

// Test: clicking a suggestion chip calls sendMessage with chip text
// - Render with empty messages and a mock sendMessage
// - Click a suggestion chip
// - Assert sendMessage was called with the chip's text content

// Test: renders "session expired" message when sessionId is null
// - Render with sessionId=null
// - Assert text about starting a research session is visible
// - Assert input is disabled

// Test: renders user messages with right-aligned styling
// - Render with messages containing a user message
// - Assert the user message text appears
// - Assert it has right-alignment classes or styling

// Test: renders assistant messages with MarkdownViewer
// - Render with messages containing an assistant message with markdown content
// - Assert the content is rendered (MarkdownViewer is used)

// Test: renders source citation chips below assistant messages
// - Render with an assistant message that has sources: [{ title: "Source A", url: "https://..." }]
// - Assert "Source A" text appears as a clickable chip

// Test: input is disabled during streaming
// - Render with isStreaming=true
// - Assert the input element is disabled

// Test: send button is disabled when input is empty
// - Render with empty input
// - Assert the send button is disabled

// Test: shows thinking indicator when streaming but no content yet
// - Render with isStreaming=true and last assistant message has empty content
// - Assert a thinking/loading indicator is visible

// Test: shows conversation length notice when messages >= 40
// - Render with 40+ messages
// - Assert a notice about conversation length is visible
```

### Tab Integration Tests

**File: `03-frontend-dashboard/src/components/__tests__/TabNavigation.test.tsx`** (modify existing)

Add to existing test file:

```typescript
// Test: renders Chat tab button
// - Render TabNavigation with activeTab="sources"
// - Assert a button/tab with text "Chat" is visible

// Test: Chat tab button triggers onChange with "chat"
// - Render with onChange mock
// - Click the Chat tab
// - Assert onChange was called with "chat"
```

---

## Implementation Details

### 1. Add Chat Tab to TabNavigation

**MODIFY: `03-frontend-dashboard/src/components/TabNavigation.tsx`**

Update the `TabId` type to include `"chat"`:

```typescript
export type TabId = "sources" | "summary" | "concept-map" | "flashcards" | "chat";
```

Add the chat tab to the `tabs` array (at the end):

```typescript
const tabs = [
  { id: "sources" as TabId, label: "Sources" },
  { id: "summary" as TabId, label: "Summary" },
  { id: "concept-map" as TabId, label: "Concept Map" },
  { id: "flashcards" as TabId, label: "Flashcards" },
  { id: "chat" as TabId, label: "Chat" },
];
```

### 2. Create ChatPanel Component

**CREATE: `03-frontend-dashboard/src/components/ChatPanel.tsx`**

**Props interface:**
```typescript
interface ChatPanelProps {
  sessionId: string | null;
  topic: string;
  messages: ChatMessage[];
  isStreaming: boolean;
  error: string | null;
  sendMessage: (message: string) => void;
}
```

Chat state is received as props (hoisted to DashboardPage). This allows the state to persist across tab switches.

**Component structure (flex column, full height):**

```
┌─────────────────────────────┐
│  Message Area (flex-1)      │
│  - Empty state OR messages  │
│  - Smart scroll-to-bottom   │
│                             │
├─────────────────────────────┤
│  Conversation length notice │ (conditional, >= 40 messages)
├─────────────────────────────┤
│  Input Area (sticky bottom) │
│  [Text input] [Send button] │
└─────────────────────────────┘
```

#### Null Session State

When `sessionId` is null:
- Show centered message: "Start a research session to use chat"
- Include a subtle link/text directing user back to the search page
- Input area is present but disabled

#### Empty State (messages.length === 0 and sessionId is not null)

- Centered icon (e.g., `MessageCircle` from lucide-react) and heading: "Ask about your research"
- 3-4 hardcoded suggestion chip templates with topic interpolation:
  - `"What are the key takeaways about {topic}?"`
  - `"Compare the main approaches discussed"`
  - `"What should I learn first about {topic}?"`
  - `"What are the practical applications?"`
- Chips are styled as glass pill buttons with border
- Clicking a chip calls `sendMessage(chipText)`

#### Message Rendering

**User messages:**
- Right-aligned (`ml-auto`)
- Background: `bg-primary/15` with rounded corners
- Max width ~80% of container
- Display message `content` as plain text

**Assistant messages:**
- Left-aligned
- Background: glass styling (semi-transparent with backdrop-blur)
- Max width ~80% of container
- Content rendered with the existing `MarkdownViewer` component
- Source citations rendered below the message content

**Source citation chips:**
- Below assistant messages when `message.sources` exists and is non-empty
- Horizontal flex-wrap of pill-shaped chips
- Each chip shows source title, styled as small glass pills with border
- Clicking opens URL in new tab: `window.open(url, '_blank')`
- Use `ExternalLink` icon from lucide-react (small, next to title)

#### Thinking / Streaming Indicators

**Thinking indicator** (between SEND_MESSAGE and first STREAM_DELTA):
- When `isStreaming` is true AND the last assistant message has empty `content`
- Show three pulsing dots animation as a placeholder in the assistant message area
- CSS animation: three small circles with staggered `animation-delay` using `animate-pulse` or custom keyframes

**Streaming cursor:**
- When `isStreaming` is true AND the last assistant message has non-empty `content`
- Show a pulsing block cursor (`▊`) after the message text
- Use `animate-pulse` on the cursor character

#### Smart Scroll-to-Bottom

- Use a `ref` on the message container (`messagesEndRef`)
- Track scroll position with a scroll event listener
- Only auto-scroll when new content arrives IF the user is within 100px of the bottom
- Implementation: `const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100`
- On new message or streaming delta: if `isNearBottom`, scroll `messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })`

#### Conversation Length Notice

- When `messages.length >= 40` (20 user-assistant pairs)
- Show a subtle notice above the input area: "This is a long conversation. Consider starting a new one for best results."
- Styled as muted text, not blocking — input remains functional

#### Input Area

- Text input with placeholder: `"Ask a question about {topic}..."`
- `Send` icon button (from lucide-react) — disabled when input is empty OR `isStreaming` is true
- Form wraps input + button; submit on Enter key or button click
- On submit: call `sendMessage(inputValue)`, clear the input
- Input is disabled during streaming

#### Error Display

- When `error` is not null, show an error banner above the input area
- Styled with subtle red/destructive tint
- Text content is the error message
- For "Session expired" error, include a note about starting a new research session

### 3. Integrate into DashboardPage

**MODIFY: `03-frontend-dashboard/src/pages/DashboardPage.tsx`**

This is the most architecturally critical part. The existing code has:

```tsx
<div key={activeTab} className="animate-fade-in">
  {/* tab content rendered here */}
</div>
```

The `key={activeTab}` forces React to unmount and remount the entire subtree on tab switch. Chat state would be destroyed. The fix:

1. **Import** `ChatPanel` and `useChat` at the top of the file
2. **Initialize** `useChat` at the DashboardPage level:
   ```tsx
   const chatState = useChat(researchState.sessionId);
   ```
   where `researchState` is the `PreparedRouterState` from `location.state`.
3. **Render ChatPanel OUTSIDE the keyed div** for state preservation:
   ```tsx
   {/* Other tabs inside the keyed div */}
   <div key={activeTab} className="animate-fade-in">
     {activeTab === "sources" && <SourcesTab ... />}
     {activeTab === "summary" && <SummaryContent ... />}
     {activeTab === "concept-map" && <ConceptMap ... />}
     {activeTab === "flashcards" && <Flashcards ... />}
   </div>

   {/* Chat outside the keyed div — state persists across tab switches */}
   {activeTab === "chat" && (
     <ChatPanel
       sessionId={researchState.sessionId}
       topic={researchState.topic}
       messages={chatState.messages}
       isStreaming={chatState.isStreaming}
       error={chatState.error}
       sendMessage={chatState.sendMessage}
     />
   )}
   ```

   Note: Even though ChatPanel unmounts when switching away from the chat tab, the `useChat` hook state lives in DashboardPage's `useReducer`, so it persists. The hook itself (with its AbortController, etc.) stays alive as long as DashboardPage is mounted.

4. **sessionId and topic** come from `(location.state as PreparedRouterState)`. The `PreparedRouterState` interface includes `sessionId: string | null` and the topic is in the research state.

---

## File Summary

| File | Action | Description |
|------|--------|-------------|
| `03-frontend-dashboard/src/components/ChatPanel.tsx` | CREATE | Chat UI component with messages, suggestions, streaming, Link to /search |
| `03-frontend-dashboard/src/components/__tests__/ChatPanel.test.tsx` | CREATE | 11 ChatPanel component tests (wrapped in MemoryRouter) |
| `03-frontend-dashboard/src/components/TabNavigation.tsx` | MODIFY | Add "chat" to TabId type and tabs array |
| `03-frontend-dashboard/src/components/__tests__/TabNavigation.test.tsx` | CREATE | 2 Chat tab rendering/click tests (new file, not modify) |
| `03-frontend-dashboard/src/pages/DashboardPage.tsx` | MODIFY | Import ChatPanel/useChat, hoist chat state, render ChatPanel outside keyed div |

---

## Implementation Notes (Post-Implementation)

### Deviations from Plan

1. **Source citation chips use `<a>` tags** instead of `window.open()` — more accessible, supports middle-click/ctrl+click
2. **Null session state includes "Go to Search" link** — added per code review feedback (uses react-router-dom `Link` component)
3. **`scrollIntoView` guard** — added `messagesEndRef.current?.scrollIntoView` existence check for jsdom compatibility in tests
4. **TabNavigation test file** — created as a new file (plan said "modify existing" but no prior test file existed)

### Test Results

- 11 ChatPanel tests: all pass
- 2 TabNavigation tests: all pass
- All existing tests: pass (1 pre-existing failure in edge-cases.test.tsx unrelated to this section)

## Verification

After implementation, run the frontend test suite:

```bash
cd C:\git_repos\playground\hackathon\03-frontend-dashboard
npm test
```

All existing tests must continue to pass, and all new ChatPanel and tab integration tests must pass.

For manual verification:
1. Start the API server and run a research query
2. Navigate to the Chat tab
3. Verify suggestion chips appear with the research topic
4. Click a suggestion chip or type a question
5. Verify streaming response appears with thinking indicator, then text, then source citations
6. Switch to another tab and back — verify chat history persists
7. Test with sessionId=null (navigate directly to dashboard without research) — verify disabled state with "Go to Search" link
