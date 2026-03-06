import { describe, it, expect } from "vitest";
import { parseConceptMap } from "../conceptMapParser";

describe("parseConceptMap", () => {
  it("returns null for empty string", () => {
    expect(parseConceptMap("")).toBeNull();
  });

  it("parses single root with children", () => {
    const md = "- Root\n  - Child A\n  - Child B";
    const result = parseConceptMap(md);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Root");
    expect(result!.children).toHaveLength(2);
    expect(result!.children![0].name).toBe("Child A");
    expect(result!.children![1].name).toBe("Child B");
  });

  it("handles multi-root input (wraps in 'Concept Map' root)", () => {
    const md = "- Root A\n- Root B";
    const result = parseConceptMap(md);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Concept Map");
    expect(result!.children).toHaveLength(2);
  });

  it("strips bold markers from text", () => {
    const md = "- **Bold Root**\n  - Child";
    const result = parseConceptMap(md);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Bold Root");
  });

  it("handles mixed 2-space and 4-space indentation", () => {
    const md = "- Root\n    - Level 1\n        - Level 2";
    const result = parseConceptMap(md);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Root");
    expect(result!.children![0].name).toBe("Level 1");
    expect(result!.children![0].children![0].name).toBe("Level 2");
  });
});
