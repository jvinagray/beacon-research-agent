import { useState } from "react";
import { cn } from "@/lib/utils";
import { ExternalLink, ChevronDown, AlertTriangle } from "lucide-react";

interface SourceCardProps {
  title: string;
  url: string;
  score: number;
  contentType: string;
  timeEstimate: string;
  keyInsight: string;
  details?: string;
  failed?: boolean;
}

const getScoreColor = (score: number) => {
  if (score >= 8) return { text: "text-score-green", glow: "glow-green", bg: "bg-score-green/15" };
  if (score >= 5) return { text: "text-score-yellow", glow: "glow-yellow", bg: "bg-score-yellow/15" };
  return { text: "text-score-red", glow: "glow-red", bg: "bg-score-red/15" };
};

const SourceCard = ({
  title,
  url,
  score,
  contentType,
  timeEstimate,
  keyInsight,
  details,
  failed = false,
}: SourceCardProps) => {
  const [expanded, setExpanded] = useState(false);
  const colors = getScoreColor(score);

  return (
    <div
      className={cn(
        "glass p-4 w-full transition-all duration-300",
        failed && "opacity-50"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground font-medium hover:text-primary transition-colors inline-flex items-center gap-1.5 truncate"
          >
            {title}
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          </a>

          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
              {contentType}
            </span>
            <span className="text-xs text-muted-foreground">{timeEstimate}</span>
            {failed && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-destructive/15 text-destructive inline-flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Failed
              </span>
            )}
          </div>
        </div>

        <div
          className={cn(
            "shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold",
            colors.bg,
            colors.text,
            colors.glow
          )}
        >
          {score}
        </div>
      </div>

      <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
        {keyInsight}
      </p>

      {details && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-3 transition-colors"
          >
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform duration-200",
                expanded && "rotate-180"
              )}
            />
            {expanded ? "Less" : "More details"}
          </button>
          {expanded && (
            <p className="text-sm text-muted-foreground mt-2 pl-4 border-l border-glass-border leading-relaxed">
              {details}
            </p>
          )}
        </>
      )}
    </div>
  );
};

export default SourceCard;
