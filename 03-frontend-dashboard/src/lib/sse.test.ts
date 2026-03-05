import { describe, it, expect, vi, beforeEach } from 'vitest';
import { connectSSE } from './sse';

// Mock @microsoft/fetch-event-source
const mockFetchEventSource = vi.fn();
vi.mock('@microsoft/fetch-event-source', () => ({
  fetchEventSource: (...args: unknown[]) => mockFetchEventSource(...args),
}));

// Mock config
vi.mock('../config', () => ({
  API_BASE_URL: 'http://localhost:8000',
}));

describe('connectSSE', () => {
  beforeEach(() => {
    mockFetchEventSource.mockReset();
  });

  it('sends POST with correct URL, headers, and lowercase depth', async () => {
    mockFetchEventSource.mockResolvedValue(undefined);

    const controller = new AbortController();
    connectSSE({
      topic: 'React',
      depth: 'Quick',
      signal: controller.signal,
      onEvent: vi.fn(),
      onError: vi.fn(),
    });

    expect(mockFetchEventSource).toHaveBeenCalledWith(
      'http://localhost:8000/api/research',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: 'React', depth: 'quick' }),
        signal: controller.signal,
      })
    );
  });

  it('calls onEvent for each parsed SSE message', async () => {
    mockFetchEventSource.mockImplementation(async (_url: string, opts: Record<string, unknown>) => {
      const onmessage = opts.onmessage as (ev: { data: string; event: string }) => void;
      onmessage({ data: JSON.stringify({ type: 'status', message: 'Searching...' }), event: 'status' });
      onmessage({ data: JSON.stringify({ type: 'status', message: 'Processing...' }), event: 'status' });
    });

    const onEvent = vi.fn();
    const controller = new AbortController();

    await connectSSE({
      topic: 'React',
      depth: 'quick',
      signal: controller.signal,
      onEvent,
      onError: vi.fn(),
    });

    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(onEvent).toHaveBeenCalledWith({ type: 'status', message: 'Searching...' });
    expect(onEvent).toHaveBeenCalledWith({ type: 'status', message: 'Processing...' });
  });

  it('calls onError when connection fails', async () => {
    const error = new Error('Connection failed');
    mockFetchEventSource.mockImplementation(async (_url: string, opts: Record<string, unknown>) => {
      const onerror = opts.onerror as (err: Error) => void;
      try {
        onerror(error);
      } catch {
        // onerror throws to prevent retry - expected
      }
    });

    const onError = vi.fn();
    const controller = new AbortController();

    await connectSSE({
      topic: 'React',
      depth: 'quick',
      signal: controller.signal,
      onEvent: vi.fn(),
      onError,
    });

    expect(onError).toHaveBeenCalledWith(error);
  });

  it('respects AbortSignal cancellation', () => {
    mockFetchEventSource.mockResolvedValue(undefined);

    const controller = new AbortController();
    connectSSE({
      topic: 'React',
      depth: 'quick',
      signal: controller.signal,
      onEvent: vi.fn(),
      onError: vi.fn(),
    });

    expect(mockFetchEventSource).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: controller.signal })
    );
  });

  it('handles 429 response with specific error message', async () => {
    mockFetchEventSource.mockImplementation(async (_url: string, opts: Record<string, unknown>) => {
      const onopen = opts.onopen as (response: { ok: boolean; status: number }) => Promise<void>;
      await expect(onopen({ ok: false, status: 429 })).rejects.toThrow(/busy/i);
    });

    const controller = new AbortController();
    await connectSSE({
      topic: 'React',
      depth: 'quick',
      signal: controller.signal,
      onEvent: vi.fn(),
      onError: vi.fn(),
    });
  });

  it('does not retry on error (throws in onerror/onclose)', async () => {
    mockFetchEventSource.mockImplementation(async (_url: string, opts: Record<string, unknown>) => {
      const onerror = opts.onerror as (err: Error) => void;
      const onclose = opts.onclose as () => void;

      // onerror should throw
      expect(() => onerror(new Error('test'))).toThrow();
      // onclose should throw
      expect(() => onclose()).toThrow();
    });

    const controller = new AbortController();
    await connectSSE({
      topic: 'React',
      depth: 'quick',
      signal: controller.signal,
      onEvent: vi.fn(),
      onError: vi.fn(),
    });
  });
});
