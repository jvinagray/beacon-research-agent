import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import SourceCard from "../SourceCard";
import type { EvaluatedSource } from "@/types/research";

type SourceCardSource = Omit<EvaluatedSource, "deep_read_content">;

function makeSource(overrides: Partial<SourceCardSource> = {}): SourceCardSource {
  return {
    url: "https://example.com/article",
    title: "Test Article",
    snippet: "A snippet of content",
    signals: {
      learning_efficiency_score: 7,
      content_type: "tutorial",
      time_estimate_minutes: 10,
      recency: "2024-06-15",
      key_insight: "This is a key insight",
      coverage: ["React", "TypeScript"],
      evaluation_failed: false,
    },
    extraction_method: "html",
    ...overrides,
  };
}

describe("SourceCard", () => {
  it("renders title as link to source URL (opens new tab)", () => {
    render(<SourceCard source={makeSource()} />);

    const link = screen.getByRole("link", { name: /test article/i });
    expect(link).toHaveAttribute("href", "https://example.com/article");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("score badge shows green glow for scores 8-10", () => {
    render(
      <SourceCard
        source={makeSource({
          signals: {
            ...makeSource().signals,
            learning_efficiency_score: 9,
          },
        })}
      />
    );

    const badge = screen.getByTestId("score-badge");
    expect(badge).toHaveTextContent("9");
    expect(badge.className).toMatch(/green/);
  });

  it("score badge shows yellow glow for scores 5-7", () => {
    render(
      <SourceCard
        source={makeSource({
          signals: {
            ...makeSource().signals,
            learning_efficiency_score: 6,
          },
        })}
      />
    );

    const badge = screen.getByTestId("score-badge");
    expect(badge).toHaveTextContent("6");
    expect(badge.className).toMatch(/yellow/);
  });

  it("score badge shows red glow for scores 0-4", () => {
    render(
      <SourceCard
        source={makeSource({
          signals: {
            ...makeSource().signals,
            learning_efficiency_score: 2,
          },
        })}
      />
    );

    const badge = screen.getByTestId("score-badge");
    expect(badge).toHaveTextContent("2");
    expect(badge.className).toMatch(/red/);
  });

  it('evaluation_failed source shows "Failed" badge instead of score', () => {
    render(
      <SourceCard
        source={makeSource({
          signals: {
            ...makeSource().signals,
            evaluation_failed: true,
            learning_efficiency_score: 0,
          },
        })}
      />
    );

    const badge = screen.getByTestId("score-badge");
    expect(badge).toHaveTextContent("Failed");
    expect(badge.className).not.toMatch(/green|yellow|red/);
  });

  it("renders content type tag", () => {
    render(<SourceCard source={makeSource()} />);
    expect(screen.getByText("tutorial")).toBeInTheDocument();
  });

  it('renders time estimate in "~N min read" format', () => {
    render(<SourceCard source={makeSource()} />);
    expect(screen.getByText("~10 min read")).toBeInTheDocument();
  });

  it("renders key insight text", () => {
    render(<SourceCard source={makeSource()} />);
    expect(screen.getByText("This is a key insight")).toBeInTheDocument();
  });

  it("expandable section shows coverage topics, recency, snippet", async () => {
    const user = userEvent.setup();
    render(
      <SourceCard
        source={makeSource({
          signals: {
            ...makeSource().signals,
            coverage: ["React", "TypeScript"],
            recency: "2024-06-15",
          },
          snippet: "A detailed snippet",
        })}
      />
    );

    const moreButton = screen.getByRole("button", { name: /more/i });
    await user.click(moreButton);

    expect(screen.getByText(/React/)).toBeInTheDocument();
    expect(screen.getByText(/TypeScript/)).toBeInTheDocument();
    expect(screen.getByText(/2024-06-15/)).toBeInTheDocument();
    expect(screen.getByText(/A detailed snippet/)).toBeInTheDocument();
  });
});
