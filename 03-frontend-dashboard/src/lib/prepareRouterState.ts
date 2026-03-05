import type { ResearchState, EvaluatedSource } from '../types/research';

export interface PreparedRouterState {
  topic: string;
  depth: string;
  sources: Array<Omit<EvaluatedSource, 'deep_read_content'>>;
  artifacts: Record<string, string | object>;
  sessionId: string | null;
  sourceTotal: number;
}

export function prepareRouterState(state: ResearchState): PreparedRouterState {
  return {
    topic: state.topic,
    depth: state.depth,
    sources: state.sources.map(({ deep_read_content, ...rest }) => rest),
    artifacts: state.artifacts,
    sessionId: state.sessionId,
    sourceTotal: state.sourceTotal,
  };
}
