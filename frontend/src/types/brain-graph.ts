export type GraphNodeType = "stage" | "source" | "concept";

export type ContentCategory = "academic" | "news" | "docs" | "media" | "other";

export interface StageNodeData {
  id: string;
  type: "stage";
  label: "SEARCH" | "EVALUATE" | "EXTRACT" | "SYNTHESIZE";
  state: "idle" | "active" | "complete";
  fx: number;
  fy: number;
}

export interface SourceNodeData {
  id: string;
  type: "source";
  url: string;
  title: string;
  score: number;
  contentCategory: ContentCategory;
  radius: number;
  opacity: number;
}

export interface ConceptNodeData {
  id: string;
  type: "concept";
  name: string;
  mentionCount: number;
  radius: number;
}

export type GraphNode = (StageNodeData | SourceNodeData | ConceptNodeData) & {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
};

export interface GraphLink {
  source: string;
  target: string;
  type: "spine" | "source-to-stage" | "concept-to-source";
}

export interface BrainGraphState {
  nodes: GraphNode[];
  links: GraphLink[];
  phase: "idle" | "streaming" | "settling" | "collapsed" | "expanded";
}

export interface SerializedGraphSnapshot {
  nodes: Array<{
    id: string;
    type: GraphNodeType;
    label?: string;
    title?: string;
    name?: string;
    x: number;
    y: number;
    radius?: number;
    contentCategory?: ContentCategory;
    score?: number;
    state?: string;
  }>;
  links: GraphLink[];
  nodeCount: number;
  linkCount: number;
}
