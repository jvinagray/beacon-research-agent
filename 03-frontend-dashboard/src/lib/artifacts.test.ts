import { describe, it, expect, vi } from 'vitest';
import { normalizeArtifact } from './artifacts';

describe('normalizeArtifact', () => {
  it('returns summary string as-is', () => {
    const markdown = '# Summary\nThis is a summary of React.';
    expect(normalizeArtifact('summary', markdown)).toBe(markdown);
  });

  it('returns concept_map string as-is', () => {
    const markdown = '- React\n  - Components\n  - Hooks';
    expect(normalizeArtifact('concept_map', markdown)).toBe(markdown);
  });

  it('parses flashcards JSON string into Flashcard array', () => {
    const flashcardsJson = JSON.stringify([
      { question: 'What is React?', answer: 'A UI library' },
      { question: 'What is JSX?', answer: 'A syntax extension' },
    ]);
    const result = normalizeArtifact('flashcards', flashcardsJson);
    expect(result).toEqual([
      { question: 'What is React?', answer: 'A UI library' },
      { question: 'What is JSX?', answer: 'A syntax extension' },
    ]);
  });

  it('handles already-parsed flashcards object (defensive)', () => {
    const flashcards = [
      { question: 'What is React?', answer: 'A UI library' },
    ];
    const result = normalizeArtifact('flashcards', flashcards as unknown as string);
    expect(result).toEqual(flashcards);
  });

  it('returns null for resources artifact (intentionally ignored)', () => {
    expect(normalizeArtifact('resources', '["http://example.com"]')).toBeNull();
  });

  it('handles malformed JSON gracefully (returns raw string)', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const malformed = '{not valid json';
    const result = normalizeArtifact('flashcards', malformed);
    expect(result).toBe(malformed);
    consoleSpy.mockRestore();
  });
});
