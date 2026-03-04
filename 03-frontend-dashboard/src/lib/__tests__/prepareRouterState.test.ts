import { describe, it, expect } from 'vitest';
import { prepareRouterState } from '../prepareRouterState';
import type { ResearchState, EvaluatedSource } from '../../types/research';

const makeSource = (opts: { deepContent?: string | null } = {}): EvaluatedSource => ({
  url: 'http://example.com',
  title: 'Example',
  snippet: 'A snippet',
  signals: {
    learning_efficiency_score: 7,
    content_type: 'tutorial',
    time_estimate_minutes: 10,
    recency: '2024',
    key_insight: 'Insight',
    coverage: ['topic'],
    evaluation_failed: false,
  },
  deep_read_content: opts.deepContent ?? 'Very large page content here...',
  extraction_method: 'readability',
});

const baseState: ResearchState = {
  status: 'complete',
  statusMessage: '',
  topic: 'React',
  depth: 'standard',
  sources: [makeSource(), makeSource({ deepContent: 'Another page' })],
  sourceTotal: 2,
  artifacts: { summary: '# Summary' },
  sessionId: 'abc-123',
  summary: { topic: 'React', depth: 'standard', source_count: 2, artifact_types: ['summary'] },
  error: null,
};

describe('prepareRouterState', () => {
  it('strips deep_read_content from all sources', () => {
    const result = prepareRouterState(baseState);
    for (const source of result.sources) {
      expect(source).not.toHaveProperty('deep_read_content');
    }
  });

  it('preserves all other source fields', () => {
    const result = prepareRouterState(baseState);
    expect(result.sources[0]).toMatchObject({
      url: 'http://example.com',
      title: 'Example',
      snippet: 'A snippet',
      signals: expect.objectContaining({
        learning_efficiency_score: 7,
      }),
      extraction_method: 'readability',
    });
  });

  it('preserves artifacts, sessionId, topic, depth', () => {
    const result = prepareRouterState(baseState);
    expect(result.topic).toBe('React');
    expect(result.depth).toBe('standard');
    expect(result.artifacts).toEqual({ summary: '# Summary' });
    expect(result.sessionId).toBe('abc-123');
    expect(result.sourceTotal).toBe(2);
  });

  it('handles sources with null deep_read_content', () => {
    const state: ResearchState = {
      ...baseState,
      sources: [makeSource({ deepContent: null })],
    };
    const result = prepareRouterState(state);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]).not.toHaveProperty('deep_read_content');
  });
});
