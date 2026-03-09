import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SearchPage from "../SearchPage";
import type { ResearchState } from "../../types/research";

// jsdom lacks ResizeObserver
globalThis.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// --- Mocks ---

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ state: null, pathname: "/search", search: "", hash: "", key: "default" }),
  };
});

vi.mock("@/components/BrainGraph", () => ({
  BrainGraph: (props: Record<string, unknown>) => <div data-testid="brain-graph" {...props} />,
}));
vi.mock("@/hooks/useBrainSimulation", () => ({
  useBrainSimulation: () => ({
    addStageNodes: vi.fn(),
    addSourceNode: vi.fn(),
    addConceptNodes: vi.fn(),
    activateStage: vi.fn(),
    completeStage: vi.fn(),
    settle: vi.fn(),
    getSnapshot: vi.fn(),
    initFromSnapshot: vi.fn(),
    destroy: vi.fn(),
  }),
}));

let capturedOnSnapshot: ((s: unknown) => void) | undefined;
vi.mock("@/hooks/useBrainEventBridge", () => ({
  useBrainEventBridge: (
    _state: unknown,
    _sim: unknown,
    onSnapshot?: (s: unknown) => void,
  ) => {
    capturedOnSnapshot = onSnapshot;
  },
}));

const mockStartResearch = vi.fn();
const mockReset = vi.fn();
let mockState: ResearchState;

const idleState: ResearchState = {
  status: "idle",
  statusMessage: "",
  topic: "",
  depth: "",
  sources: [],
  sourceTotal: 0,
  artifacts: {},
  sessionId: null,
  summary: null,
  error: null,
};

vi.mock("@/hooks/useResearch", () => ({
  useResearch: () => ({
    state: mockState,
    startResearch: mockStartResearch,
    reset: mockReset,
  }),
}));

vi.mock("@/lib/searchHistory", () => ({
  saveSearch: vi.fn(),
  loadHistory: () => [],
  removeEntry: vi.fn(),
  clearHistory: vi.fn(),
}));

function renderSearchPage() {
  return render(
    <MemoryRouter>
      <SearchPage />
    </MemoryRouter>,
  );
}

describe("SearchPage brain graph integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState = { ...idleState };
    capturedOnSnapshot = undefined;
  });

  it("renders BrainGraph overlay when status is streaming", () => {
    mockState = { ...idleState, status: "streaming", topic: "test" };
    renderSearchPage();
    expect(screen.getByTestId("brain-graph")).toBeInTheDocument();
  });

  it("does not render BrainGraph when status is idle", () => {
    mockState = { ...idleState };
    renderSearchPage();
    expect(screen.queryByTestId("brain-graph")).not.toBeInTheDocument();
  });

  it("renders BrainGraph overlay when status is loading", () => {
    mockState = { ...idleState, status: "loading", topic: "test" };
    renderSearchPage();
    expect(screen.getByTestId("brain-graph")).toBeInTheDocument();
  });

  it("navigates with brainGraphSnapshot when snapshot callback fires", async () => {
    const snapshotData = {
      nodes: [],
      links: [],
      nodeCount: 5,
      linkCount: 3,
    };

    mockState = {
      ...idleState,
      status: "complete",
      topic: "test query",
      sessionId: "sess-1",
    };

    renderSearchPage();

    // The bridge should have captured the onSnapshot callback
    expect(capturedOnSnapshot).toBeDefined();

    // Fire the snapshot callback inside act to trigger state update + navigation
    act(() => {
      capturedOnSnapshot!(snapshotData);
    });

    // Navigation should have been called with snapshot in state
    expect(mockNavigate).toHaveBeenCalledWith(
      "/dashboard",
      expect.objectContaining({
        state: expect.objectContaining({
          brainGraphSnapshot: snapshotData,
        }),
      }),
    );
  });
});
