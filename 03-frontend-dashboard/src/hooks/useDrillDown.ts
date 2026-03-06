import { useReducer, useCallback, useRef, useEffect } from 'react';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { API_BASE_URL } from '../config';

export interface DrillDownSession {
  id: string;
  concept: string;
  content: string;
  isStreaming: boolean;
  parentId: string | null;
  depth: number;
}

interface DrillDownState {
  sessions: DrillDownSession[];
}

type DrillDownAction =
  | { type: 'ADD_SESSION'; session: DrillDownSession }
  | { type: 'STREAM_DELTA'; id: string; content: string }
  | { type: 'STREAM_DONE'; id: string }
  | { type: 'STREAM_ERROR'; id: string };

function drillDownReducer(state: DrillDownState, action: DrillDownAction): DrillDownState {
  switch (action.type) {
    case 'ADD_SESSION':
      return { ...state, sessions: [...state.sessions, action.session] };

    case 'STREAM_DELTA':
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.id === action.id ? { ...s, content: s.content + action.content } : s
        ),
      };

    case 'STREAM_DONE':
    case 'STREAM_ERROR':
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.id === action.id ? { ...s, isStreaming: false } : s
        ),
      };

    default:
      return state;
  }
}

const MAX_DEPTH = 3;
const MAX_SESSIONS = 10;

export function useDrillDown(sessionId: string | null) {
  const [state, dispatch] = useReducer(drillDownReducer, { sessions: [] });
  const abortControllers = useRef<Map<string, AbortController>>(new Map());
  const sessionsRef = useRef<DrillDownSession[]>([]);

  // Keep ref in sync with state for use in stable callback
  sessionsRef.current = state.sessions;

  const startDrillDown = useCallback(
    (concept: string, parentId?: string): 'ok' | 'max-depth' | 'max-sessions' => {
      if (!sessionId) return 'ok';

      const currentSessions = sessionsRef.current;

      // Deduplicate: reject if same concept+parent already exists
      const duplicate = currentSessions.find(
        (s) => s.concept === concept && s.parentId === (parentId ?? null)
      );
      if (duplicate) return 'ok';

      // Compute depth
      let depth = 0;
      if (parentId) {
        const parent = currentSessions.find((s) => s.id === parentId);
        depth = parent ? parent.depth + 1 : 0;
      }

      if (depth >= MAX_DEPTH) return 'max-depth';
      if (currentSessions.length >= MAX_SESSIONS) return 'max-sessions';

      const id = crypto.randomUUID();
      const newSession: DrillDownSession = {
        id,
        concept,
        content: '',
        isStreaming: true,
        parentId: parentId ?? null,
        depth,
      };

      dispatch({ type: 'ADD_SESSION', session: newSession });

      const abortController = new AbortController();
      abortControllers.current.set(id, abortController);

      fetchEventSource(`${API_BASE_URL}/api/drilldown/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concept }),
        signal: abortController.signal,

        onmessage(event) {
          if (!event.data) return;
          try {
            const parsed = JSON.parse(event.data);
            switch (parsed.type) {
              case 'delta':
                dispatch({ type: 'STREAM_DELTA', id, content: parsed.content });
                break;
              case 'done':
                dispatch({ type: 'STREAM_DONE', id });
                break;
              case 'error':
                dispatch({ type: 'STREAM_ERROR', id });
                break;
            }
          } catch {
            // Ignore non-JSON messages
          }
        },

        onerror() {
          dispatch({ type: 'STREAM_ERROR', id });
          // Throw to prevent fetchEventSource from retrying
          throw new Error('Stream error');
        },

        onclose() {
          dispatch({ type: 'STREAM_DONE', id });
        },
      }).catch(() => {
        // Error already dispatched via onerror
      }).finally(() => {
        abortControllers.current.delete(id);
      });

      return 'ok';
    },
    [sessionId]
  );

  useEffect(() => {
    return () => {
      abortControllers.current.forEach((controller) => controller.abort());
      abortControllers.current.clear();
    };
  }, []);

  return { sessions: state.sessions, startDrillDown };
}
