import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useBrainEventBridge } from "../useBrainEventBridge";
import type { ResearchState } from "@/types/research";

vi.mock("@/lib/brain-graph-concepts", () => ({
  extractConcepts: vi.fn(() => ["AI", "ML"]),
  buildConceptSourceEdges: vi.fn(() => ({
    concepts: [
      { id: "concept-ai", type: "concept", name: "AI", mentionCount: 3, radius: 14 },
      { id: "concept-ml", type: "concept", name: "ML", mentionCount: 2, radius: 12 },
    ],
    edges: [
      { source: "concept-ai", target: "https://example.com", type: "concept-to-source" as const },
    ],
  })),
}));

function createMockSimulation() {
  return {
    addStageNodes: vi.fn(),
    addSourceNode: vi.fn(),
    addConceptNodes: vi.fn(),
    activateStage: vi.fn(),
    completeStage: vi.fn(),
    settle: vi.fn(),
    getSnapshot: vi.fn(() => ({ nodes: [], links: [], nodeCount: 0, linkCount: 0 })),
    initFromSnapshot: vi.fn(),
    destroy: vi.fn(),
  };
}

const BASE_STATE: ResearchState = {
  status: "idle",
  statusMessage: "",
  topic: "",
  depth: "standard",
  sources: [],
  sourceTotal: 0,
  artifacts: {},
  sessionId: null,
  summary: null,
  error: null,
};

function makeState(overrides: Partial<ResearchState>): ResearchState {
  return { ...BASE_STATE, ...overrides };
}

const MOCK_SOURCE = {
  url: "https://example.com",
  title: "Example",
  snippet: "snippet",
  signals: {
    learning_efficiency_score: 7,
    content_type: "docs" as const,
    time_estimate_minutes: 5,
    recency: null,
    key_insight: "insight",
    coverage: [],
    evaluation_failed: false,
  },
  deep_read_content: null,
  extraction_method: null,
};

