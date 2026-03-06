import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import ConflictCard from "../ConflictCard";
import type { Conflict } from "@/types/research";

function makeConflict(overrides: Partial<Conflict> = {}): Conflict {
  return {
    topic: "Effectiveness of X",
    source_a: { title: "Paper A", claim: "X improves by 40%" },
    source_b: { title: "Report B", claim: "No significant improvement" },
    assessment: "Different methodologies explain the discrepancy",
    ...overrides,
  };
}

describe("ConflictCard", () => {
  it("renders topic heading", () => {
    render(<ConflictCard conflict={makeConflict()} />);
    expect(screen.getByText("Effectiveness of X")).toBeInTheDocument();
  });

  it("renders source_a title and claim", () => {
    render(<ConflictCard conflict={makeConflict()} />);
    expect(screen.getByText("Paper A")).toBeInTheDocument();
    expect(screen.getByText("X improves by 40%")).toBeInTheDocument();
  });

  it("renders source_b title and claim", () => {
    render(<ConflictCard conflict={makeConflict()} />);
    expect(screen.getByText("Report B")).toBeInTheDocument();
    expect(screen.getByText("No significant improvement")).toBeInTheDocument();
  });

  it("renders assessment text", () => {
    render(<ConflictCard conflict={makeConflict()} />);
    expect(
      screen.getByText("Different methodologies explain the discrepancy")
    ).toBeInTheDocument();
  });

  it("shows AlertTriangle icon (check for SVG element)", () => {
    const { container } = render(<ConflictCard conflict={makeConflict()} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });
});
