import { AlertTriangle } from "lucide-react";
import type { Conflict } from "@/types/research";

interface ConflictCardProps {
  conflict: Conflict;
}

const ConflictCard = ({ conflict }: ConflictCardProps) => {
  return (
    <div className="glass p-5 border border-glass-border rounded-xl">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-5 h-5 text-score-yellow flex-shrink-0" />
        <h3 className="text-lg font-semibold">{conflict.topic}</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div className="border-l-2 border-primary/50 pl-3">
          <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary mb-1">
            {conflict.source_a.title}
          </span>
          <p className="text-sm italic text-muted-foreground">
            {conflict.source_a.claim}
          </p>
        </div>

        <div className="border-l-2 border-violet-500/50 pl-3">
          <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 mb-1">
            {conflict.source_b.title}
          </span>
          <p className="text-sm italic text-muted-foreground">
            {conflict.source_b.claim}
          </p>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-glass-border">
        <p className="text-sm italic text-muted-foreground">
          {conflict.assessment}
        </p>
      </div>
    </div>
  );
};

export default ConflictCard;
