import type { ResearchState, EvaluatedSource } from '../types/research';
import type { SerializedGraphSnapshot } from '../types/brain-graph';

export interface PreparedRouterState {
  topic: string;
  depth: string;
  sources: Array<Omit<EvaluatedSource, 'deep_read_content'>>;
  artifacts: Record<string, string | object>;
  sessionId: string | null;
  sourceTotal: number;
  brainGraphSnapshot?: SerializedGraphSnapshot;
}

export function prepareRouterState(
  state: ResearchState,
  brainGraphSnapshot?: SerializedGraphSnapshot,
): PreparedRouterState {
  return {
    topic: state.topic,
    depth: state.depth,
    sources: state.sources.map(({ deep_read_content, ...rest }) => rest),
    artifacts: state.artifacts,
    sessionId: state.sessionId,
    sourceTotal: state.sourceTotal,
    brainGraphSnapshot,
  };
}
