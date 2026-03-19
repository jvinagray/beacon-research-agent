import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BrainBadge } from "@/components/BrainBadge";
import type { SerializedGraphSnapshot } from "@/types/brain-graph";

const snapshot: SerializedGraphSnapshot = {
  nodes: [
    { id: "stage-search", type: "stage", label: "SEARCH", x: 0, y: 0, state: "complete" },
    { id: "stage-evaluate", type: "stage", label: "EVALUATE", x: 50, y: 0, state: "complete" },
    { id: "src-1", type: "source", title: "A", x: 10, y: 20, radius: 6, score: 8, contentCategory: "academic" },
    { id: "src-2", type: "source", title: "B", x: 20, y: 30, radius: 5, score: 6, contentCategory: "news" },
    { id: "concept-ml", type: "concept", name: "ML", x: 30, y: 40, radius: 8 },
  ],
  links: [
    { source: "stage-search", target: "stage-evaluate", type: "spine" },
    { source: "src-1", target: "stage-evaluate", type: "source-to-stage" },
    { source: "src-2", target: "stage-evaluate", type: "source-to-stage" },
    { source: "concept-ml", target: "src-1", type: "concept-to-source" },
  ],
  nodeCount: 5,
  linkCount: 4,
};

describe("BrainBadge", () => {
  it("renders Brain icon", () => {
    render(<BrainBadge snapshot={snapshot} onExpand={vi.fn()} />);
    const button = screen.getByRole("button");
    expect(button).toBeDefined();
    const svg = button.querySelector("svg");
    expect(svg).toBeTruthy();
  });

  it("displays node and edge counts", () => {
    render(<BrainBadge snapshot={snapshot} onExpand={vi.fn()} />);
    expect(screen.getByText("5")).toBeDefined();
    expect(screen.getByText("4")).toBeDefined();
  });

  it("shows tooltip with details on hover", () => {
    render(<BrainBadge snapshot={snapshot} onExpand={vi.fn()} />);
    const button = screen.getByRole("button");
    fireEvent.mouseEnter(button);
    expect(screen.getByText(/Research Brain/)).toBeDefined();
    expect(screen.getByText(/2 sources/)).toBeDefined();
  });

  it("click calls onExpand callback", () => {
    const onExpand = vi.fn();
    render(<BrainBadge snapshot={snapshot} onExpand={onExpand} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onExpand).toHaveBeenCalledOnce();
  });

  it("applies glass styling", () => {
    render(<BrainBadge snapshot={snapshot} onExpand={vi.fn()} />);
    const button = screen.getByRole("button");
    expect(button.className).toContain("glass");
  });
});
