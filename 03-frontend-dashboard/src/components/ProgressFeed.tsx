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
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary" />
          </span>
          <p className="text-sm text-foreground">{statusMessage}</p>
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
              <SourceCard
                title={source.title}
                url={source.url}
                score={source.signals.learning_efficiency_score}
                contentType={source.signals.content_type}
                timeEstimate={`${source.signals.time_estimate_minutes} min`}
                keyInsight={source.signals.key_insight}
                failed={source.signals.evaluation_failed}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProgressFeed;
