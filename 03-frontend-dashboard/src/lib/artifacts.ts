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
        return JSON.parse(data) as Flashcard[];
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
