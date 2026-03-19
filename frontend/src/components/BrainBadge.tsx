import { useState } from "react";
import { Brain } from "lucide-react";
import type { SerializedGraphSnapshot } from "@/types/brain-graph";

interface BrainBadgeProps {
  snapshot: SerializedGraphSnapshot;
  onExpand: () => void;
}

export function BrainBadge({ snapshot, onExpand }: BrainBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const sourceCount = snapshot.nodes.filter((n) => n.type === "source").length;
  const conceptCount = snapshot.nodes.filter((n) => n.type === "concept").length;

  return (
    <button
      className="group relative flex items-center gap-3 px-4 py-2.5 rounded-xl glass
                 border-primary/15 hover:border-primary/30 transition-all duration-300
                 hover:shadow-[0_0_20px_hsl(var(--primary)/0.15)]"
      onClick={onExpand}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      aria-label="Expand brain graph"
    >
      {/* Pulsing ring */}
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" style={{ animationDuration: "3s" }} />
        <Brain size={20} className="relative text-primary" />
      </div>

      {/* Stats */}
      <div className="flex items-center gap-2 text-xs">
        <span className="font-mono text-primary font-semibold">{snapshot.nodeCount}</span>
        <span className="text-muted-foreground">nodes</span>
        <span className="text-muted-foreground/30">|</span>
        <span className="font-mono text-primary font-semibold">{snapshot.linkCount}</span>
        <span className="text-muted-foreground">edges</span>
      </div>

      {/* Expand hint */}
      <span className="text-[10px] text-muted-foreground/50 group-hover:text-primary/60 transition-colors uppercase tracking-wider">
        View
      </span>

      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute left-0 top-full mt-2 whitespace-nowrap glass text-xs rounded-lg px-3 py-2 shadow-lg z-50 border-primary/10">
          <div className="flex flex-col gap-0.5">
            <span className="text-primary/80 font-medium">Research Brain</span>
            <span className="text-muted-foreground">
              {sourceCount} sources · {conceptCount} concepts · {snapshot.linkCount} connections
            </span>
          </div>
        </div>
      )}
    </button>
  );
}
