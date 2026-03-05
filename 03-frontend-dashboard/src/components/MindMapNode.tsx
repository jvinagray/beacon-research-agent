import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { TreeNode } from "../lib/conceptMapParser";

interface MindMapNodeProps {
  node: TreeNode;
  depth: number;
}

const BORDER_COLORS = [
  "border-primary",
  "border-blue-500",
  "border-violet-500",
  "border-amber-500",
  "border-emerald-500",
];

const MindMapNode = ({ node, depth }: MindMapNodeProps) => {
  const hasChildren = node.children && node.children.length > 0;
  const [isExpanded, setIsExpanded] = useState(depth < 2);

  const borderColor = BORDER_COLORS[depth % BORDER_COLORS.length];

  return (
    <div className={`border-l-2 ${borderColor} bg-white/5 backdrop-blur rounded-lg mb-2`}>
      <div
        className={`flex items-center gap-2 px-4 py-2.5 ${hasChildren ? "cursor-pointer select-none" : ""}`}
        onClick={hasChildren ? () => setIsExpanded((prev) => !prev) : undefined}
      >
        {hasChildren && (
          <ChevronRight
            className={`h-4 w-4 text-muted-foreground transition-transform duration-200 flex-shrink-0 ${
              isExpanded ? "rotate-90" : ""
            }`}
          />
        )}
        <span className="text-sm text-foreground">{node.name}</span>
      </div>
      {hasChildren && isExpanded && (
        <div className="ml-6 border-l border-white/10 pl-2 pb-2">
          {node.children!.map((child, i) => (
            <MindMapNode key={i} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

export default MindMapNode;
