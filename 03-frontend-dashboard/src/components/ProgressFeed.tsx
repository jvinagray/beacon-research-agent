import SourceCard from "./SourceCard";
import type { EvaluatedSource } from "@/types/research";

interface ProgressFeedProps {
  status: string;
  statusMessage: string;
  sources: EvaluatedSource[];
  sourceTotal: number;
}

const ProgressFeed = ({ status, statusMessage, sources, sourceTotal }: ProgressFeedProps) => {
  const isActive = status === "loading" || status === "streaming";
  const showPlaceholder = status === "idle" && sources.length === 0;

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

      {isActive && sourceTotal > 0 && (
        <p className="text-xs text-muted-foreground mb-4">
          Evaluating source {sources.length} of {sourceTotal}
        </p>
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
