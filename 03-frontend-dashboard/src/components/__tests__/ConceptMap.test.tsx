import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import ConceptMap, { parseConceptMap } from "../ConceptMap";

// Mock react-d3-tree since it needs DOM measurements
vi.mock("react-d3-tree", () => ({
  default: ({ data }: { data: unknown }) => (
    <div data-testid="mock-tree">{JSON.stringify(data)}</div>
  ),
}));

describe("parseConceptMap", () => {
  it("parses indented bullet list into tree data structure", () => {
    const md = `- **Root**
  - Child A
  - Child B`;
    const result = parseConceptMap(md);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Root");
    expect(result!.children).toHaveLength(2);
    expect(result!.children![0].name).toBe("Child A");
    expect(result!.children![1].name).toBe("Child B");
  });

  it("handles bold top-level concepts (**Concept**)", () => {
    const md = `- **Bold Concept**
  - sub item`;
    const result = parseConceptMap(md);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Bold Concept");
  });

  it("handles nested indentation (2-space)", () => {
    const md = `- **Root**
  - Level 1
    - Level 2
      - Level 3`;
    const result = parseConceptMap(md);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Root");
    expect(result!.children![0].name).toBe("Level 1");
    expect(result!.children![0].children![0].name).toBe("Level 2");
    expect(result!.children![0].children![0].children![0].name).toBe("Level 3");
  });

  it("handles nested indentation (4-space)", () => {
    const md = `- **Root**
    - Level 1
        - Level 2`;
    const result = parseConceptMap(md);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Root");
    expect(result!.children).toHaveLength(1);
    expect(result!.children![0].name).toBe("Level 1");
    expect(result!.children![0].children![0].name).toBe("Level 2");
  });

  it("returns null for empty input", () => {
    expect(parseConceptMap("")).toBeNull();
    expect(parseConceptMap("   ")).toBeNull();
  });

  it("wraps multiple top-level nodes in a root", () => {
    const md = `- **Concept A**
  - Sub A
- **Concept B**
  - Sub B`;
    const result = parseConceptMap(md);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Concept Map");
    expect(result!.children).toHaveLength(2);
    expect(result!.children![0].name).toBe("Concept A");
    expect(result!.children![1].name).toBe("Concept B");
  });

  it("handles missing bold formatting", () => {
    const md = `- Plain Root
  - Child`;
    const result = parseConceptMap(md);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Plain Root");
  });
});

describe("ConceptMap component", () => {
  it("falls back to MarkdownViewer when parsing fails", () => {
    render(<ConceptMap data="not a valid concept map format at all" />);
    // Fallback should render the raw text
    expect(screen.getByText(/could not visualize/i)).toBeInTheDocument();
  });

  it("handles empty concept map data", () => {
    render(<ConceptMap data="" />);
    expect(screen.getByText(/no concept map data available/i)).toBeInTheDocument();
  });

  it("renders tree with correct node labels", () => {
    const md = `- **Main Topic**
  - Sub A
  - Sub B`;
    render(<ConceptMap data={md} />);
    const tree = screen.getByTestId("mock-tree");
    expect(tree).toBeInTheDocument();
    expect(tree.textContent).toContain("Main Topic");
    expect(tree.textContent).toContain("Sub A");
    expect(tree.textContent).toContain("Sub B");
  });
});
