import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import MarkdownViewer from "../MarkdownViewer";

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
