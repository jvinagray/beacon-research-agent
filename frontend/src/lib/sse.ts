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
  let errorHandled = false;
  let completed = false;

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
      if (!event.data) return;
      try {
        const parsed = JSON.parse(event.data) as SSEEvent;
        if (parsed.type === 'artifact') {
          const artEvt = parsed as { artifact_type: string; data: unknown };
          const preview = typeof artEvt.data === 'string'
            ? artEvt.data.slice(0, 120)
            : JSON.stringify(artEvt.data).slice(0, 120);
          console.log(`[Beacon SSE] artifact "${artEvt.artifact_type}" received (${typeof artEvt.data}, ${String(artEvt.data).length} chars): ${preview}…`);
        }
        if (parsed.type === 'complete') {
          completed = true;
        }
        onEvent(parsed);
      } catch {
        // Ignore non-JSON messages (e.g. SSE pings)
      }
    },

    onerror(err) {
      errorHandled = true;
      if (err instanceof TypeError) {
        const connectionError = new Error(
          `Cannot connect to the research server. Make sure it's running at ${API_BASE_URL}.`
        );
        onError(connectionError);
        throw connectionError;
      }
      onError(err);
      throw err;
    },

    onclose() {
      if (!completed) {
        throw new Error('Connection closed unexpectedly');
      }
    },
  }).catch((err) => {
    if (!errorHandled) {
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  });
}
