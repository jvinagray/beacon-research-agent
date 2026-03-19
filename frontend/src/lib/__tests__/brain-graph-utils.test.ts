import { describe, it, expect } from "vitest";
import {
  mapContentType,
  lerp,
  getContentColor,
  computeSourceRadius,
  computeSourceOpacity,
  CONTENT_CATEGORY_COLORS,
} from "@/lib/brain-graph-utils";

describe("mapContentType", () => {
  it('maps "paper" to "academic"', () => {
    expect(mapContentType("paper")).toBe("academic");
  });

  it('maps "opinion" to "news"', () => {
    expect(mapContentType("opinion")).toBe("news");
  });

  it('maps "forum" to "news"', () => {
    expect(mapContentType("forum")).toBe("news");
  });

  it('maps "docs" to "docs"', () => {
    expect(mapContentType("docs")).toBe("docs");
  });

  it('maps "tutorial" to "docs"', () => {
    expect(mapContentType("tutorial")).toBe("docs");
  });

  it('maps "course" to "docs"', () => {
    expect(mapContentType("course")).toBe("docs");
  });

  it('maps "repository" to "media"', () => {
    expect(mapContentType("repository")).toBe("media");
  });

  it('maps "video" to "media"', () => {
    expect(mapContentType("video")).toBe("media");
  });

  it('maps "other" to "other"', () => {
    expect(mapContentType("other")).toBe("other");
  });

  it("handles unknown type gracefully (returns 'other')", () => {
    expect(mapContentType("unknown_xyz")).toBe("other");
  });
});

describe("lerp", () => {
  it("lerp(8, 24, 0) returns 8 (min score)", () => {
    expect(lerp(8, 24, 0)).toBe(8);
  });

  it("lerp(8, 24, 1) returns 24 (max score)", () => {
    expect(lerp(8, 24, 1)).toBe(24);
  });

  it("lerp(8, 24, 0.5) returns 16 (midpoint)", () => {
    expect(lerp(8, 24, 0.5)).toBe(16);
  });
});

describe("getContentColor", () => {
  it("returns correct color string for each category", () => {
    expect(getContentColor("academic")).toBe(CONTENT_CATEGORY_COLORS.academic);
    expect(getContentColor("news")).toBe(CONTENT_CATEGORY_COLORS.news);
    expect(getContentColor("docs")).toBe(CONTENT_CATEGORY_COLORS.docs);
    expect(getContentColor("media")).toBe(CONTENT_CATEGORY_COLORS.media);
    expect(getContentColor("other")).toBe(CONTENT_CATEGORY_COLORS.other);
  });
});

describe("computeSourceRadius", () => {
  it("maps score 0 → 8, score 10 → 24", () => {
    expect(computeSourceRadius(0)).toBe(8);
    expect(computeSourceRadius(10)).toBe(24);
  });
});

describe("computeSourceOpacity", () => {
  it("returns 0.4 for score < 3, 1.0 for score >= 3", () => {
    expect(computeSourceOpacity(0)).toBe(0.4);
    expect(computeSourceOpacity(2)).toBe(0.4);
    expect(computeSourceOpacity(2.9)).toBe(0.4);
    expect(computeSourceOpacity(3)).toBe(1.0);
    expect(computeSourceOpacity(10)).toBe(1.0);
  });
});
