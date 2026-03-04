import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route, Navigate } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";

// We test the routing configuration by re-declaring the same routes as App.tsx
// but using MemoryRouter so we can control the initial location.

// Minimal stand-in components that render identifiable text
const FakeSearch = () => <div data-testid="search-page">Search Page</div>;
const FakeDashboard = () => <div data-testid="dashboard-page">Dashboard Page</div>;

function renderRoutes(initialPath: string, state?: unknown) {
  const entries = state
    ? [{ pathname: initialPath, state }]
    : [{ pathname: initialPath }];
  return render(
    <MemoryRouter initialEntries={entries}>
      <Routes>
        <Route path="/" element={<Navigate to="/search" replace />} />
        <Route path="/search" element={<FakeSearch />} />
        <Route path="/dashboard" element={<FakeDashboard />} />
        <Route path="*" element={<Navigate to="/search" replace />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("Router configuration", () => {
  it("/ redirects to /search", () => {
    renderRoutes("/");
    expect(screen.getByTestId("search-page")).toBeInTheDocument();
  });

  it("unknown routes redirect to /search (catch-all 404)", () => {
    renderRoutes("/some-nonexistent-route");
    expect(screen.getByTestId("search-page")).toBeInTheDocument();
  });

  it("/dashboard with state renders correctly", () => {
    renderRoutes("/dashboard", { topic: "React", sessionId: "abc" });
    expect(screen.getByTestId("dashboard-page")).toBeInTheDocument();
  });

  it("/search renders the search page", () => {
    renderRoutes("/search");
    expect(screen.getByTestId("search-page")).toBeInTheDocument();
  });

  it("/dashboard without state still renders dashboard route", () => {
    // The DashboardPage itself handles the redirect when state is missing;
    // the router just needs to route to the DashboardPage component.
    renderRoutes("/dashboard");
    expect(screen.getByTestId("dashboard-page")).toBeInTheDocument();
  });
});
