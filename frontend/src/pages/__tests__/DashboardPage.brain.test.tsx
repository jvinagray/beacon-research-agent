import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DashboardPage from "../DashboardPage";
import type { PreparedRouterState } from "../../lib/prepareRouterState";
import type { SerializedGraphSnapshot } from "../../types/brain-graph";

// --- Mocks ---

const mockNavigate = vi.fn();
let mockLocationState: PreparedRouterState | null = null;

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({
      state: mockLocationState,
      pathname: "/dashboard",
      search: "",
      hash: "",
      key: "default",
    }),
  };
});

vi.mock("@/components/BrainBadge", () => ({
  BrainBadge: (props: { onExpand: () => void }) => (
    <button data-testid="brain-badge" onClick={props.onExpand}>
      Badge
    </button>
  ),
}));
vi.mock("@/components/BrainGraphModal", () => ({
  BrainGraphModal: (props: { isOpen: boolean }) =>
    props.isOpen ? <div data-testid="brain-modal" /> : null,
}));

// Mock heavy dependencies to avoid D3/chart issues in test
vi.mock("@/components/ConceptMap", () => ({ default: () => <div /> }));
vi.mock("@/components/MarkdownViewer", () => ({ default: () => <div /> }));
vi.mock("@/hooks/useChat", () => ({
  useChat: () => ({ messages: [], isStreaming: false, error: null, sendMessage: vi.fn() }),
}));
vi.mock("@/hooks/useRewrite", () => ({
  useRewrite: () => ({
    content: "",
    currentLevel: 3,
    requestRewrite: vi.fn(),
    isStreaming: false,
  }),
}));
vi.mock("@/hooks/useDrillDown", () => ({
  useDrillDown: () => ({
    sessions: [],
    startDrillDown: vi.fn(),
  }),
}));

const fakeSnapshot: SerializedGraphSnapshot = {
  nodes: [
    { id: "stage-search", type: "stage", label: "SEARCH", x: 100, y: 100, radius: 20 },
  ],
  links: [],
  nodeCount: 1,
  linkCount: 0,
};

const baseState: PreparedRouterState = {
  topic: "Test topic",
  depth: "standard",
  sources: [],
  artifacts: { summary: "Test summary" },
  sessionId: "sess-123",
  sourceTotal: 0,
};

function renderDashboard(state: PreparedRouterState | null = mockLocationState) {
  mockLocationState = state;
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  );
}

describe("DashboardPage brain graph integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocationState = null;
  });

  it("renders BrainBadge when brainGraphSnapshot exists in location state", () => {
    renderDashboard({ ...baseState, brainGraphSnapshot: fakeSnapshot });
    expect(screen.getByTestId("brain-badge")).toBeInTheDocument();
  });

  it("does not render BrainBadge when no snapshot in state", () => {
    renderDashboard({ ...baseState });
    expect(screen.queryByTestId("brain-badge")).not.toBeInTheDocument();
  });

  it("BrainBadge click opens BrainGraphModal", () => {
    renderDashboard({ ...baseState, brainGraphSnapshot: fakeSnapshot });

    expect(screen.queryByTestId("brain-modal")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("brain-badge"));

    expect(screen.getByTestId("brain-modal")).toBeInTheDocument();
  });
});
