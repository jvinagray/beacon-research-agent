export interface Source {
  url: string;
  title: string;
  snippet: string;
}

export interface IntelligenceSignals {
  /** 0-10 scale. A score of 0 indicates evaluation failure. */
  learning_efficiency_score: number;
  content_type:
    | 'tutorial'
    | 'paper'
    | 'docs'
    | 'opinion'
    | 'video'
    | 'forum'
    | 'repository'
    | 'course'
    | 'other';
  time_estimate_minutes: number;
  recency: string | null;
  key_insight: string;
  coverage: string[];
  evaluation_failed: boolean;
}

export interface EvaluatedSource {
  url: string;
  title: string;
  snippet: string;
  signals: IntelligenceSignals;
  /** Full page text — can be very large. Strip before passing through React Router state. */
  deep_read_content: string | null;
  extraction_method: string | null;
}

export type SSEEvent =
  | { type: 'status'; message: string }
  | { type: 'sources_found'; count: number; sources: Source[] }
  | { type: 'source_evaluated'; index: number; total: number; source: EvaluatedSource }
  | { type: 'artifact'; artifact_type: string; data: string | object }
  | { type: 'error'; message: string; recoverable: boolean }
  | {
      type: 'complete';
      session_id: string;
      summary: CompleteSummary;
    };

export interface CompleteSummary {
  topic: string;
  depth: string;
  source_count: number;
  artifact_types: string[];
}

export interface TimelineEvent {
  date: string;
  title: string;
  description: string;
  source_title: string;
  significance: 'high' | 'medium' | 'low';
}

export interface Conflict {
  topic: string;
  source_a: { title: string; claim: string };
  source_b: { title: string; claim: string };
  assessment: string;
}

export interface Assumption {
  assumption: string;
  why_it_matters: string;
  sources_relying: string[];
  risk_level: 'high' | 'medium' | 'low';
}

/** Backend sends flashcards as a JSON-encoded string; the artifact normalizer parses into Flashcard[]. */
export interface Flashcard {
  question: string;
  answer: string;
}

export interface ResearchState {
  status: 'idle' | 'loading' | 'streaming' | 'complete' | 'error';
  statusMessage: string;
  topic: string;
  depth: string;
  sources: EvaluatedSource[];
  sourceTotal: number;
  artifacts: Record<string, string | object>;
  sessionId: string | null;
  summary: CompleteSummary | null;
  error: { message: string; recoverable: boolean } | null;
}

export type ResearchAction =
  | { type: 'START_RESEARCH'; topic: string; depth: string }
  | { type: 'STATUS_UPDATE'; message: string }
  | { type: 'SOURCES_FOUND'; total: number }
  | { type: 'SOURCE_EVALUATED'; source: EvaluatedSource }
  | { type: 'ARTIFACT_RECEIVED'; artifact_type: string; data: string | object }
  | { type: 'COMPLETE'; sessionId: string; summary: CompleteSummary }
  | { type: 'ERROR'; message: string; recoverable: boolean }
  | { type: 'RESET' };

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: { title: string; url: string }[];
}

export type ChatSSEEvent =
  | { type: 'delta'; content: string }
  | { type: 'done'; sources: { title: string; url: string }[] }
  | { type: 'error'; message: string };
