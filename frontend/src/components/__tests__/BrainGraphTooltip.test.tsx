import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { BrainGraphTooltip } from "../BrainGraphTooltip";
import type { GraphNode } from "@/types/brain-graph";

function makeStageNode(
  overrides: Partial<GraphNode & { type: "stage" }> = {},
): GraphNode {
  return {
    id: "stage-search",
    type: "stage",
    label: "SEARCH",
    state: "idle",
    fx: 0,
    fy: 0,
    ...overrides,
  } as GraphNode;
}

function makeSourceNode(
  overrides: Partial<GraphNode & { type: "source" }> = {},
): GraphNode {
  return {
    id: "https://example.com/article",
    type: "source",
    url: "https://example.com/very/long/path/to/article",
    title: "Machine Learning Overview",
    score: 8.5,
    contentCategory: "academic",
    radius: 18,
    opacity: 1,
    ...overrides,
  } as GraphNode;
}

function makeConceptNode(
  overrides: Partial<GraphNode & { type: "concept" }> = {},
): GraphNode {
  return {
    id: "concept-neural-networks",
    type: "concept",
    name: "Neural Networks",
    mentionCount: 4,
    radius: 20,
    ...overrides,
  } as GraphNode;
}

describe("BrainGraphTooltip", () => {
  it("renders nothing when no node is hovered", () => {
    const { container } = render(
      <BrainGraphTooltip hoveredNode={null} x={0} y={0} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders stage name for idle stage node", () => {
    render(
      <BrainGraphTooltip
        hoveredNode={makeStageNode({ state: "idle", label: "SEARCH" })}
        x={100}
        y={100}
      />,
    );
    expect(screen.getByText("SEARCH")).toBeInTheDocument();
    expect(screen.queryByText("Processing...")).not.toBeInTheDocument();
  });

  it('renders stage name + "Processing..." for active stage node', () => {
    render(
      <BrainGraphTooltip
        hoveredNode={makeStageNode({ state: "active", label: "EVALUATE" })}
        x={100}
        y={100}
      />,
    );
    expect(screen.getByText("EVALUATE")).toBeInTheDocument();
    expect(screen.getByText("Processing...")).toBeInTheDocument();
  });

  it('renders stage name + "Complete" for complete stage node', () => {
    render(
      <BrainGraphTooltip
        hoveredNode={makeStageNode({ state: "complete", label: "EXTRACT" })}
        x={100}
        y={100}
      />,
    );
    expect(screen.getByText("EXTRACT")).toBeInTheDocument();
    expect(screen.getByText("Complete")).toBeInTheDocument();
  });

  it("renders title, truncated URL, score badge for source node", () => {
    render(
      <BrainGraphTooltip hoveredNode={makeSourceNode()} x={100} y={100} />,
    );
    expect(screen.getByText("Machine Learning Overview")).toBeInTheDocument();
    // URL should be truncated — full URL should not appear
    expect(
      screen.queryByText(
        "https://example.com/very/long/path/to/article",
      ),
    ).not.toBeInTheDocument();
    expect(screen.getByText("8.5")).toBeInTheDocument();
    expect(screen.getByText("academic")).toBeInTheDocument();
  });

  it("renders concept name and mention count for concept node", () => {
    render(
      <BrainGraphTooltip
        hoveredNode={makeConceptNode()}
        x={100}
        y={100}
        linkedSourceTitles={["Source A", "Source B"]}
      />,
    );
    expect(screen.getByText("Neural Networks")).toBeInTheDocument();
    expect(
      screen.getByText("Referenced by 4 sources"),
    ).toBeInTheDocument();
  });

  it("truncates linked source titles at 3 and shows +N more", () => {
    render(
      <BrainGraphTooltip
        hoveredNode={makeConceptNode()}
        x={100}
        y={100}
        linkedSourceTitles={["Source A", "Source B", "Source C", "Source D", "Source E"]}
      />,
    );
    expect(screen.getByText("Source A")).toBeInTheDocument();
    expect(screen.getByText("Source B")).toBeInTheDocument();
    expect(screen.getByText("Source C")).toBeInTheDocument();
    expect(screen.queryByText("Source D")).not.toBeInTheDocument();
    expect(screen.getByText("+2 more")).toBeInTheDocument();
  });

  it("positions tooltip at provided screen coordinates", () => {
    render(
      <BrainGraphTooltip
        hoveredNode={makeStageNode()}
        x={200}
        y={300}
      />,
    );
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip.style.left).toBe("212px"); // x + 12
    expect(tooltip.style.top).toBe("312px"); // y + 12
  });

  it("clamps tooltip to prevent right-edge overflow", () => {
    // Mock window dimensions
    vi.stubGlobal("innerWidth", 800);
    vi.stubGlobal("innerHeight", 600);

    render(
      <BrainGraphTooltip
        hoveredNode={makeStageNode()}
        x={750}
        y={100}
      />,
    );
    const tooltip = screen.getByRole("tooltip");
    const left = parseInt(tooltip.style.left);
    // Should be adjusted leftward: x - tooltipWidth - 12
    expect(left).toBeLessThan(750);

    vi.unstubAllGlobals();
  });

  it("clamps tooltip to prevent bottom-edge overflow", () => {
    vi.stubGlobal("innerWidth", 800);
    vi.stubGlobal("innerHeight", 600);

    render(
      <BrainGraphTooltip
        hoveredNode={makeStageNode()}
        x={100}
        y={570}
      />,
    );
    const tooltip = screen.getByRole("tooltip");
    const top = parseInt(tooltip.style.top);
    // Should be adjusted upward: y - tooltipHeight - 12
    expect(top).toBeLessThan(570);

    vi.unstubAllGlobals();
  });
});
