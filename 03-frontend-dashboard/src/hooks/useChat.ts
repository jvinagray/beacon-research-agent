import { useReducer, useCallback, useRef, useEffect } from 'react';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import type { ChatMessage, ChatSSEEvent } from '../types/research';
import { API_BASE_URL } from '../config';

export interface ChatState {
  messages: ChatMessage[];
  isStreaming: boolean;
  error: string | null;
}

export const initialState: ChatState = {
  messages: [],
  isStreaming: false,
  error: null,
};

export type ChatAction =
  | { type: 'SEND_MESSAGE'; message: string }
  | { type: 'STREAM_START' }
  | { type: 'STREAM_DELTA'; content: string }
  | { type: 'STREAM_DONE'; sources: { title: string; url: string }[] }
  | { type: 'ERROR'; message: string }
  | { type: 'RESET' };

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'SEND_MESSAGE':
      return {
        ...state,
        error: null,
        messages: [
          ...state.messages,
          { role: 'user', content: action.message },
          { role: 'assistant', content: '' },
        ],
      };

    case 'STREAM_START':
      return { ...state, isStreaming: true };

    case 'STREAM_DELTA': {
      const messages = [...state.messages];
      const last = messages[messages.length - 1];
      messages[messages.length - 1] = {
        ...last,
        content: last.content + action.content,
      };
      return { ...state, messages };
    }

    case 'STREAM_DONE': {
      const messages = [...state.messages];
      const last = messages[messages.length - 1];
      messages[messages.length - 1] = { ...last, sources: action.sources };
      return { ...state, isStreaming: false, messages };
    }

    case 'ERROR':
      return { ...state, isStreaming: false, error: action.message };

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}

export function useChat(sessionId: string | null) {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (message: string) => {
      if (!sessionId) return;

      abortRef.current?.abort();
      abortRef.current = new AbortController();

      dispatch({ type: 'SEND_MESSAGE', message });

      const history = state.messages.slice(-40).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      let completed = false;

      fetchEventSource(`${API_BASE_URL}/api/chat/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history }),
        signal: abortRef.current.signal,

        async onopen(response) {
          if (response.status === 404) {
            throw new Error('Session expired. Please start a new research first.');
          }
          if (response.status === 429) {
            throw new Error('A chat stream is already active. Please wait.');
          }
          if (!response.ok) {
            throw new Error(`Request failed with status ${response.status}`);
          }
          dispatch({ type: 'STREAM_START' });
        },

        onmessage(event) {
          if (!event.data) return;
          try {
            const parsed = JSON.parse(event.data) as ChatSSEEvent;
            switch (parsed.type) {
              case 'delta':
                dispatch({ type: 'STREAM_DELTA', content: parsed.content });
                break;
              case 'done':
                completed = true;
                dispatch({ type: 'STREAM_DONE', sources: parsed.sources });
                break;
              case 'error':
                dispatch({ type: 'ERROR', message: parsed.message });
                break;
            }
          } catch {
            // Ignore non-JSON messages (e.g. SSE pings)
          }
        },

        onerror(err) {
          dispatch({
            type: 'ERROR',
            message: err instanceof Error ? err.message : 'Connection error',
          });
          throw err;
        },

        onclose() {
          if (!completed) {
            dispatch({ type: 'ERROR', message: 'Connection closed unexpectedly' });
          }
        },
      }).catch(() => {
        // Error already dispatched in onerror/onopen handlers
      });
    },
    [sessionId, state.messages]
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ type: 'RESET' });
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return { ...state, sendMessage, reset };
}
