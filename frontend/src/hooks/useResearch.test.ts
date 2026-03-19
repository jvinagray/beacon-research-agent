import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useResearch, researchReducer, initialState } from './useResearch';
import type { ResearchState, ResearchAction, EvaluatedSource } from '../types/research';

// Mock the SSE module
vi.mock('../lib/sse', () => ({
  connectSSE: vi.fn(),
}));

const makeSource = (score: number, failed = false): EvaluatedSource => ({
  url: `http://example.com/${score}`,
  title: `Source ${score}`,
  snippet: 'A snippet',
  signals: {
    learning_efficiency_score: score,
    content_type: 'tutorial',
    time_estimate_minutes: 10,
    recency: '2024',
    key_insight: 'Insight',
    coverage: ['topic'],
    evaluation_failed: failed,
  },
  deep_read_content: null,
  extraction_method: null,
});

describe('researchReducer', () => {
  it('initial state has status idle, empty sources, null sessionId', () => {
    expect(initialState.status).toBe('idle');
    expect(initialState.sources).toEqual([]);
    expect(initialState.sessionId).toBeNull();
  });

  it('START_RESEARCH sets status to loading, stores topic and depth', () => {
    const state = researchReducer(initialState, {
      type: 'START_RESEARCH',
      topic: 'React',
      depth: 'Quick',
    });
    expect(state.status).toBe('loading');
    expect(state.topic).toBe('React');
    expect(state.depth).toBe('Quick');
  });

  it('STATUS_UPDATE sets statusMessage, transitions loading->streaming on first status event', () => {
    const loading: ResearchState = { ...initialState, status: 'loading' };
    const state = researchReducer(loading, {
      type: 'STATUS_UPDATE',
      message: 'Searching...',
    });
    expect(state.status).toBe('streaming');
    expect(state.statusMessage).toBe('Searching...');
  });

  it('STATUS_UPDATE when already streaming keeps status as streaming', () => {
    const streaming: ResearchState = { ...initialState, status: 'streaming' };
    const state = researchReducer(streaming, {
      type: 'STATUS_UPDATE',
      message: 'Processing...',
    });
    expect(state.status).toBe('streaming');
    expect(state.statusMessage).toBe('Processing...');
  });

  it('SOURCES_FOUND sets sourceTotal', () => {
    const state = researchReducer(initialState, {
      type: 'SOURCES_FOUND',
      total: 10,
    });
    expect(state.sourceTotal).toBe(10);
  });

  it('SOURCE_EVALUATED appends source to array, maintains sort by score descending', () => {
    const s1 = makeSource(5);
    const s2 = makeSource(8);

    let state = researchReducer(initialState, { type: 'SOURCE_EVALUATED', source: s1 });
    state = researchReducer(state, { type: 'SOURCE_EVALUATED', source: s2 });

    expect(state.sources).toHaveLength(2);
    expect(state.sources[0].signals.learning_efficiency_score).toBe(8);
    expect(state.sources[1].signals.learning_efficiency_score).toBe(5);
  });

  it('SOURCE_EVALUATED with evaluation_failed source sorts it to bottom', () => {
    const good = makeSource(5);
    const failed = makeSource(0, true);

    let state = researchReducer(initialState, { type: 'SOURCE_EVALUATED', source: failed });
    state = researchReducer(state, { type: 'SOURCE_EVALUATED', source: good });

    expect(state.sources[0].signals.learning_efficiency_score).toBe(5);
    expect(state.sources[1].signals.evaluation_failed).toBe(true);
  });

  it('ARTIFACT_RECEIVED stores normalized artifact in artifacts record', () => {
    const state = researchReducer(initialState, {
      type: 'ARTIFACT_RECEIVED',
      artifact_type: 'summary',
      data: '# Summary content',
    });
    expect(state.artifacts['summary']).toBe('# Summary content');
  });

  it('ERROR with recoverable=true keeps status as streaming, appends to statusMessage', () => {
    const streaming: ResearchState = {
      ...initialState,
      status: 'streaming',
      statusMessage: 'Working...',
    };
    const state = researchReducer(streaming, {
      type: 'ERROR',
      message: 'Minor issue',
      recoverable: true,
    });
    expect(state.status).toBe('streaming');
    expect(state.statusMessage).toContain('Minor issue');
  });

  it('ERROR with recoverable=false sets status to error, stores error details', () => {
    const state = researchReducer(initialState, {
      type: 'ERROR',
      message: 'Fatal error',
      recoverable: false,
    });
    expect(state.status).toBe('error');
    expect(state.error).toEqual({ message: 'Fatal error', recoverable: false });
  });

  it('COMPLETE sets sessionId, status to complete, stores summary', () => {
    const summary = {
      topic: 'React',
      depth: 'quick',
      source_count: 5,
      artifact_types: ['summary'],
    };
    const state = researchReducer(initialState, {
      type: 'COMPLETE',
      sessionId: 'abc-123',
      summary,
    });
    expect(state.status).toBe('complete');
    expect(state.sessionId).toBe('abc-123');
    expect(state.summary).toEqual(summary);
  });

  it('RESET returns to initial state', () => {
    const modified: ResearchState = {
      ...initialState,
      status: 'complete',
      topic: 'React',
      sessionId: 'abc',
    };
    const state = researchReducer(modified, { type: 'RESET' });
    expect(state).toEqual(initialState);
  });

  it('multiple SOURCE_EVALUATED events accumulate correctly in order', () => {
    const sources = [makeSource(3), makeSource(7), makeSource(5), makeSource(9)];
    let state = initialState;
    for (const source of sources) {
      state = researchReducer(state, { type: 'SOURCE_EVALUATED', source });
    }
    expect(state.sources).toHaveLength(4);
    const scores = state.sources.map((s) => s.signals.learning_efficiency_score);
    expect(scores).toEqual([9, 7, 5, 3]);
  });
});

describe('useResearch hook', () => {
  it('returns initial state with idle status', () => {
    const { result } = renderHook(() => useResearch());
    expect(result.current.state.status).toBe('idle');
    expect(result.current.state.sources).toEqual([]);
    expect(typeof result.current.startResearch).toBe('function');
    expect(typeof result.current.reset).toBe('function');
  });

  it('reset returns to initial state', () => {
    const { result } = renderHook(() => useResearch());
    act(() => {
      result.current.reset();
    });
    expect(result.current.state.status).toBe('idle');
  });
});
