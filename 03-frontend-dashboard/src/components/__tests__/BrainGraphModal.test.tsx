import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrainGraphModal } from "@/components/BrainGraphModal";
import type { SerializedGraphSnapshot } from "@/types/brain-graph";

const mockInitFromSnapshot = vi.fn();
const mockDestroy = vi.fn();

vi.mock("@/hooks/useBrainSimulation", () => ({
  useBrainSimulation: () => ({
    addStageNodes: vi.fn(),
    addSourceNode: vi.fn(),
    addConceptNodes: vi.fn(),
    activateStage: vi.fn(),
    completeStage: vi.fn(),
    settle: vi.fn(),
    getSnapshot: vi.fn(),
    initFromSnapshot: mockInitFromSnapshot,
    destroy: mockDestroy,
  }),
}));

const snapshot: SerializedGraphSnapshot = {
  nodes: [
    { id: "stage-search", type: "stage", label: "SEARCH", x: 0, y: 0, state: "complete" },
    { id: "src-1", type: "source", title: "A", x: 10, y: 20, radius: 6, score: 8, contentCategory: "academic" },
  ],
  links: [
    { source: "src-1", target: "stage-search", type: "source-to-stage" },
  ],
  nodeCount: 2,
  linkCount: 1,
};

describe("BrainGraphModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Radix Dialog", () => {
    render(<BrainGraphModal isOpen={true} onClose={vi.fn()} snapshot={snapshot} />);
    expect(screen.getByRole("dialog")).toBeDefined();
  });

  it("opens when isOpen is true", () => {
    render(<BrainGraphModal isOpen={true} onClose={vi.fn()} snapshot={snapshot} />);
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getByText("Brain Graph")).toBeDefined();
  });

  it("does not render dialog content when isOpen is false", () => {
    render(<BrainGraphModal isOpen={false} onClose={vi.fn()} snapshot={snapshot} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("calls onClose when close button clicked", () => {
    const onClose = vi.fn();
    render(<BrainGraphModal isOpen={true} onClose={onClose} snapshot={snapshot} />);
    const closeButton = screen.getByRole("button", { name: /close/i });
    expect(closeButton).toBeTruthy();
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("passes snapshot to useBrainSimulation.initFromSnapshot", async () => {
    render(<BrainGraphModal isOpen={true} onClose={vi.fn()} snapshot={snapshot} />);
    await waitFor(() => {
      expect(mockInitFromSnapshot).toHaveBeenCalledWith(snapshot);
    });
  });
});