describe("useBrainEventBridge", () => {
  let sim: ReturnType<typeof createMockSimulation>;

  beforeEach(() => {
    sim = createMockSimulation();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('status message containing "search" calls activateStage("search")', () => {
    const { rerender } = renderHook(
      ({ state }) => useBrainEventBridge(state, sim),
      { initialProps: { state: BASE_STATE } }
    );
    rerender({ state: makeState({ status: "streaming", statusMessage: "Searching for sources..." }) });
    expect(sim.activateStage).toHaveBeenCalledWith("search");
  });

  it("sourceTotal changing from 0 to N calls activateStage evaluate", () => {
    const { rerender } = renderHook(
      ({ state }) => useBrainEventBridge(state, sim),
      { initialProps: { state: BASE_STATE } }
    );
    rerender({ state: makeState({ status: "streaming", sourceTotal: 5 }) });
    expect(sim.activateStage).toHaveBeenCalledWith("evaluate");
  });

  it('status message containing "extract" calls activateStage extract and completeStage evaluate', () => {
    const { rerender } = renderHook(
      ({ state }) => useBrainEventBridge(state, sim),
      { initialProps: { state: BASE_STATE } }
    );
    rerender({ state: makeState({ status: "streaming", statusMessage: "Extracting content..." }) });
    expect(sim.activateStage).toHaveBeenCalledWith("extract");
    expect(sim.completeStage).toHaveBeenCalledWith("evaluate");
  });

  it('status message containing "synthesize" calls activateStage synthesize and completeStage extract', () => {
    const { rerender } = renderHook(
      ({ state }) => useBrainEventBridge(state, sim),
      { initialProps: { state: BASE_STATE } }
    );
    rerender({ state: makeState({ status: "streaming", statusMessage: "Synthesizing findings..." }) });
    expect(sim.activateStage).toHaveBeenCalledWith("synthesize");
    expect(sim.completeStage).toHaveBeenCalledWith("extract");
  });

  it("new source in sources array calls addSourceNode", () => {
    const { rerender } = renderHook(
      ({ state }) => useBrainEventBridge(state, sim),
      { initialProps: { state: BASE_STATE } }
    );
    rerender({ state: makeState({ status: "streaming", sources: [MOCK_SOURCE] }) });
    expect(sim.addSourceNode).toHaveBeenCalledWith(MOCK_SOURCE);
  });

  it("same source count on re-render does not call addSourceNode again", () => {
    const stateWithSource = makeState({ status: "streaming", sources: [MOCK_SOURCE] });
    const { rerender } = renderHook(
      ({ state }) => useBrainEventBridge(state, sim),
      { initialProps: { state: stateWithSource } }
    );
    rerender({ state: { ...stateWithSource, statusMessage: "update" } });
    // addSourceNode called once for initial render, not again on rerender
    expect(sim.addSourceNode).toHaveBeenCalledTimes(1);
  });

  it("concept_map artifact appearing calls addConceptNodes", () => {
    const { rerender } = renderHook(
      ({ state }) => useBrainEventBridge(state, sim),
      { initialProps: { state: BASE_STATE } }
    );
    rerender({
      state: makeState({
        status: "streaming",
        sources: [MOCK_SOURCE],
        artifacts: { concept_map: "# Concepts\n- AI\n- ML" },
      }),
    });
    expect(sim.addConceptNodes).toHaveBeenCalledTimes(1);
  });

  it("concept_map artifact appearing twice does not call addConceptNodes again", () => {
    const stateWithConcepts = makeState({
      status: "streaming",
      sources: [MOCK_SOURCE],
      artifacts: { concept_map: "# Concepts\n- AI\n- ML" },
    });
    const { rerender } = renderHook(
      ({ state }) => useBrainEventBridge(state, sim),
      { initialProps: { state: stateWithConcepts } }
    );
    rerender({ state: { ...stateWithConcepts, statusMessage: "update" } });
    expect(sim.addConceptNodes).toHaveBeenCalledTimes(1);
  });

  it('status === "complete" calls settle()', () => {
    const { rerender } = renderHook(
      ({ state }) => useBrainEventBridge(state, sim),
      { initialProps: { state: BASE_STATE } }
    );
    rerender({ state: makeState({ status: "complete" }) });
    expect(sim.settle).toHaveBeenCalled();
  });

  it('status === "complete" calls getSnapshot after 2s delay', () => {
    const onSnapshot = vi.fn();
    const { rerender } = renderHook(
      ({ state }) => useBrainEventBridge(state, sim, onSnapshot),
      { initialProps: { state: BASE_STATE } }
    );
    rerender({ state: makeState({ status: "complete" }) });
    expect(sim.getSnapshot).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    expect(sim.getSnapshot).toHaveBeenCalled();
    expect(onSnapshot).toHaveBeenCalled();
  });

  it('status === "error" calls getSnapshot for partial data preservation', () => {
    const onSnapshot = vi.fn();
    const { rerender } = renderHook(
      ({ state }) => useBrainEventBridge(state, sim, onSnapshot),
      { initialProps: { state: BASE_STATE } }
    );
    rerender({
      state: makeState({
        status: "error",
        error: { message: "failed", recoverable: false },
      }),
    });
    expect(sim.getSnapshot).toHaveBeenCalled();
    expect(onSnapshot).toHaveBeenCalled();
  });

  it("multiple rapid state changes process in correct order", () => {
    const { rerender } = renderHook(
      ({ state }) => useBrainEventBridge(state, sim),
      { initialProps: { state: BASE_STATE } }
    );

    // Search -> Evaluate -> Extract in sequence
    rerender({ state: makeState({ status: "streaming", statusMessage: "Searching..." }) });
    rerender({ state: makeState({ status: "streaming", statusMessage: "Searching...", sourceTotal: 3 }) });
    rerender({ state: makeState({ status: "streaming", statusMessage: "Extracting content...", sourceTotal: 3 }) });

    expect(sim.activateStage).toHaveBeenCalledWith("search");
    expect(sim.activateStage).toHaveBeenCalledWith("evaluate");
    expect(sim.activateStage).toHaveBeenCalledWith("extract");
    expect(sim.completeStage).toHaveBeenCalledWith("evaluate");
  });
});
