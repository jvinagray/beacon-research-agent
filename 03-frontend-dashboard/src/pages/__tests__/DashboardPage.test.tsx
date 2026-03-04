import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import DashboardPage from "../DashboardPage";
import type { EvaluatedSource } from "@/types/research";
import type { PreparedRouterState } from "@/lib/prepareRouterState";

// Mock react-router-dom navigation
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));

function makeSource(overrides: Partial<EvaluatedSource> = {}): Omit<EvaluatedSource, "deep_read_content"> {
  return {
    url: "https://example.com",
    title: "Test Source",
    snippet: "A test snippet",
    signals: {
      learning_efficiency_score: 7,
      content_type: "tutorial",
      time_estimate_minutes: 5,
      recency: "2024-01-01",
      key_insight: "A key insight",
      coverage: ["topic1", "topic2"],
      evaluation_failed: false,
    },
    extraction_method: "html",
    ...overrides,
  };
}

function makeRouterState(overrides: Partial<PreparedRouterState> = {}): PreparedRouterState {
  return {
    topic: "Test Topic",
    depth: "standard",
    sources: [makeSource()],
    artifacts: {},
    sessionId: "session-123",
    sourceTotal: 1,
    ...overrides,
  };
}

function renderWithRouter(state: PreparedRouterState | null) {
  const entries = state
    ? [{ pathname: "/dashboard", state }]
    : [{ pathname: "/dashboard" }];
  return render(
    <MemoryRouter initialEntries={entries}>
      <DashboardPage />
    </MemoryRouter>
  );
}

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("redirects to /search when no router state present", () => {
    renderWithRouter(null);
    expect(mockNavigate).toHaveBeenCalledWith("/search");
  });

  it("renders Sources tab by default with source cards", () => {
    const state = makeRouterState({
      sources: [
        makeSource({ title: "Source Alpha" }),
        makeSource({ title: "Source Beta" }),
      ],
      sourceTotal: 2,
    });
    renderWithRouter(state);

    expect(screen.getByText("Source Alpha")).toBeInTheDocument();
    expect(screen.getByText("Source Beta")).toBeInTheDocument();
  });

  it("sources sorted by learning_efficiency_score descending", () => {
    const state = makeRouterState({
      sources: [
        makeSource({
          title: "Low Score",
          signals: {
            learning_efficiency_score: 3,
            content_type: "tutorial",
            time_estimate_minutes: 5,
            recency: null,
            key_insight: "low",
            coverage: [],
            evaluation_failed: false,
          },
        }),
        makeSource({
          title: "High Score",
          signals: {
            learning_efficiency_score: 9,
            content_type: "paper",
            time_estimate_minutes: 10,
            recency: null,
            key_insight: "high",
            coverage: [],
            evaluation_failed: false,
          },
        }),
      ],
    });
    renderWithRouter(state);

    const cards = screen.getAllByTestId("source-card");
    expect(cards[0]).toHaveTextContent("High Score");
    expect(cards[1]).toHaveTextContent("Low Score");
  });

  it("evaluation_failed sources appear dimmed at bottom", () => {
    const state = makeRouterState({
      sources: [
        makeSource({
          title: "Failed Source",
          signals: {
            learning_efficiency_score: 0,
            content_type: "other",
            time_estimate_minutes: 5,
            recency: null,
            key_insight: "failed",
            coverage: [],
            evaluation_failed: true,
          },
        }),
        makeSource({
          title: "Good Source",
          signals: {
            learning_efficiency_score: 8,
            content_type: "tutorial",
            time_estimate_minutes: 5,
            recency: null,
            key_insight: "good",
            coverage: [],
            evaluation_failed: false,
          },
        }),
      ],
    });
    renderWithRouter(state);

    const cards = screen.getAllByTestId("source-card");
    // Good source should be first (non-failed sorted by score)
    expect(cards[0]).toHaveTextContent("Good Source");
    // Failed source should be last
    expect(cards[1]).toHaveTextContent("Failed Source");
    // Failed source card should have opacity class
    expect(cards[1]).toHaveClass("opacity-60");
  });

  it("switching to Summary tab renders markdown content area", async () => {
    const user = userEvent.setup();
    renderWithRouter(makeRouterState());

    const summaryTab = screen.getByRole("button", { name: /summary/i });
    await user.click(summaryTab);

    expect(screen.getByTestId("summary-placeholder")).toBeInTheDocument();
  });

  it("switching to Flashcards tab renders flashcard components with data", async () => {
    const user = userEvent.setup();
    const state = makeRouterState({
      artifacts: {
        flashcards: [
          { question: "What is TypeScript?", answer: "A typed superset of JavaScript." },
          { question: "What is React?", answer: "A UI library." },
        ],
      },
    });
    renderWithRouter(state);

    const flashcardsTab = screen.getByRole("button", { name: /flashcards/i });
    await user.click(flashcardsTab);

    expect(screen.getByText("What is TypeScript?")).toBeInTheDocument();
    expect(screen.getByText("What is React?")).toBeInTheDocument();
  });

  it("Flashcards tab shows card count", async () => {
    const user = userEvent.setup();
    const state = makeRouterState({
      artifacts: {
        flashcards: [
          { question: "Q1", answer: "A1" },
          { question: "Q2", answer: "A2" },
          { question: "Q3", answer: "A3" },
        ],
      },
    });
    renderWithRouter(state);

    const flashcardsTab = screen.getByRole("button", { name: /flashcards/i });
    await user.click(flashcardsTab);

    expect(screen.getByText("3 flashcards")).toBeInTheDocument();
  });

  it("Flashcards tab with empty flashcards shows placeholder message", async () => {
    const user = userEvent.setup();
    renderWithRouter(makeRouterState({ artifacts: {} }));

    const flashcardsTab = screen.getByRole("button", { name: /flashcards/i });
    await user.click(flashcardsTab);

    expect(
      screen.getByText(/no flashcards were generated/i),
    ).toBeInTheDocument();
  });

  it("export button triggers file download", async () => {
    const user = userEvent.setup();
    const mockBlob = new Blob(["# Research"], { type: "text/markdown" });
    const mockResponse = { ok: true, status: 200, blob: () => Promise.resolve(mockBlob) };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

    const createObjectURL = vi.fn(() => "blob:mock-url");
    const revokeObjectURL = vi.fn();
    global.URL.createObjectURL = createObjectURL;
    global.URL.revokeObjectURL = revokeObjectURL;

    // Render first, then spy on createElement to avoid breaking React
    renderWithRouter(makeRouterState({ topic: "Test Topic" }));

    const clickSpy = vi.fn();
    const origCreateElement = document.createElement.bind(document);
    const spy = vi.spyOn(document, "createElement").mockImplementation(
      (tagName: string, options?: ElementCreationOptions) => {
        if (tagName === "a") {
          return { href: "", download: "", click: clickSpy } as unknown as HTMLElement;
        }
        return origCreateElement(tagName, options);
      }
    );

    const exportBtn = screen.getByRole("button", { name: /export/i });
    await user.click(exportBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/export/session-123")
      );
    });

    await waitFor(() => {
      expect(clickSpy).toHaveBeenCalled();
    });

    spy.mockRestore();
  });

  it("export button shows error toast on 404 (expired session)", async () => {
    const { toast } = await import("sonner");
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    renderWithRouter(makeRouterState());

    const exportBtn = screen.getByRole("button", { name: /export/i });
    await user.click(exportBtn);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining("expired")
      );
    });
  });

  it("redirects to /search when sessionId is null", () => {
    renderWithRouter(makeRouterState({ sessionId: null }));

    expect(mockNavigate).toHaveBeenCalledWith("/search");
  });
});
