import { describe, it, expect } from "vitest";
import { extractConcepts, buildConceptSourceEdges } from "../brain-graph-concepts";
import type { EvaluatedSource } from "@/types/research";

function makeSource(overrides: Partial<EvaluatedSource> = {}): EvaluatedSource {
  return {
    url: "https://example.com/source",
    title: "Default Source Title",
    snippet: "A snippet",
    signals: {
      learning_efficiency_score: 7,
      content_type: "tutorial",
      time_estimate_minutes: 10,
      recency: null,
      key_insight: "insight",
      coverage: [],
      evaluation_failed: false,
    },
    deep_read_content: null,
    extraction_method: null,
    ...overrides,
  };
}

describe("brain-graph-concepts", () => {
  describe("extractConcepts", () => {
    it("returns top-level node names from parsed concept map", () => {
      const md = [
        "- Machine Learning",
        "  - Supervised",
        "  - Unsupervised",
        "- Neural Networks",
        "  - CNN",
        "- Data Science",
        "  - Statistics",
      ].join("\n");

      const result = extractConcepts(md);
      expect(result).toEqual(["Machine Learning", "Neural Networks", "Data Science"]);
    });

    it("caps at 12 concepts", () => {
      const lines = Array.from({ length: 15 }, (_, i) => `- Concept ${i + 1}`);
      const result = extractConcepts(lines.join("\n"));
      expect(result).toHaveLength(12);
    });

    it("handles empty concept map (returns empty array)", () => {
      expect(extractConcepts("")).toEqual([]);
    });

    it("handles malformed markdown (returns empty array, no throw)", () => {
      expect(extractConcepts("just some text\nwith lines")).toEqual([]);
    });

    it("extracts children from a single root node", () => {
      const md = [
        "- Main Topic",
        "  - Child A",
        "  - Child B",
      ].join("\n");

      const result = extractConcepts(md);
      expect(result).toEqual(["Child A", "Child B"]);
    });
  });

  describe("buildConceptSourceEdges", () => {
    it("matches concept name substring in source title", () => {
      const sources = [makeSource({ url: "https://ml.com", title: "Introduction to Machine Learning" })];
      const result = buildConceptSourceEdges(["Machine Learning"], sources);

      expect(result.edges).toContainEqual({
        source: "concept-machine-learning",
        target: "https://ml.com",
        type: "concept-to-source",
      });
    });

    it("matches source title substring in concept name", () => {
      const sources = [makeSource({ url: "https://nn.com", title: "Neural Network" })];
      const result = buildConceptSourceEdges(["Advanced Neural Network Architectures"], sources);

      expect(result.edges).toContainEqual({
        source: "concept-advanced-neural-network-architectures",
        target: "https://nn.com",
        type: "concept-to-source",
      });
    });

    it("computes Jaccard similarity correctly (overlap / union)", () => {
      const sources = [makeSource({ url: "https://dl.com", title: "models for deep learning" })];
      const result = buildConceptSourceEdges(["deep learning models"], sources);

      expect(result.edges).toContainEqual({
        source: "concept-deep-learning-models",
        target: "https://dl.com",
        type: "concept-to-source",
      });
    });

    it("triggers fallback when <50% concepts have matches", () => {
      const concepts = ["Fundamental Principles", "Future Directions", "Core Paradigms", "Abstract Theories"];
      const sources = [
        makeSource({ url: "https://a.com", title: "arxiv.org paper 12345" }),
        makeSource({ url: "https://b.com", title: "arxiv.org paper 67890" }),
        makeSource({ url: "https://c.com", title: "arxiv.org paper 11111" }),
      ];
      const result = buildConceptSourceEdges(concepts, sources);

      // All edges should target stage-synthesize
      for (const edge of result.edges) {
        expect(edge.target).toBe("stage-synthesize");
      }
    });

    it("fallback connects all concepts to SYNTHESIZE stage node", () => {
      const concepts = ["Fundamental Principles", "Future Directions", "Core Paradigms", "Abstract Theories"];
      const sources = [
        makeSource({ url: "https://a.com", title: "arxiv.org paper 12345" }),
      ];
      const result = buildConceptSourceEdges(concepts, sources);

      expect(result.edges).toHaveLength(4);
      for (const edge of result.edges) {
        expect(edge.target).toBe("stage-synthesize");
        expect(edge.type).toBe("concept-to-source");
      }
    });

    it("mentionCount equals number of matched sources per concept", () => {
      const sources = [
        makeSource({ url: "https://r1.com", title: "React Basics" }),
        makeSource({ url: "https://r2.com", title: "Advanced React Patterns" }),
        makeSource({ url: "https://r3.com", title: "React Performance Tips" }),
      ];
      const result = buildConceptSourceEdges(["React"], sources);
      const reactConcept = result.concepts.find((c) => c.name === "React");

      expect(reactConcept?.mentionCount).toBe(3);
    });

    it("fallback sets mentionCount to 1 for all concepts", () => {
      const concepts = ["Fundamental Principles", "Future Directions", "Core Paradigms", "Abstract Theories"];
      const sources = [makeSource({ url: "https://a.com", title: "arxiv.org paper 12345" })];
      const result = buildConceptSourceEdges(concepts, sources);

      for (const concept of result.concepts) {
        expect(concept.mentionCount).toBe(1);
      }
    });

    it("orphan concepts in normal path connect to SYNTHESIZE", () => {
      // 2 out of 3 match (>50%), so normal path is used
      const concepts = ["React Hooks", "Vue Components", "Obscure Framework XYZ"];
      const sources = [
        makeSource({ url: "https://r.com", title: "React Hooks Guide" }),
        makeSource({ url: "https://v.com", title: "Vue Components Tutorial" }),
      ];
      const result = buildConceptSourceEdges(concepts, sources);

      // The unmatched concept should connect to stage-synthesize
      const orphanEdges = result.edges.filter((e) => e.source === "concept-obscure-framework-xyz");
      expect(orphanEdges).toHaveLength(1);
      expect(orphanEdges[0].target).toBe("stage-synthesize");
    });

    it("case-insensitive matching works", () => {
      const sources = [makeSource({ url: "https://ml.com", title: "machine learning basics" })];
      const result = buildConceptSourceEdges(["MACHINE LEARNING"], sources);

      expect(result.edges).toContainEqual({
        source: "concept-machine-learning",
        target: "https://ml.com",
        type: "concept-to-source",
      });
    });
  });
});
