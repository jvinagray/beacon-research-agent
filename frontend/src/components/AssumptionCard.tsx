import { Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Assumption } from "@/types/research";

interface AssumptionCardProps {
  assumption: Assumption;
}

const riskStyles = {
  high: "text-score-red bg-score-red/15",
  medium: "text-score-yellow bg-score-yellow/15",
  low: "text-score-green bg-score-green/15",
} as const;

const AssumptionCard = ({ assumption }: AssumptionCardProps) => {
  return (
    <div className="glass p-5 border border-glass-border rounded-xl">
      <div className="flex items-center gap-2">
        <Lightbulb className="w-5 h-5 text-primary flex-shrink-0" />
        <h3 className="text-lg font-semibold">{assumption.assumption}</h3>
      </div>

      <div className="flex items-center gap-2 mt-2">
        <span
          className={cn(
            "text-xs px-2 py-0.5 rounded-full font-medium",
            riskStyles[assumption.risk_level]
          )}
        >
          {assumption.risk_level}
        </span>
      </div>

      <p className="text-sm text-muted-foreground mt-3">
        {assumption.why_it_matters}
      </p>

      {assumption.sources_relying.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {assumption.sources_relying.map((source, idx) => (
            <span
              key={`${source}-${idx}`}
              className="text-xs px-2 py-0.5 rounded-full bg-secondary"
            >
              {source}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default AssumptionCard;
