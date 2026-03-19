import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import AssumptionCard from "../AssumptionCard";
import type { Assumption } from "@/types/research";

function makeAssumption(overrides: Partial<Assumption> = {}): Assumption {
  return {
    assumption: "Hardware trends continue at same pace",
    why_it_matters: "Feasibility depends on continued scaling",
    sources_relying: ["Tech Roadmap", "Industry Analysis"],
    risk_level: "medium",
    ...overrides,
  };
}

describe("AssumptionCard", () => {
  it("renders assumption text as heading", () => {
    render(<AssumptionCard assumption={makeAssumption()} />);
    expect(
      screen.getByText("Hardware trends continue at same pace")
    ).toBeInTheDocument();
  });

  it("renders why_it_matters section", () => {
    render(<AssumptionCard assumption={makeAssumption()} />);
    expect(
      screen.getByText("Feasibility depends on continued scaling")
    ).toBeInTheDocument();
  });

  it("renders risk_level badge with correct color (high=red, medium=yellow, low=green)", () => {
    const { rerender } = render(
      <AssumptionCard assumption={makeAssumption({ risk_level: "high" })} />
    );
    let badge = screen.getByText("high");
    expect(badge.className).toContain("text-score-red");

    rerender(
      <AssumptionCard assumption={makeAssumption({ risk_level: "medium" })} />
    );
    badge = screen.getByText("medium");
    expect(badge.className).toContain("text-score-yellow");

    rerender(
      <AssumptionCard assumption={makeAssumption({ risk_level: "low" })} />
    );
    badge = screen.getByText("low");
    expect(badge.className).toContain("text-score-green");
  });

  it("renders sources_relying as inline badges", () => {
    render(<AssumptionCard assumption={makeAssumption()} />);
    expect(screen.getByText("Tech Roadmap")).toBeInTheDocument();
    expect(screen.getByText("Industry Analysis")).toBeInTheDocument();
  });

  it("shows Lightbulb icon (check for SVG element)", () => {
    const { container } = render(
      <AssumptionCard assumption={makeAssumption()} />
    );
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });
});
