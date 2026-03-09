import { useState } from "react";
import { Brain } from "lucide-react";
import type { SerializedGraphSnapshot } from "@/types/brain-graph";

interface BrainBadgeProps {
  snapshot: SerializedGraphSnapshot;
  onExpand: () => void;
}

export function BrainBadge({ snapshot, onExpand }: BrainBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <button
      className="relative w-12 h-12 flex items-center justify-center rounded-xl backdrop-blur-md bg-white/10 border border-white/20 cursor-pointer hover:bg-white/20 transition-colors"
      onClick={onExpand}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      aria-label="Expand brain graph"
    >
      <Brain size={24} className="text-primary" />
      <span className="absolute -bottom-1 -right-1 text-[10px] font-bold bg-primary text-primary-foreground rounded-full min-w-4 h-4 px-0.5 flex items-center justify-center">
        {snapshot.nodeCount}
      </span>
      {showTooltip && (
        <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 whitespace-nowrap bg-popover text-popover-foreground text-xs rounded-md px-2 py-1 shadow-lg z-50">
          {snapshot.nodeCount} nodes / {snapshot.linkCount} edges
        </div>
      )}
    </button>
  );
}
