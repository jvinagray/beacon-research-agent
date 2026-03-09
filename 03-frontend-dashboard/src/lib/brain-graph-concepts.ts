import type { ConceptNodeData, GraphLink } from "@/types/brain-graph";
import type { EvaluatedSource } from "@/types/research";
import { parseConceptMap } from "@/lib/conceptMapParser";
import { lerp } from "@/lib/brain-graph-utils";

export function extractConcepts(conceptMapMarkdown: string): string[] {
  try {
    const root = parseConceptMap(conceptMapMarkdown);
    if (!root) return [];

    const names = root.children
      ? root.children.map((c) => c.name)
      : [root.name];

    return names.slice(0, 12);
  } catch {
    return [];
  }
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const setB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  if (setA.size === 0 && setB.size === 0) return 0;

  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function buildConceptSourceEdges(
  conceptNames: string[],
  sources: EvaluatedSource[],
): { concepts: ConceptNodeData[]; edges: GraphLink[] } {
  if (conceptNames.length === 0) return { concepts: [], edges: [] };

  // Find matching sources for each concept
  const matchMap = new Map<string, EvaluatedSource[]>();

  for (const name of conceptNames) {
    const nameLower = name.toLowerCase();
    const matched: EvaluatedSource[] = [];

    for (const source of sources) {
      const titleLower = source.title.toLowerCase();
      const isSubstring =
        titleLower.includes(nameLower) || nameLower.includes(titleLower);
      const isJaccardMatch = jaccardSimilarity(name, source.title) > 0.3;

      if (isSubstring || isJaccardMatch) {
        matched.push(source);
      }
    }

    matchMap.set(name, matched);
  }

  // Check if fallback is needed
  const matchedCount = [...matchMap.values()].filter((m) => m.length > 0).length;
  const useFallback = matchedCount < conceptNames.length * 0.5;

  const concepts: ConceptNodeData[] = [];
  const edges: GraphLink[] = [];

  if (useFallback) {
    // Fallback: connect all to SYNTHESIZE stage
    for (const name of conceptNames) {
      const id = `concept-${slugify(name)}`;
      concepts.push({
        id,
        type: "concept",
        name,
        mentionCount: 1,
        radius: lerp(12, 30, 1),
      });
      edges.push({
        source: id,
        target: "stage-synthesize",
        type: "concept-to-source",
      });
    }
  } else {
    // Normal path
    const maxMentionCount = Math.max(
      1,
      ...conceptNames.map((n) => matchMap.get(n)!.length),
    );

    for (const name of conceptNames) {
      const matched = matchMap.get(name)!;
      const id = `concept-${slugify(name)}`;
      const mentionCount = matched.length;

      concepts.push({
        id,
        type: "concept",
        name,
        mentionCount,
        radius: lerp(12, 30, mentionCount / maxMentionCount),
      });

      if (matched.length > 0) {
        for (const source of matched) {
          edges.push({
            source: id,
            target: source.url,
            type: "concept-to-source",
          });
        }
      } else {
        // Orphan concept: connect to SYNTHESIZE so it doesn't float
        edges.push({
          source: id,
          target: "stage-synthesize",
          type: "concept-to-source",
        });
      }
    }
  }

  return { concepts, edges };
}
