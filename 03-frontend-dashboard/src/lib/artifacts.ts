import type { Flashcard, TimelineEvent } from '../types/research';

function stripCodeFences(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    const lines = cleaned.split('\n');
    lines.shift(); // Remove opening fence line
    if (lines[lines.length - 1]?.trim() === '```') {
      lines.pop(); // Remove closing fence line
    }
    cleaned = lines.join('\n');
  }
  return cleaned;
}

export function normalizeArtifact(
  artifact_type: string,
  data: string | object
): string | Flashcard[] | TimelineEvent[] | null {
  switch (artifact_type) {
    case 'summary':
    case 'concept_map':
      return data as string;

    case 'flashcards':
      if (Array.isArray(data)) {
        return data as Flashcard[];
      }
      if (typeof data !== 'string') {
        return [];
      }
      try {
        const cleaned = stripCodeFences(data);
        const parsed = JSON.parse(cleaned);
        return Array.isArray(parsed) ? (parsed as Flashcard[]) : [];
      } catch {
        console.warn(`Failed to parse flashcards JSON: ${data}`);
        return [];
      }

    case 'timeline':
      if (Array.isArray(data)) {
        return data as TimelineEvent[];
      }
      if (typeof data !== 'string') {
        return [];
      }
      try {
        const cleaned = stripCodeFences(data);
        const parsed = JSON.parse(cleaned);
        return Array.isArray(parsed) ? (parsed as TimelineEvent[]) : [];
      } catch {
        console.warn(`Failed to parse timeline JSON: ${data}`);
        return [];
      }

    case 'resources':
      return null;

    default:
      return data as string;
  }
}
