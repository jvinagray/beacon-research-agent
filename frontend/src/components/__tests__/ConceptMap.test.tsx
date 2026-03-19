import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import ConceptMap from "../ConceptMap";

describe("ConceptMap component", () => {
  it('renders "No concept map data available" when data is empty', () => {
    render(<ConceptMap data="" />);
    expect(screen.getByText(/no concept map data available/i)).toBeInTheDocument();
  });

  it("renders MarkdownViewer fallback when data can't be parsed", () => {
    render(<ConceptMap data="not a valid concept map format at all" />);
    expect(screen.getByText(/could not visualize/i)).toBeInTheDocument();
  });

  it("renders MindMapNode tree when data parses successfully", () => {
    const md = `- **Main Topic**
  - Sub A
  - Sub B`;
    render(<ConceptMap data={md} />);
    expect(screen.getByText("Main Topic")).toBeInTheDocument();
    expect(screen.getByText("Sub A")).toBeInTheDocument();
    expect(screen.getByText("Sub B")).toBeInTheDocument();
  });

  it("displays full text content of root node (no truncation)", () => {
    const md = "- This Is A Very Long Node Name That Should Not Be Truncated At All";
    render(<ConceptMap data={md} />);
    expect(
      screen.getByText("This Is A Very Long Node Name That Should Not Be Truncated At All")
    ).toBeInTheDocument();
  });

  it("scrollable container is present with correct classes", () => {
    const md = "- Root\n  - Child";
    const { container } = render(<ConceptMap data={md} />);
    const scrollContainer = container.querySelector(".overflow-y-auto");
    expect(scrollContainer).toBeInTheDocument();
  });
});
