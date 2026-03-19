import type { PreparedRouterState } from './prepareRouterState';

const STORAGE_KEY = 'beacon-search-history';
const MAX_ENTRIES = 10;

export interface SearchHistoryEntry {
  id: string;
  topic: string;
  depth: string;
  sourceCount: number;
  timestamp: number;
  state: PreparedRouterState;
}

export function saveSearch(state: PreparedRouterState): void {
  if (!state.sessionId) return;
  const history = loadHistory();

  // Don't duplicate existing entries for the same session
  const existing = history.findIndex(e => e.id === state.sessionId);
  if (existing !== -1) {
    history.splice(existing, 1);
  }

  const entry: SearchHistoryEntry = {
    id: state.sessionId!,
    topic: state.topic,
    depth: state.depth,
    sourceCount: state.sources.length,
    timestamp: Date.now(),
    state,
  };

  // Prepend new entry and cap at MAX_ENTRIES
  history.unshift(entry);
  if (history.length > MAX_ENTRIES) {
    history.length = MAX_ENTRIES;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // localStorage full — evict oldest and retry once
    history.pop();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch {
      // Give up silently
    }
  }
}

export function loadHistory(): SearchHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SearchHistoryEntry[];
  } catch {
    return [];
  }
}

export function removeEntry(id: string): void {
  const history = loadHistory().filter(e => e.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

export function clearHistory(): void {
  localStorage.removeItem(STORAGE_KEY);
}
