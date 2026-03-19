import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import DrillDownPanel from "../DrillDownPanel";
import type { DrillDownSession } from "@/hooks/useDrillDown";
import type { EvaluatedSource } from "@/types/research";

vi.mock("../MarkdownViewer", () => ({
  default: ({ content }: { content: string }) => (
    <div data-testid="markdown-viewer">{content}</div>
  ),
}));

const mockSources: EvaluatedSource[] = [
  {
    url: "https://example.com",
    title: "Test Source",
    snippet: "snippet",
    signals: {
      learning_efficiency_score: 8,
      content_type: "tutorial",
      time_estimate_minutes: 10,
      recency: "2024",
      key_insight: "insight",
      coverage: ["test"],
      evaluation_failed: false,
    },
    deep_read_content: null,
    extraction_method: null,
  },
];

function makeSession(overrides: Partial<DrillDownSession> = {}): DrillDownSession {
  return {
    id: "session-1",
    concept: "Test concept",
    content: "Test content",
    isStreaming: false,
    parentId: null,
    depth: 0,
    ...overrides,
  };
}

describe("DrillDownPanel", () => {
  it("renders accordion items for each top-level session", () => {
    const sessions = [
      makeSession({ id: "s1", concept: "Concept A" }),
      makeSession({ id: "s2", concept: "Concept B" }),
    ];

    render(
      <DrillDownPanel
        sessions={sessions}
        sources={mockSources}
        onDrillDown={vi.fn()}
      />
    );

    expect(screen.getByText("Concept A")).toBeInTheDocument();
    expect(screen.getByText("Concept B")).toBeInTheDocument();
  });

  it("shows concept text as accordion trigger", () => {
    const sessions = [makeSession({ concept: "Neural Networks" })];

    render(
      <DrillDownPanel
        sessions={sessions}
        sources={mockSources}
        onDrillDown={vi.fn()}
      />
    );

    expect(screen.getByText("Neural Networks")).toBeInTheDocument();
  });

  it("shows pipe cursor for streaming sessions", () => {
    const sessions = [makeSession({ isStreaming: true, concept: "Streaming" })];

    const { container } = render(
      <DrillDownPanel
        sessions={sessions}
        sources={mockSources}
        onDrillDown={vi.fn()}
      />
    );

    const pulseElement = container.querySelector(".animate-pulse");
    expect(pulseElement).toBeInTheDocument();
  });

  it("shows 'Maximum depth reached' message at depth >= 2", () => {
    const sessions = [makeSession({ depth: 2, concept: "Deep concept" })];

    render(
      <DrillDownPanel
        sessions={sessions}
        sources={mockSources}
        onDrillDown={vi.fn()}
      />
    );

    // Click the accordion trigger button to open
    const trigger = screen.getByRole("button", { name: /deep concept/i });
    fireEvent.click(trigger);

    expect(
      screen.getByText(/maximum depth reached/i)
    ).toBeInTheDocument();
  });

  it("returns null when no top-level sessions", () => {
    const sessions = [makeSession({ parentId: "orphan-parent" })];

    const { container } = render(
      <DrillDownPanel
        sessions={sessions}
        sources={mockSources}
        onDrillDown={vi.fn()}
      />
    );

    // Should render nothing
    expect(container.firstChild).toBeNull();
  });

  it("nested sessions render as child accordions when parent is opened", () => {
    const sessions = [
      makeSession({ id: "parent", concept: "Parent concept" }),
      makeSession({
        id: "child",
        concept: "Child concept",
        parentId: "parent",
        depth: 1,
      }),
    ];

    render(
      <DrillDownPanel
        sessions={sessions}
        sources={mockSources}
        onDrillDown={vi.fn()}
      />
    );

    // Open parent accordion via the trigger button
    const parentTrigger = screen.getByRole("button", { name: /parent concept/i });
    fireEvent.click(parentTrigger);

    // Child should be visible after parent is opened
    expect(screen.getByText("Child concept")).toBeInTheDocument();
  });
});
