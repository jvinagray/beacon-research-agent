import { useEffect, useRef, useState } from "react";
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
          url: n.id, // source node IDs are URLs
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

  // Measure container dimensions when dialog opens
  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    const measure = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) {
        setDimensions({ width: rect.width, height: rect.height });
      }
    };

    // Measure after dialog animation settles
    const timer = setTimeout(measure, 100);

    const observer = new ResizeObserver(measure);
    if (containerRef.current) observer.observe(containerRef.current);

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [isOpen]);

  // Consolidated init/destroy lifecycle
  useEffect(() => {
    if (!isOpen) return;
    sim.initFromSnapshot(snapshot);
    return () => {
      sim.destroy();
    };
  }, [isOpen, snapshot, sim.initFromSnapshot, sim.destroy]);

  const hydratedNodes = hydrateSnapshotNodes(snapshot.nodes);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[80vw] h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Brain Graph</DialogTitle>
          <DialogDescription className="sr-only">
            Interactive brain graph visualization showing research connections
          </DialogDescription>
        </DialogHeader>
        <div ref={containerRef} className="flex-1 min-h-0">
          <BrainGraph
            svgRef={svgRef}
            minimized={false}
            onMinimize={() => {}}
            onRestore={() => {}}
            nodes={hydratedNodes}
            links={snapshot.links}
            onNodeClick={onNodeClick}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
