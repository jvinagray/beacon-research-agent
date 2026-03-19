import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import DashboardPage from "../pages/DashboardPage";
import type { EvaluatedSource } from "@/types/research";
import type { PreparedRouterState } from "@/lib/prepareRouterState";

// Mock navigation
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

// Mock sonner
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));

// Mock @microsoft/fetch-event-source at module level
const mockFetchEventSource = vi.fn();
vi.mock("@microsoft/fetch-event-source", () => ({
  fetchEventSource: (...args: unknown[]) => mockFetchEventSource(...args),
}));

function makeSource(overrides: Partial<EvaluatedSource> = {}): Omit<EvaluatedSource, "deep_read_content"> {
  return {
    url: "https://example.com",
    title: "Test Source",
    snippet: "A snippet",
    signals: {
      learning_efficiency_score: 7,
      content_type: "tutorial",
      time_estimate_minutes: 5,
      recency: "2024-01-01",
      key_insight: "A key insight",
      coverage: ["topic1"],
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

function renderDashboard(state: PreparedRouterState | null) {
  const entries = state
    ? [{ pathname: "/dashboard", state }]
    : [{ pathname: "/dashboard" }];
  return render(
    <MemoryRouter initialEntries={entries}>
      <DashboardPage />
    </MemoryRouter>
  );
}

describe("Edge Cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchEventSource.mockReset();
    global.fetch = vi.fn();
  });

  describe("empty sources array", () => {
    it('shows "No sources could be evaluated" message', () => {
      renderDashboard(makeRouterState({ sources: [], sourceTotal: 0 }));
      expect(screen.getByText(/no sources could be evaluated/i)).toBeInTheDocument();
    });
  });

  describe("missing artifacts", () => {
    it("shows placeholder message when summary artifact is missing", async () => {
      const user = userEvent.setup();
      renderDashboard(makeRouterState({ artifacts: {} }));

      const summaryTab = screen.getByRole("button", { name: /summary/i });
      await user.click(summaryTab);

      expect(screen.getByText(/no summary was generated/i)).toBeInTheDocument();
    });

    it("shows placeholder message when concept_map artifact is missing", async () => {
      const user = userEvent.setup();
      renderDashboard(makeRouterState({ artifacts: {} }));

      const conceptMapTab = screen.getByRole("button", { name: /concept map/i });
      await user.click(conceptMapTab);

      expect(screen.getByText(/no concept map/i)).toBeInTheDocument();
    });

    it("shows placeholder message when flashcards artifact is missing", async () => {
      const user = userEvent.setup();
      renderDashboard(makeRouterState({ artifacts: {} }));

      const flashcardsTab = screen.getByRole("button", { name: /flashcards/i });
      await user.click(flashcardsTab);

      expect(screen.getByText(/no flashcards were generated/i)).toBeInTheDocument();
    });
  });

  describe("dashboard redirect on refresh (no router state)", () => {
    it("redirects to /search with expired session message", () => {
      renderDashboard(null);
      expect(mockNavigate).toHaveBeenCalledWith("/search", {
        state: { message: expect.stringMatching(/expired/i) },
      });
    });
  });

  describe("long topic names", () => {
    it("truncated in header with hover title", () => {
      const longTopic = "A".repeat(200);
      renderDashboard(makeRouterState({ topic: longTopic }));

      const topicSpan = screen.getByTitle(longTopic);
      expect(topicSpan).toBeInTheDocument();
      expect(topicSpan).toHaveClass("truncate");
    });
  });

  describe("429 error", () => {
    it('shows "server busy" message via SSE error', async () => {
      mockFetchEventSource.mockImplementation(async (_url: string, opts: Record<string, unknown>) => {
        const onopen = opts.onopen as (response: { ok: boolean; status: number }) => Promise<void>;
        await onopen({ ok: false, status: 429 });
      });

      const { connectSSE } = await import("@/lib/sse");
      const onError = vi.fn();
      const controller = new AbortController();

      connectSSE({
        topic: "test",
        depth: "quick",
        signal: controller.signal,
        onEvent: vi.fn(),
        onError,
      });

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith(
          expect.objectContaining({ message: expect.stringMatching(/busy/i) })
        );
      });
    });
  });

  describe("backend unavailable", () => {
    it("shows connection error with API URL", async () => {
      mockFetchEventSource.mockImplementation(async (_url: string, opts: Record<string, unknown>) => {
        const onerror = opts.onerror as (err: Error) => void;
        try {
          onerror(new TypeError("Failed to fetch"));
        } catch {
          // expected throw to prevent retry
        }
      });

      const { connectSSE } = await import("@/lib/sse");
      const onError = vi.fn();
      const controller = new AbortController();

      connectSSE({
        topic: "test",
        depth: "quick",
        signal: controller.signal,
        onEvent: vi.fn(),
        onError,
      });

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining("localhost:8000"),
          })
        );
      });
    });
  });
});
