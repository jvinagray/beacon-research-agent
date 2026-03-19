import { useReducer, useRef, useEffect, useCallback } from 'react';
import { connectSSE } from '../lib/sse';
import { normalizeArtifact } from '../lib/artifacts';
import type { ResearchState, ResearchAction, SSEEvent } from '../types/research';

export const initialState: ResearchState = {
  status: 'idle',
  statusMessage: '',
  topic: '',
  depth: '',
  sources: [],
  sourceTotal: 0,
  artifacts: {},
  sessionId: null,
  summary: null,
  error: null,
};

export function researchReducer(
  state: ResearchState,
  action: ResearchAction
): ResearchState {
  switch (action.type) {
    case 'START_RESEARCH':
      return {
        ...initialState,
        status: 'loading',
        topic: action.topic,
        depth: action.depth,
      };

    case 'STATUS_UPDATE':
      return {
        ...state,
        status: state.status === 'loading' ? 'streaming' : state.status,
        statusMessage: action.message,
      };

    case 'SOURCES_FOUND':
      return {
        ...state,
        sourceTotal: action.total,
      };

    case 'SOURCE_EVALUATED': {
      const sources = [...state.sources, action.source].sort((a, b) => {
        if (a.signals.evaluation_failed && !b.signals.evaluation_failed) return 1;
        if (!a.signals.evaluation_failed && b.signals.evaluation_failed) return -1;
        return b.signals.learning_efficiency_score - a.signals.learning_efficiency_score;
      });
      return { ...state, sources };
    }

    case 'ARTIFACT_RECEIVED': {
      const normalized = normalizeArtifact(action.artifact_type, action.data);
      if (normalized === null) return state;
      return {
        ...state,
        artifacts: { ...state.artifacts, [action.artifact_type]: normalized },
      };
    }

    case 'ERROR':
      if (action.recoverable) {
        return {
          ...state,
          statusMessage: `${state.statusMessage} [Warning: ${action.message}]`,
        };
      }
      return {
        ...state,
        status: 'error',
        error: { message: action.message, recoverable: false },
      };

    case 'COMPLETE':
      return {
        ...state,
        status: 'complete',
        sessionId: action.sessionId,
        summary: action.summary,
      };

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}

function mapSSEEventToAction(event: SSEEvent): ResearchAction | null {
  switch (event.type) {
    case 'status':
      return { type: 'STATUS_UPDATE', message: event.message };
    case 'sources_found':
      return { type: 'SOURCES_FOUND', total: event.count };
    case 'source_evaluated':
      return { type: 'SOURCE_EVALUATED', source: event.source };
    case 'artifact':
      return {
        type: 'ARTIFACT_RECEIVED',
        artifact_type: event.artifact_type,
        data: event.data,
      };
    case 'error':
      return {
        type: 'ERROR',
        message: event.message,
        recoverable: event.recoverable,
      };
    case 'complete':
      return {
        type: 'COMPLETE',
        sessionId: event.session_id,
        summary: event.summary,
      };
    default:
      return null;
  }
}

export function useResearch(): {
  state: ResearchState;
  startResearch: (topic: string, depth: string) => void;
  reset: () => void;
} {
  const [state, dispatch] = useReducer(researchReducer, initialState);
  const abortControllerRef = useRef<AbortController | null>(null);

  const startResearch = useCallback((topic: string, depth: string) => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    dispatch({ type: 'START_RESEARCH', topic, depth });

    connectSSE({
      topic,
      depth,
      signal: controller.signal,
      onEvent: (event) => {
        const action = mapSSEEventToAction(event);
        if (action) dispatch(action);
      },
      onError: (error) =>
        dispatch({ type: 'ERROR', message: error.message, recoverable: false }),
    });
  }, []);

  const reset = useCallback(() => {
    abortControllerRef.current?.abort();
    dispatch({ type: 'RESET' });
  }, []);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  return { state, startResearch, reset };
}
