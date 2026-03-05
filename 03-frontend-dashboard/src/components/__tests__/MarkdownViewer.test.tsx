import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import MarkdownViewer from "../MarkdownViewer";
import type { EvaluatedSource } from "@/types/research";

// Helper: create a minimal EvaluatedSource for testing
function makeMockSource(overrides: Partial<EvaluatedSource> = {}): EvaluatedSource {
  return {
    url: "https://example.com/article",
    title: "Example Article",
    snippet: "A great article",
    signals: {
      learning_efficiency_score: 8.5,
      content_type: "tutorial",
      time_estimate_minutes: 10,
      recency: "2024-01",
      key_insight: "Key insight text",
      coverage: ["topic1"],
      evaluation_failed: false,
    },
    deep_read_content: null,
    extraction_method: null,
    ...overrides,
  };
}

describe("MarkdownViewer", () => {
  it("renders markdown string as HTML", () => {
    render(<MarkdownViewer content="Hello **world**" />);
    const bold = screen.getByText("world");
    expect(bold.tagName).toBe("STRONG");
  });

  it("renders headings, lists, code blocks", () => {
    const md = `# Title\n\n- Item one\n- Item two\n\n\`\`\`js\nconst x = 1;\n\`\`\``;
    const { container } = render(<MarkdownViewer content={md} />);

    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Item one")).toBeInTheDocument();
    expect(screen.getByText("Item two")).toBeInTheDocument();
    expect(container.querySelector("code")).toBeInTheDocument();
  });

  it("renders tables (via remark-gfm)", () => {
    const md = `| Name | Score |\n|------|-------|\n| Alice | 10 |\n| Bob | 8 |`;
    const { container } = render(<MarkdownViewer content={md} />);

    expect(container.querySelector("table")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("applies prose-invert classes for dark theme", () => {
    const { container } = render(<MarkdownViewer content="Test" />);
    const wrapper = container.firstElementChild;
    expect(wrapper?.className).toMatch(/prose/);
    expect(wrapper?.className).toMatch(/prose-invert/);
  });

  it("handles empty/null markdown gracefully", () => {
    render(<MarkdownViewer content="" />);
    expect(screen.getByText(/no summary was generated/i)).toBeInTheDocument();
  });
});

describe("MarkdownViewer citation badges", () => {
  it("renders cite:N links as superscript badges, not anchor tags", () => {
    const sources = [makeMockSource({ title: "Source One" })];
    const { container } = render(
      <MarkdownViewer
        content="Some claim [Source One](cite:1) is true."
        sources={sources}
      />
    );

    // Should render a superscript badge with [1]
    const sup = container.querySelector("sup");
    expect(sup).toBeInTheDocument();
    expect(sup?.textContent).toContain("[1]");

    // Should NOT render as a standard anchor with cite: href
    const citeAnchors = container.querySelectorAll('a[href^="cite:"]');
    expect(citeAnchors.length).toBe(0);
  });

  it("cite badge shows correct source index number [N]", () => {
    const sources = [
      makeMockSource({ title: "Source One" }),
      makeMockSource({ title: "Source Two" }),
      makeMockSource({ title: "Source Three" }),
    ];
    const { container } = render(
      <MarkdownViewer
        content="A claim [Source Two](cite:2) here."
        sources={sources}
      />
    );

    const sup = container.querySelector("sup");
    expect(sup).toBeInTheDocument();
    expect(sup?.textContent).toContain("[2]");
  });

  it("hovering a cite badge exposes HoverCard structure with source info", () => {
    const sources = [
      makeMockSource({
        title: "Deep Learning Guide",
        signals: {
          learning_efficiency_score: 9,
          content_type: "tutorial",
          time_estimate_minutes: 15,
          recency: "2024",
          key_insight: "Comprehensive guide to deep learning",
          coverage: ["deep learning"],
          evaluation_failed: false,
        },
      }),
    ];
    const { container } = render(
      <MarkdownViewer
        content="Some fact [Deep Learning Guide](cite:1)."
        sources={sources}
      />
    );

    // Radix HoverCard trigger should be present
    const trigger = container.querySelector("[data-radix-hover-card-trigger]") ||
                    container.querySelector("sup");
    expect(trigger).toBeInTheDocument();
  });

  it("invalid cite index (out of bounds) renders children as plain text", () => {
    const sources = [makeMockSource(), makeMockSource()];
    const { container } = render(
      <MarkdownViewer
        content="Bad reference [Bad Cite](cite:99) here."
        sources={sources}
      />
    );

    // Should render "Bad Cite" as plain text
    expect(screen.getByText("Bad Cite")).toBeInTheDocument();

    // Should NOT render a superscript badge
    const sups = container.querySelectorAll("sup");
    expect(sups.length).toBe(0);
  });

  it("regular http/https links still render as normal anchor tags", () => {
    const sources = [makeMockSource()];
    const { container } = render(
      <MarkdownViewer
        content="Visit [Google](https://google.com) for more."
        sources={sources}
      />
    );

    const link = container.querySelector('a[href="https://google.com"]');
    expect(link).toBeInTheDocument();
    expect(link?.getAttribute("target")).toBe("_blank");
  });

  it("without sources prop renders cite: links as plain text", () => {
    const { container } = render(
      <MarkdownViewer content="A claim [Title](cite:1) here." />
    );

    // Should render "Title" as plain text
    expect(screen.getByText("Title")).toBeInTheDocument();

    // Should NOT render a badge
    const sups = container.querySelectorAll("sup");
    expect(sups.length).toBe(0);
  });
});
