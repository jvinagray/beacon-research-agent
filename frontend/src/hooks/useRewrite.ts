import { useState, useCallback, useRef, useEffect } from 'react';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { API_BASE_URL } from '../config';

export interface RewriteState {
  content: string;
  currentLevel: number;
  isStreaming: boolean;
  error: string | null;
  cachedLevels: Record<number, string>;
}

export function useRewrite(sessionId: string | null, originalSummary: string) {
  const [content, setContent] = useState(originalSummary);
  const [currentLevel, setCurrentLevel] = useState(3);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cachedLevels, setCachedLevels] = useState<Record<number, string>>({});
  const abortRef = useRef<AbortController | null>(null);
  const cacheRef = useRef<Record<number, string>>({});

  // Reset cache when originalSummary changes
  useEffect(() => {
    cacheRef.current = {};
    setCachedLevels({});
    setContent(originalSummary);
    setCurrentLevel(3);
    setError(null);
  }, [originalSummary]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const requestRewrite = useCallback(
    (level: number) => {
      if (!sessionId) return;

      // Level 3 = original summary, no API call
      if (level === 3) {
        setContent(originalSummary);
        setCurrentLevel(3);
        return;
      }

      // Check cache (read from ref to avoid stale closure)
      if (cacheRef.current[level]) {
        setContent(cacheRef.current[level]);
        setCurrentLevel(level);
        return;
      }

      // Abort any in-flight request
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      setIsStreaming(true);
      setCurrentLevel(level);
      setContent('');
      setError(null);

      let accumulated = '';
      let completed = false;

      fetchEventSource(`${API_BASE_URL}/api/rewrite/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level }),
        signal: abortRef.current.signal,

        async onopen(response) {
          if (response.status === 404) {
            throw new Error('Session expired. Please start a new research first.');
          }
          if (response.status === 429) {
            throw new Error('A rewrite is already in progress.');
          }
          if (!response.ok) {
            throw new Error(`Request failed with status ${response.status}`);
          }
        },

        onmessage(event) {
          if (!event.data) return;
          try {
            const parsed = JSON.parse(event.data);
            switch (parsed.type) {
              case 'delta':
                accumulated += parsed.content;
                setContent(accumulated);
                break;
              case 'done':
                completed = true;
                cacheRef.current = { ...cacheRef.current, [level]: accumulated };
                setCachedLevels((prev) => ({ ...prev, [level]: accumulated }));
                setIsStreaming(false);
                break;
              case 'error':
                setError(parsed.message);
                setIsStreaming(false);
                break;
            }
          } catch {
            // Ignore non-JSON messages (e.g. SSE pings)
          }
        },

        onerror(err) {
          setError(err instanceof Error ? err.message : 'Connection error');
          setIsStreaming(false);
          throw err;
        },

        onclose() {
          if (!completed) {
            setError('Connection closed unexpectedly');
            setIsStreaming(false);
          }
        },
      }).catch(() => {
        // Error already handled in onerror/onopen handlers
      });
    },
    [sessionId, originalSummary]
  );

  return { content, currentLevel, isStreaming, error, cachedLevels, requestRewrite };
}
