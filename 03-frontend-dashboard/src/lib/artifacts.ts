import type { Flashcard } from '../types/research';

export function normalizeArtifact(
  artifact_type: string,
  data: string | object
): string | Flashcard[] | null {
  switch (artifact_type) {
    case 'summary':
    case 'concept_map':
      return data as string;

    case 'flashcards':
      if (typeof data !== 'string') {
        return data as Flashcard[];
      }
      try {
        // Strip markdown code fences if present
        let cleaned = data.trim();
        if (cleaned.startsWith('```')) {
          const lines = cleaned.split('\n');
          lines.shift(); // Remove opening fence line
          if (lines[lines.length - 1]?.trim() === '```') {
            lines.pop(); // Remove closing fence line
          }
          cleaned = lines.join('\n');
        }
        return JSON.parse(cleaned) as Flashcard[];
      } catch {
        console.warn(`Failed to parse flashcards JSON: ${data}`);
        return data;
      }

    case 'resources':
      return null;

    default:
      return data as string;
  }
}
