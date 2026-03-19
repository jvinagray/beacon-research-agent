import { useEffect, useRef, useState } from "react";
import { Brain, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BrainGraph } from "@/components/BrainGraph";
import { useBrainSimulation } from "@/hooks/useBrainSimulation";
import type {
  GraphNode,
  SerializedGraphSnapshot,
  StageNodeData,
  SourceNodeData,
  ConceptNodeData,
} from "@/types/brain-graph";

interface BrainGraphModalProps {
  isOpen: boolean;
  onClose: () => void;
  snapshot: SerializedGraphSnapshot;
  onNodeClick?: (nodeType: "stage" | "source" | "concept", nodeId: string) => void;
}

function hydrateSnapshotNodes(
  nodes: SerializedGraphSnapshot["nodes"],
): GraphNode[] {
  return nodes.map((n) => {
    switch (n.type) {
      case "stage":
        return {
          id: n.id,
          type: "stage" as const,
          label: (n.label ?? "SEARCH") as StageNodeData["label"],
          state: (n.state as StageNodeData["state"]) ?? "complete",
          fx: n.x,
          fy: n.y,
          x: n.x,
          y: n.y,
        } satisfies StageNodeData;
      case "source":
        return {
          id: n.id,
          type: "source" as const,
          url: n.id,
          title: n.title ?? "",
          score: n.score ?? 0,
          contentCategory: n.contentCategory ?? "other",
          radius: n.radius ?? 6,
          opacity: 1,
          x: n.x,
          y: n.y,
        } satisfies SourceNodeData;
      case "concept":
        return {
          id: n.id,
          type: "concept" as const,
          name: n.name ?? "",
          mentionCount: 0,
          radius: n.radius ?? 8,
          x: n.x,
          y: n.y,
        } satisfies ConceptNodeData;
      default:
        return n as unknown as GraphNode;
    }
  });
}

export function BrainGraphModal({
  isOpen,
  onClose,
  snapshot,
  onNodeClick,
}: BrainGraphModalProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  const sim = useBrainSimulation(svgRef, dimensions);

  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    const measure = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) {
        setDimensions({ width: rect.width, height: rect.height });
      }
    };

    const timer = setTimeout(measure, 100);
    const observer = new ResizeObserver(measure);
    if (containerRef.current) observer.observe(containerRef.current);

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const rafId = requestAnimationFrame(() => {
      sim.initFromSnapshot(snapshot);
    });
    return () => {
      cancelAnimationFrame(rafId);
      sim.destroy();
    };
  }, [isOpen, snapshot, sim.initFromSnapshot, sim.destroy]);

  const hydratedNodes = hydrateSnapshotNodes(snapshot.nodes);
  const sourceCount = snapshot.nodes.filter((n) => n.type === "source").length;
  const conceptCount = snapshot.nodes.filter((n) => n.type === "concept").length;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[85vw] h-[85vh] flex flex-col p-0 gap-0 border-primary/15 bg-card/95 backdrop-blur-xl overflow-hidden">
        {/* JARVIS-style header */}
        <DialogHeader className="px-5 py-3 border-b border-primary/10 bg-card/80 flex-row items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" style={{ animationDuration: "3s" }} />
              <Brain size={18} className="relative text-primary" />
            </div>
            <div>
              <DialogTitle className="text-sm font-semibold tracking-wide">
                Research Brain
              </DialogTitle>
              <DialogDescription className="text-[11px] text-muted-foreground">
                {sourceCount} sources · {conceptCount} concepts · {snapshot.linkCount} connections
              </DialogDescription>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-primary/60 font-mono uppercase tracking-wider">
              Click nodes to navigate
            </span>
          </div>
        </DialogHeader>

        {/* Graph area */}
        <div ref={containerRef} className="flex-1 min-h-0 relative">
          <BrainGraph
            svgRef={svgRef}
            minimized={false}
            onMinimize={() => {}}
            onRestore={() => {}}
            nodes={hydratedNodes}
            links={snapshot.links}
            onNodeClick={onNodeClick}
          />

          {/* Corner stats */}
          <div className="absolute bottom-4 left-4 flex items-center gap-3 px-3 py-1.5 rounded-lg glass border-primary/10 text-[10px] text-muted-foreground">
            <span>
              <span className="font-mono text-primary">{sourceCount}</span> sources
            </span>
            <span className="text-muted-foreground/30">|</span>
            <span>
              <span className="font-mono text-primary">{conceptCount}</span> concepts
            </span>
            <span className="text-muted-foreground/30">|</span>
            <span>
              <span className="font-mono text-primary">{snapshot.linkCount}</span> edges
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
