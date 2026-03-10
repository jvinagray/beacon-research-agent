import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { EvaluatedSource } from "@/types/research";

// Mock D3 with chainable simulation
const mockLinkForce = {
  links: vi.fn().mockReturnThis(),
  id: vi.fn().mockReturnThis(),
  distance: vi.fn().mockReturnThis(),
  strength: vi.fn().mockReturnThis(),
};

const mockSimulation = {
  nodes: vi.fn().mockReturnThis(),
  force: vi.fn(function (this: any, name: string, ...rest: any[]) {
    // Setter (2 args): return simulation for chaining
    if (rest.length > 0) return mockSimulation;
    // Getter (1 arg): return the force object
    if (name === "link") return mockLinkForce;
    return mockSimulation;
  }),
  alpha: vi.fn().mockReturnThis(),
  alphaTarget: vi.fn().mockReturnThis(),
  restart: vi.fn().mockReturnThis(),
  stop: vi.fn(),
  on: vi.fn().mockReturnThis(),
  velocityDecay: vi.fn().mockReturnThis(),
  strength: vi.fn().mockReturnThis(),
  id: vi.fn().mockReturnThis(),
  links: vi.fn().mockReturnThis(),
};

/** Create a chainable D3 selection mock that supports the full join pattern */
function mockSelection(): any {
  const sel: any = {
    select: vi.fn(() => mockSelection()),
    selectAll: vi.fn(() => mockSelection()),
    data: vi.fn(() => mockSelection()),
    join: vi.fn(() => mockSelection()),
    enter: vi.fn(() => mockSelection()),
    exit: vi.fn(() => mockSelection()),
    append: vi.fn(() => mockSelection()),
    attr: vi.fn(() => sel),
    style: vi.fn(() => sel),
    text: vi.fn(() => sel),
    transition: vi.fn(() => sel),
    duration: vi.fn(() => sel),
    remove: vi.fn(() => sel),
  };
  return sel;
}

vi.mock("d3", () => ({
  forceSimulation: vi.fn(() => mockSimulation),
  forceLink: vi.fn(() => mockLinkForce),
  forceManyBody: vi.fn(() => ({ strength: vi.fn().mockReturnValue({}) })),
  forceCollide: vi.fn(() => ({})),
  forceCenter: vi.fn(() => ({})),
  forceX: vi.fn(() => ({ strength: vi.fn().mockReturnValue({}) })),
  forceY: vi.fn(() => ({ strength: vi.fn().mockReturnValue({}) })),
  select: vi.fn(() => mockSelection()),
}));

function makeSource(overrides?: Partial<EvaluatedSource>): EvaluatedSource {
  return {
    url: `https://example.com/${Math.random().toString(36).slice(2)}`,
    title: "Test Source",
    snippet: "A snippet",
    signals: {
      learning_efficiency_score: 5,
      content_type: "docs",
      evaluation_failed: false,
      time_estimate_minutes: 10,
      recency: null,
      key_insight: "insight",
      coverage: [],
    },
    deep_read_content: null,
    extraction_method: null,
    ...overrides,
  } as EvaluatedSource;
}

const dimensions = { width: 800, height: 600 };

function createSvgRef() {
  return { current: document.createElementNS("http://www.w3.org/2000/svg", "svg") };
}

