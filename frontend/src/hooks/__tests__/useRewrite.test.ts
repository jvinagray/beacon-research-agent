import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRewrite } from '../useRewrite';

// Mock @microsoft/fetch-event-source
vi.mock('@microsoft/fetch-event-source', () => ({
  fetchEventSource: vi.fn(),
}));

import { fetchEventSource } from '@microsoft/fetch-event-source';
const mockFetchEventSource = vi.mocked(fetchEventSource);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useRewrite', () => {
  it('initial state has currentLevel=3, isStreaming=false, empty cachedLevels', () => {
    const { result } = renderHook(() => useRewrite('session-1', 'original summary text'));

    expect(result.current.currentLevel).toBe(3);
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.cachedLevels).toEqual({});
    expect(result.current.content).toBe('original summary text');
    expect(result.current.error).toBeNull();
  });

  it('requestRewrite(3) returns original summary without fetch call', () => {
    const { result } = renderHook(() => useRewrite('session-1', 'original summary text'));

    act(() => {
      result.current.requestRewrite(3);
    });

    expect(result.current.content).toBe('original summary text');
    expect(result.current.currentLevel).toBe(3);
    expect(mockFetchEventSource).not.toHaveBeenCalled();
  });

  it('requestRewrite(1) triggers fetch to /api/rewrite endpoint', () => {
    mockFetchEventSource.mockResolvedValue(undefined as never);

    const { result } = renderHook(() => useRewrite('session-1', 'original summary text'));

    act(() => {
      result.current.requestRewrite(1);
    });

    expect(mockFetchEventSource).toHaveBeenCalledTimes(1);
    const callArgs = mockFetchEventSource.mock.calls[0];
    expect(callArgs[0]).toContain('/api/rewrite/session-1');
    const options = callArgs[1] as Record<string, unknown>;
    expect(JSON.parse(options.body as string)).toEqual({ level: 1 });
  });

  it('requestRewrite caches completed rewrite in cachedLevels', async () => {
    mockFetchEventSource.mockImplementation(async (_url, options) => {
      const opts = options as Record<string, (event: { data: string }) => void>;
      opts.onmessage({ data: JSON.stringify({ type: 'delta', content: 'rewritten ' }) });
      opts.onmessage({ data: JSON.stringify({ type: 'delta', content: 'text' }) });
      opts.onmessage({ data: JSON.stringify({ type: 'done', level: 1 }) });
    });

    const { result } = renderHook(() => useRewrite('session-1', 'original summary text'));

    await act(async () => {
      result.current.requestRewrite(1);
    });

    expect(result.current.cachedLevels[1]).toBe('rewritten text');
    expect(result.current.content).toBe('rewritten text');
    expect(result.current.isStreaming).toBe(false);
  });

  it('requestRewrite for cached level returns cached content without fetch', async () => {
    // First call: populate cache for level 1
    mockFetchEventSource.mockImplementation(async (_url, options) => {
      const opts = options as Record<string, (event: { data: string }) => void>;
      opts.onmessage({ data: JSON.stringify({ type: 'delta', content: 'cached' }) });
      opts.onmessage({ data: JSON.stringify({ type: 'done', level: 1 }) });
    });

    const { result } = renderHook(() => useRewrite('session-1', 'original'));

    await act(async () => {
      result.current.requestRewrite(1);
    });

    expect(result.current.cachedLevels[1]).toBe('cached');
    mockFetchEventSource.mockClear();

    // Switch to level 3 (original)
    act(() => {
      result.current.requestRewrite(3);
    });

    // Switch back to level 1 — should use cache
    act(() => {
      result.current.requestRewrite(1);
    });

    expect(mockFetchEventSource).not.toHaveBeenCalled();
    expect(result.current.content).toBe('cached');
  });

  it('requestRewrite aborts previous in-flight request', () => {
    const abortSpy = vi.fn();
    const originalAbortController = global.AbortController;
    global.AbortController = vi.fn().mockImplementation(() => ({
      signal: {},
      abort: abortSpy,
    })) as unknown as typeof AbortController;

    mockFetchEventSource.mockResolvedValue(undefined as never);

    const { result } = renderHook(() => useRewrite('session-1', 'original'));

    act(() => {
      result.current.requestRewrite(1);
    });

    act(() => {
      result.current.requestRewrite(2);
    });

    // First AbortController should have been aborted when second request started
    expect(abortSpy).toHaveBeenCalled();

    global.AbortController = originalAbortController;
  });

  it('resets cachedLevels when originalSummary changes', async () => {
    mockFetchEventSource.mockImplementation(async (_url, options) => {
      const opts = options as Record<string, (event: { data: string }) => void>;
      opts.onmessage({ data: JSON.stringify({ type: 'delta', content: 'cached' }) });
      opts.onmessage({ data: JSON.stringify({ type: 'done', level: 1 }) });
    });

    const { result, rerender } = renderHook(
      ({ summary }) => useRewrite('session-1', summary),
      { initialProps: { summary: 'text A' } }
    );

    await act(async () => {
      result.current.requestRewrite(1);
    });

    expect(result.current.cachedLevels[1]).toBe('cached');

    // Change originalSummary
    rerender({ summary: 'text B' });

    expect(result.current.cachedLevels).toEqual({});
    expect(result.current.content).toBe('text B');
    expect(result.current.currentLevel).toBe(3);
  });

  it('aborts on unmount without errors', () => {
    const abortSpy = vi.fn();
    const originalAbortController = global.AbortController;
    global.AbortController = vi.fn().mockImplementation(() => ({
      signal: {},
      abort: abortSpy,
    })) as unknown as typeof AbortController;

    mockFetchEventSource.mockResolvedValue(undefined as never);

    const { result, unmount } = renderHook(() => useRewrite('session-1', 'original'));

    act(() => {
      result.current.requestRewrite(1);
    });

    expect(() => unmount()).not.toThrow();

    global.AbortController = originalAbortController;
  });
});
