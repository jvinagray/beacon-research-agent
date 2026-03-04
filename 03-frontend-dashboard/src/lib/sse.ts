import { fetchEventSource } from '@microsoft/fetch-event-source';
import { API_BASE_URL } from '../config';
import type { SSEEvent } from '../types/research';

export function connectSSE(params: {
  topic: string;
  depth: string;
  signal: AbortSignal;
  onEvent: (event: SSEEvent) => void;
  onError: (error: Error) => void;
}): void {
  const { topic, depth, signal, onEvent, onError } = params;

  fetchEventSource(`${API_BASE_URL}/api/research`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, depth: depth.toLowerCase() }),
    signal,

    async onopen(response) {
      if (response.status === 429) {
        throw new Error('Server is busy. Please try again later.');
      }
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
    },

    onmessage(event) {
      try {
        const parsed = JSON.parse(event.data) as SSEEvent;
        onEvent(parsed);
      } catch (err) {
        onError(err instanceof Error ? err : new Error('Failed to parse SSE message'));
      }
    },

    onerror(err) {
      onError(err);
      throw err;
    },

    onclose() {
      throw new Error('Connection closed unexpectedly');
    },
  }).catch((err) => {
    onError(err instanceof Error ? err : new Error(String(err)));
  });
}
