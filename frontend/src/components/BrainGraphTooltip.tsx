import type { GraphNode } from "@/types/brain-graph";

interface BrainGraphTooltipProps {
  hoveredNode: GraphNode | null;
  x: number;
  y: number;
  linkedSourceTitles?: string[];
}

const TOOLTIP_WIDTH = 280;
const TOOLTIP_HEIGHT_ESTIMATE = 120;
const OFFSET = 12;

function truncateUrl(url: string, maxLen = 40): string {
  if (url.length <= maxLen) return url;
  return url.slice(0, maxLen) + "…";
}

function scoreColor(score: number): string {
  if (score >= 7) return "bg-green-600";
  if (score >= 4) return "bg-amber-500";
  return "bg-red-500";
}

function clampPosition(
  x: number,
  y: number,
): { left: number; top: number } {
  let left = x + OFFSET;
  let top = y + OFFSET;

  if (left + TOOLTIP_WIDTH > window.innerWidth) {
    left = x - TOOLTIP_WIDTH - OFFSET;
  }
  if (top + TOOLTIP_HEIGHT_ESTIMATE > window.innerHeight) {
    top = y - TOOLTIP_HEIGHT_ESTIMATE - OFFSET;
  }

  return { left, top };
}

export function BrainGraphTooltip({
  hoveredNode,
  x,
  y,
  linkedSourceTitles,
}: BrainGraphTooltipProps): JSX.Element | null {
  if (!hoveredNode) return null;

  const { left, top } = clampPosition(x, y);

  let content: JSX.Element;

  switch (hoveredNode.type) {
    case "stage": {
      const subtext =
        hoveredNode.state === "active"
          ? "Processing..."
          : hoveredNode.state === "complete"
            ? "Complete"
            : null;
      content = (
        <>
          <div className="font-semibold text-sm">{hoveredNode.label}</div>
          {subtext && (
            <div className="text-xs text-muted-foreground mt-1">
              {subtext}
            </div>
          )}
        </>
      );
      break;
    }
    case "source": {
      content = (
        <>
          <div className="font-semibold text-sm">{hoveredNode.title}</div>
          <div className="text-xs text-muted-foreground mt-1">
            {truncateUrl(hoveredNode.url)}
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <span
              className={`inline-flex items-center justify-center text-xs text-white font-medium px-1.5 py-0.5 rounded ${scoreColor(hoveredNode.score)}`}
            >
              {hoveredNode.score}
            </span>
            <span className="text-xs text-muted-foreground">
              {hoveredNode.contentCategory}
            </span>
          </div>
        </>
      );
      break;
    }
    case "concept": {
      const MAX_TITLES = 3;
      const titles = linkedSourceTitles ?? [];
      const shown = titles.slice(0, MAX_TITLES);
      const remaining = titles.length - MAX_TITLES;

      content = (
        <>
          <div className="font-semibold text-sm">{hoveredNode.name}</div>
          <div className="text-xs text-muted-foreground mt-1">
            Referenced by {hoveredNode.mentionCount} sources
          </div>
          {shown.length > 0 && (
            <ul className="text-xs text-muted-foreground mt-1.5 list-disc pl-4">
              {shown.map((t) => (
                <li key={t}>{t}</li>
              ))}
              {remaining > 0 && <li>+{remaining} more</li>}
            </ul>
          )}
        </>
      );
      break;
    }
    default: {
      const _exhaustive: never = hoveredNode;
      return null;
    }
  }

  return (
    <div
      role="tooltip"
      className="fixed z-50 pointer-events-none bg-popover text-popover-foreground rounded-lg shadow-lg p-3 max-w-[280px]"
      style={{ left: `${left}px`, top: `${top}px` }}
    >
      {content}
    </div>
  );
}
