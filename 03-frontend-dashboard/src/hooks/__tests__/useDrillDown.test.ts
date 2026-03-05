import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useDrillDown } from '../useDrillDown';

// Mock fetchEventSource
vi.mock('@microsoft/fetch-event-source', () => ({
  fetchEventSource: vi.fn(() => Promise.resolve()),
}));

// Mock crypto.randomUUID
let uuidCounter = 0;
vi.stubGlobal('crypto', {
  randomUUID: () => `test-uuid-${++uuidCounter}`,
});

beforeEach(() => {
  uuidCounter = 0;
});

describe('useDrillDown', () => {
  it('initial state is empty sessions array', () => {
    const { result } = renderHook(() => useDrillDown('session-1'));
    expect(result.current.sessions).toEqual([]);
  });

  it('startDrillDown creates new session with depth=0, isStreaming=true', () => {
    const { result } = renderHook(() => useDrillDown('session-1'));

    act(() => {
      result.current.startDrillDown('neural networks');
    });

    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.sessions[0]).toMatchObject({
      concept: 'neural networks',
      depth: 0,
      isStreaming: true,
      parentId: null,
      content: '',
    });
  });

  it('startDrillDown with parentId creates session with correct depth', () => {
    const { result } = renderHook(() => useDrillDown('session-1'));

    act(() => {
      result.current.startDrillDown('parent concept');
    });

    const parentId = result.current.sessions[0].id;

    act(() => {
      result.current.startDrillDown('child concept', parentId);
    });

    expect(result.current.sessions).toHaveLength(2);
    expect(result.current.sessions[1]).toMatchObject({
      concept: 'child concept',
      depth: 1,
      parentId,
    });
  });

  it('startDrillDown at depth >= 3 does not create session', () => {
    const { result } = renderHook(() => useDrillDown('session-1'));

    // Create depth 0
    act(() => {
      result.current.startDrillDown('level 0');
    });
    const id0 = result.current.sessions[0].id;

    // Create depth 1
    act(() => {
      result.current.startDrillDown('level 1', id0);
    });
    const id1 = result.current.sessions[1].id;

    // Create depth 2
    act(() => {
      result.current.startDrillDown('level 2', id1);
    });
    const id2 = result.current.sessions[2].id;

    // Attempt depth 3 — should be rejected
    let status: string;
    act(() => {
      status = result.current.startDrillDown('level 3', id2);
    });

    expect(status!).toBe('max-depth');
    expect(result.current.sessions).toHaveLength(3);
  });

  it('startDrillDown when sessions >= 10 does not create session', () => {
    const { result } = renderHook(() => useDrillDown('session-1'));

    // Create 10 sessions
    for (let i = 0; i < 10; i++) {
      act(() => {
        result.current.startDrillDown(`concept ${i}`);
      });
    }

    expect(result.current.sessions).toHaveLength(10);

    // 11th should be rejected
    let status: string;
    act(() => {
      status = result.current.startDrillDown('one too many');
    });

    expect(status!).toBe('max-sessions');
    expect(result.current.sessions).toHaveLength(10);
  });

  it('returns ok for null sessionId without creating session', () => {
    const { result } = renderHook(() => useDrillDown(null));

    let status: string;
    act(() => {
      status = result.current.startDrillDown('test');
    });

    expect(status!).toBe('ok');
    expect(result.current.sessions).toHaveLength(0);
  });
});
