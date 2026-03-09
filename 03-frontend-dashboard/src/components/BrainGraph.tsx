import { useEffect, useId, useState, type RefObject } from "react";
import * as d3 from "d3";
import { Minimize2, Maximize2 } from "lucide-react";
import type { GraphNode, GraphLink } from "@/types/brain-graph";
import { BrainGraphTooltip } from "./BrainGraphTooltip";
import "./BrainGraph.css";

interface HoveredNodeState {
  node: GraphNode;
  x: number;
  y: number;
  linkedSourceTitles?: string[];
}

interface BrainGraphProps {
  svgRef: RefObject<SVGSVGElement | null>;
  minimized: boolean;
  onMinimize: () => void;
  onRestore: () => void;
  className?: string;
  nodes?: GraphNode[];
  links?: GraphLink[];
}

/** D3 forceLink mutates link endpoints from string IDs to node objects. */
function getLinkEndpoint(endpoint: string | { id: string }): string {
  return typeof endpoint === "object" && endpoint !== null
    ? endpoint.id
    : endpoint;
}

export function BrainGraph({
  svgRef,
  minimized,
  onMinimize,
  onRestore,
  className,
  nodes,
  links,
}: BrainGraphProps) {
  const filterId = useId();
  const glowId = `glow-${filterId.replace(/:/g, "")}`;
  const [hoveredNode, setHoveredNode] = useState<HoveredNodeState | null>(null);

  // Clear tooltip when graph is minimized
  useEffect(() => {
    if (minimized) setHoveredNode(null);
  }, [minimized]);

  // Set up zoom/pan behavior
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const svg = d3.select(svgEl);
    const zoomGroup = svg.select<SVGGElement>(".zoom-group");

    const zoomBehavior = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on("zoom", (event) => {
        zoomGroup.attr("transform", event.transform);
      });

    svg.call(zoomBehavior);

    return () => {
      svg.on(".zoom", null);
    };
  }, [svgRef]);

  // Set up hover event listeners on node elements
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const svg = d3.select(svgEl);
    const nodeGroup = svg.select<SVGGElement>(".nodes");

    function handleMouseEnter(event: MouseEvent, d: GraphNode) {
      let linkedTitles: string[] | undefined;
      if (d.type === "concept" && links && nodes) {
        linkedTitles = links
          .filter(
            (l) =>
              (getLinkEndpoint(l.source) === d.id ||
                getLinkEndpoint(l.target) === d.id) &&
              l.type === "concept-to-source",
          )
          .map((l) => {
            const otherId =
              getLinkEndpoint(l.source) === d.id
                ? getLinkEndpoint(l.target)
                : getLinkEndpoint(l.source);
            const node = nodes.find((n) => n.id === otherId);
            return node?.type === "source" ? node.title : otherId;
          });
      }
      setHoveredNode({
        node: d,
        x: event.clientX,
        y: event.clientY,
        linkedSourceTitles: linkedTitles,
      });
    }

    function handleMouseLeave() {
      setHoveredNode(null);
    }

    nodeGroup
      .selectAll<SVGElement, GraphNode>(".node")
      .on("mouseenter", function (event, d) {
        handleMouseEnter(event as unknown as MouseEvent, d);
      })
      .on("mouseleave", handleMouseLeave);

    return () => {
      nodeGroup
        .selectAll<SVGElement, GraphNode>(".node")
        .on("mouseenter", null)
        .on("mouseleave", null);
    };
  }, [svgRef, nodes, links]);

  const containerClasses = [
    "brain-graph-container",
    "glass-morphism",
    minimized ? "minimized" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={containerClasses}>
      <svg ref={svgRef} width="100%" height="100%">
        <defs>
          <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g className="zoom-group">
          <g className="links"></g>
          <g className="nodes"></g>
          <g className="labels"></g>
        </g>
      </svg>
      <button
        className="brain-graph-control"
        onClick={minimized ? onRestore : onMinimize}
        aria-label={minimized ? "Restore graph" : "Minimize graph"}
      >
        {minimized ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
      </button>
      {!minimized && (
        <BrainGraphTooltip
          hoveredNode={hoveredNode?.node ?? null}
          x={hoveredNode?.x ?? 0}
          y={hoveredNode?.y ?? 0}
          linkedSourceTitles={hoveredNode?.linkedSourceTitles}
        />
      )}
    </div>
  );
}
