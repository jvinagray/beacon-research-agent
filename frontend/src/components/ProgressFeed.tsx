import SourceCard from "./SourceCard";
import type { EvaluatedSource } from "@/types/research";

const TOTAL_ARTIFACTS = 6; // summary, concept_map, flashcards, timeline, conflicts, assumptions

interface ProgressFeedProps {
  status: string;
  statusMessage: string;
  sources: EvaluatedSource[];
  sourceTotal: number;
  artifacts: Record<string, string | object>;
}

const ProgressFeed = ({ status, statusMessage, sources, sourceTotal, artifacts }: ProgressFeedProps) => {
  const isActive = status === "loading" || status === "streaming";
  const showPlaceholder = status === "idle" && sources.length === 0;

  // Overall progress: sources = 0-60%, artifacts = 60-100%
  const sourceProgress = sourceTotal > 0 ? Math.min(sources.length / sourceTotal, 1) : 0;
  const artifactProgress = Object.keys(artifacts).length / TOTAL_ARTIFACTS;
  const overallProgress = Math.round(sourceProgress * 60 + artifactProgress * 40);

  return (
    <div
      id="progress-feed"
      className="w-full max-w-2xl min-h-[200px] glass rounded-xl p-6"
    >
      {showPlaceholder && (
        <div className="flex items-center justify-center h-full min-h-[150px]">
          <p className="text-muted-foreground text-sm">
            Results will appear here...
          </p>
        </div>
      )}

      {isActive && statusMessage && (
        <div className="flex items-center gap-2 mb-4">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse-dot" />
          <p className="text-sm text-slate-300">{statusMessage}</p>
        </div>
      )}

      {isActive && (status === "loading" || sourceTotal > 0) && (
        <div className="mb-4 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Preparing dashboard…
            </p>
            <p className="text-xs text-muted-foreground">
              {overallProgress}%
            </p>
          </div>
          <div className="w-full h-1.5 rounded-full bg-muted">
            <div
              className="h-1.5 rounded-full bg-primary transition-all duration-500"
              style={{ width: `${overallProgress}%` }}
            />
          </div>
        </div>
      )}

      {sources.length > 0 && (
        <div className="flex flex-col gap-3">
          {sources.map((source, index) => (
            <div
              key={`${source.url}-${index}`}
              className="animate-fade-in-up"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <SourceCard source={source} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProgressFeed;