describe("useBrainSimulation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // We need to import dynamically after mock setup
  async function getHook() {
    const { useBrainSimulation } = await import("@/hooks/useBrainSimulation");
    return useBrainSimulation;
  }

  it("addStageNodes creates 4 stage nodes with correct IDs and fixed positions", async () => {
    const useBrainSimulation = await getHook();
    const svgRef = createSvgRef();
    const { result } = renderHook(() => useBrainSimulation(svgRef, dimensions));

    act(() => {
      result.current.addStageNodes();
    });

    const snapshot = result.current.getSnapshot();
    const stageNodes = snapshot.nodes.filter((n) => n.type === "stage");
    expect(stageNodes).toHaveLength(4);

    const ids = stageNodes.map((n) => n.id);
    expect(ids).toContain("stage-search");
    expect(ids).toContain("stage-evaluate");
    expect(ids).toContain("stage-extract");
    expect(ids).toContain("stage-synthesize");
  });

  it("addStageNodes creates stage nodes without spine links (stages are invisible)", async () => {
    const useBrainSimulation = await getHook();
    const svgRef = createSvgRef();
    const { result } = renderHook(() => useBrainSimulation(svgRef, dimensions));

    act(() => {
      result.current.addStageNodes();
    });

    const snapshot = result.current.getSnapshot();
    // Stage nodes exist for state tracking but no spine links (pipeline bar removed)
    expect(snapshot.links.filter((l) => l.type === "spine")).toHaveLength(0);
  });

  it("addSourceNode increases node count by 1", async () => {
    const useBrainSimulation = await getHook();
    const svgRef = createSvgRef();
    const { result } = renderHook(() => useBrainSimulation(svgRef, dimensions));

    act(() => {
      result.current.addStageNodes();
    });

    const before = result.current.getSnapshot().nodeCount;

    act(() => {
      result.current.addSourceNode(makeSource());
    });

    const after = result.current.getSnapshot().nodeCount;
    expect(after).toBe(before + 1);
  });

  it("addSourceNode does not create source-to-stage links (sources float freely)", async () => {
    const useBrainSimulation = await getHook();
    const svgRef = createSvgRef();
    const { result } = renderHook(() => useBrainSimulation(svgRef, dimensions));

    act(() => {
      result.current.addStageNodes();
      result.current.addSourceNode(makeSource({ url: "https://test.com/1" }));
    });

    const snapshot = result.current.getSnapshot();
    const sourceLinks = snapshot.links.filter(
      (l) => l.type === "source-to-stage"
    );
    expect(sourceLinks).toHaveLength(0);
  });

  it("addSourceNode respects 25-node cap (26th source not added if score lower than min)", async () => {
    const useBrainSimulation = await getHook();
    const svgRef = createSvgRef();
    const { result } = renderHook(() => useBrainSimulation(svgRef, dimensions));

    act(() => {
      result.current.addStageNodes();
      for (let i = 0; i < 25; i++) {
        result.current.addSourceNode(
          makeSource({
            url: `https://example.com/source-${i}`,
            signals: {
              learning_efficiency_score: 5,
              content_type: "docs",
              evaluation_failed: false,
              time_estimate_minutes: 10,
              recency: null,
              key_insight: "insight",
              coverage: [],
            },
          })
        );
      }
    });

    const beforeSnapshot = result.current.getSnapshot();
    const sourcesBefore = beforeSnapshot.nodes.filter(
      (n) => n.type === "source"
    );
    expect(sourcesBefore).toHaveLength(25);

    // Add a 26th source with a lower score
    act(() => {
      result.current.addSourceNode(
        makeSource({
          url: "https://example.com/source-26",
          signals: {
            learning_efficiency_score: 2,
            content_type: "docs",
            evaluation_failed: false,
            time_estimate_minutes: 10,
            recency: null,
            key_insight: "insight",
            coverage: [],
          },
        })
      );
    });

    const afterSnapshot = result.current.getSnapshot();
    const sourcesAfter = afterSnapshot.nodes.filter(
      (n) => n.type === "source"
    );
    expect(sourcesAfter).toHaveLength(25);
  });

  it("addSourceNode swaps lowest-score source when cap reached and new score is higher", async () => {
    const useBrainSimulation = await getHook();
    const svgRef = createSvgRef();
    const { result } = renderHook(() => useBrainSimulation(svgRef, dimensions));

    act(() => {
      result.current.addStageNodes();
      // Add one low-score source
      result.current.addSourceNode(
        makeSource({
          url: "https://example.com/low-score",
          signals: {
            learning_efficiency_score: 1,
            content_type: "docs",
            evaluation_failed: false,
            time_estimate_minutes: 10,
            recency: null,
            key_insight: "insight",
            coverage: [],
          },
        })
      );
      // Fill remaining 24 with score 5
      for (let i = 0; i < 24; i++) {
        result.current.addSourceNode(
          makeSource({
            url: `https://example.com/source-${i}`,
            signals: {
              learning_efficiency_score: 5,
              content_type: "docs",
              evaluation_failed: false,
              time_estimate_minutes: 10,
              recency: null,
              key_insight: "insight",
              coverage: [],
            },
          })
        );
      }
    });

    // Add 26th with higher score than the low one
    act(() => {
      result.current.addSourceNode(
        makeSource({
          url: "https://example.com/high-score",
          signals: {
            learning_efficiency_score: 9,
            content_type: "docs",
            evaluation_failed: false,
            time_estimate_minutes: 10,
            recency: null,
            key_insight: "insight",
            coverage: [],
          },
        })
      );
    });

    const snapshot = result.current.getSnapshot();
    const sourceNodes = snapshot.nodes.filter((n) => n.type === "source");
    expect(sourceNodes).toHaveLength(25);
    // Low-score should be gone
    expect(sourceNodes.find((n) => n.id === "https://example.com/low-score")).toBeUndefined();
    // High-score should be present
    expect(sourceNodes.find((n) => n.id === "https://example.com/high-score")).toBeDefined();
  });

  it("addConceptNodes adds correct number of concept nodes", async () => {
    const useBrainSimulation = await getHook();
    const svgRef = createSvgRef();
    const { result } = renderHook(() => useBrainSimulation(svgRef, dimensions));

    act(() => {
      result.current.addStageNodes();
      result.current.addConceptNodes(
        [
          { id: "concept-ml", type: "concept", name: "Machine Learning", mentionCount: 3, radius: 16 },
          { id: "concept-ai", type: "concept", name: "AI", mentionCount: 5, radius: 20 },
        ],
        []
      );
    });

    const snapshot = result.current.getSnapshot();
    const concepts = snapshot.nodes.filter((n) => n.type === "concept");
    expect(concepts).toHaveLength(2);
  });

  it("addConceptNodes creates concept-to-source links", async () => {
    const useBrainSimulation = await getHook();
    const svgRef = createSvgRef();
    const { result } = renderHook(() => useBrainSimulation(svgRef, dimensions));

    const sourceLinks = [
      { source: "concept-ml", target: "https://test.com/1", type: "concept-to-source" as const },
    ];

    act(() => {
      result.current.addStageNodes();
      result.current.addSourceNode(makeSource({ url: "https://test.com/1" }));
      result.current.addConceptNodes(
        [{ id: "concept-ml", type: "concept", name: "ML", mentionCount: 3, radius: 16 }],
        sourceLinks
      );
    });

    const snapshot = result.current.getSnapshot();
    const conceptLinks = snapshot.links.filter(
      (l) => l.type === "concept-to-source"
    );
    expect(conceptLinks).toHaveLength(1);
  });

  it("activateStage changes node state from idle to active", async () => {
    const useBrainSimulation = await getHook();
    const svgRef = createSvgRef();
    const { result } = renderHook(() => useBrainSimulation(svgRef, dimensions));

    act(() => {
      result.current.addStageNodes();
      result.current.activateStage("search");
    });

    const snapshot = result.current.getSnapshot();
    const searchNode = snapshot.nodes.find((n) => n.id === "stage-search");
    expect(searchNode?.state).toBe("active");
  });

  it("completeStage changes node state from active to complete", async () => {
    const useBrainSimulation = await getHook();
    const svgRef = createSvgRef();
    const { result } = renderHook(() => useBrainSimulation(svgRef, dimensions));

    act(() => {
      result.current.addStageNodes();
      result.current.activateStage("search");
      result.current.completeStage("search");
    });

    const snapshot = result.current.getSnapshot();
    const searchNode = snapshot.nodes.find((n) => n.id === "stage-search");
    expect(searchNode?.state).toBe("complete");
  });

  it("getSnapshot returns SerializedGraphSnapshot with correct node/link counts", async () => {
    const useBrainSimulation = await getHook();
    const svgRef = createSvgRef();
    const { result } = renderHook(() => useBrainSimulation(svgRef, dimensions));

    act(() => {
      result.current.addStageNodes();
      result.current.addSourceNode(makeSource());
    });

    const snapshot = result.current.getSnapshot();
    expect(snapshot.nodeCount).toBe(5); // 4 stages + 1 source
    expect(snapshot.linkCount).toBe(0); // no spine or source-to-stage links
    expect(snapshot.nodes).toHaveLength(5);
    expect(snapshot.links).toHaveLength(0);
  });

  it("getSnapshot preserves node positions (x, y values present)", async () => {
    const useBrainSimulation = await getHook();
    const svgRef = createSvgRef();
    const { result } = renderHook(() => useBrainSimulation(svgRef, dimensions));

    act(() => {
      result.current.addStageNodes();
    });

    const snapshot = result.current.getSnapshot();
    snapshot.nodes.forEach((n) => {
      expect(typeof n.x).toBe("number");
      expect(typeof n.y).toBe("number");
    });
  });

  it("destroy stops the simulation (simulation.stop called)", async () => {
    const useBrainSimulation = await getHook();
    const svgRef = createSvgRef();
    const { result } = renderHook(() => useBrainSimulation(svgRef, dimensions));

    act(() => {
      result.current.destroy();
    });

    expect(mockSimulation.stop).toHaveBeenCalled();
  });

  it("useEffect cleanup calls simulation.stop on unmount", async () => {
    const useBrainSimulation = await getHook();
    const svgRef = createSvgRef();
    const { unmount } = renderHook(() =>
      useBrainSimulation(svgRef, dimensions)
    );

    mockSimulation.stop.mockClear();
    unmount();
    expect(mockSimulation.stop).toHaveBeenCalled();
  });
});
