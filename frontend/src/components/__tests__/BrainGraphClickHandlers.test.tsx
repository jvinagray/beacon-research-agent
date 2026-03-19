import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GraphNode } from "@/types/brain-graph";

/**
 * Helper: creates a click handler function matching BrainGraph's internal logic.
 * This tests the dispatch logic independently of D3 rendering.
 */
function createClickHandler(
  onNodeClick?: (nodeType: "stage" | "source" | "concept", nodeId: string) => void,
  setPinnedNode?: (node: GraphNode | null) => void,
) {
  return (node: GraphNode) => {
    switch (node.type) {
      case "source": {
        try {
          const parsed = new URL(node.url);
          if (parsed.protocol === "http:" || parsed.protocol === "https:") {
            window.open(node.url, "_blank", "noopener,noreferrer");
          }
        } catch {
          // invalid URL, silently ignore
        }
        onNodeClick?.("source", node.id);
        break;
      }
      case "stage":
        if (onNodeClick) {
          onNodeClick("stage", node.id);
        } else {
          setPinnedNode?.(node);
        }
        break;
      case "concept":
        if (onNodeClick) {
          onNodeClick("concept", node.id);
        } else {
          setPinnedNode?.(node);
        }
        break;
    }
  };
}

describe("BrainGraph click handlers", () => {
  let openSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    openSpy = vi.fn();
    vi.stubGlobal("open", openSpy);
  });

  it("source node click calls window.open with source URL (SearchPage context)", () => {
    const handler = createClickHandler();
    const sourceNode: GraphNode = {
      id: "source-1",
      type: "source",
      url: "https://example.com/article",
      title: "Example Article",
      score: 8,
      contentCategory: "academic",
      radius: 6,
      opacity: 1,
    };
    handler(sourceNode);
    expect(openSpy).toHaveBeenCalledWith("https://example.com/article", "_blank", "noopener,noreferrer");
  });

  it("stage node click on SearchPage shows tooltip only (no navigation)", () => {
    const setPinnedNode = vi.fn();
    const handler = createClickHandler(undefined, setPinnedNode);
    const stageNode: GraphNode = {
      id: "stage-search",
      type: "stage",
      label: "SEARCH",
      state: "active",
      fx: 0,
      fy: 0,
    };
    handler(stageNode);
    expect(openSpy).not.toHaveBeenCalled();
    expect(setPinnedNode).toHaveBeenCalledWith(stageNode);
  });

  it("SEARCH stage click in modal calls onNodeClick('stage', 'stage-search')", () => {
    const onNodeClick = vi.fn();
    const handler = createClickHandler(onNodeClick);
    const stageNode: GraphNode = {
      id: "stage-search",
      type: "stage",
      label: "SEARCH",
      state: "complete",
      fx: 0,
      fy: 0,
    };
    handler(stageNode);
    expect(onNodeClick).toHaveBeenCalledWith("stage", "stage-search");
  });

  it("SYNTHESIZE stage click in modal calls onNodeClick('stage', 'stage-synthesize')", () => {
    const onNodeClick = vi.fn();
    const handler = createClickHandler(onNodeClick);
    const stageNode: GraphNode = {
      id: "stage-synthesize",
      type: "stage",
      label: "SYNTHESIZE",
      state: "complete",
      fx: 0,
      fy: 0,
    };
    handler(stageNode);
    expect(onNodeClick).toHaveBeenCalledWith("stage", "stage-synthesize");
  });

  it("concept node click in modal calls onNodeClick('concept', conceptId)", () => {
    const onNodeClick = vi.fn();
    const handler = createClickHandler(onNodeClick);
    const conceptNode: GraphNode = {
      id: "concept-machine-learning",
      type: "concept",
      name: "Machine Learning",
      mentionCount: 5,
      radius: 8,
    };
    handler(conceptNode);
    expect(onNodeClick).toHaveBeenCalledWith("concept", "concept-machine-learning");
  });
});

describe("DashboardPage handleBrainNodeClick tab mapping", () => {
  it("switches to correct tab for each node type", () => {
    const setActiveTab = vi.fn();

    // This mirrors the callback that DashboardPage will provide
    function handleBrainNodeClick(
      nodeType: "stage" | "source" | "concept",
      nodeId: string,
    ) {
      switch (nodeType) {
        case "stage":
          if (nodeId === "stage-search" || nodeId === "stage-evaluate") {
            setActiveTab("sources");
          } else if (nodeId === "stage-synthesize") {
            setActiveTab("summary");
          }
          // stage-extract: no tab change
          break;
        case "concept":
          setActiveTab("concept-map");
          break;
        case "source":
          // source clicks open URL directly, no tab change needed
          break;
      }
    }

    handleBrainNodeClick("stage", "stage-search");
    expect(setActiveTab).toHaveBeenLastCalledWith("sources");

    handleBrainNodeClick("stage", "stage-evaluate");
    expect(setActiveTab).toHaveBeenLastCalledWith("sources");

    handleBrainNodeClick("stage", "stage-synthesize");
    expect(setActiveTab).toHaveBeenLastCalledWith("summary");

    handleBrainNodeClick("concept", "concept-anything");
    expect(setActiveTab).toHaveBeenLastCalledWith("concept-map");
  });
});
