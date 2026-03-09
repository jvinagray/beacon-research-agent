import type { ConceptNodeData, GraphLink } from "@/types/brain-graph";
import type { EvaluatedSource } from "@/types/research";

export function extractConcepts(
  _conceptMapMarkdown: string
): ConceptNodeData[] {
  throw new Error("Skeleton - implement in Section 05");
}

export function buildConceptSourceEdges(
  _concepts: ConceptNodeData[],
  _sources: EvaluatedSource[]
): GraphLink[] {
  throw new Error("Skeleton - implement in Section 05");
}
