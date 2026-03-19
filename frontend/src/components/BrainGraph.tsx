import { useEffect, useId, useRef, useState, type RefObject } from "react";
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
  onNodeClick?: (nodeType: "stage" | "source" | "concept", nodeId: string) => void;
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
  onNodeClick,
}: BrainGraphProps) {
  const filterId = useId();
  const p = filterId.replace(/:/g, ""); // prefix for IDs
  const [hoveredNode, setHoveredNode] = useState<HoveredNodeState | null>(null);
  const [pinnedNode, setPinnedNode] = useState<HoveredNodeState | null>(null);
  const pinnedNodeRef = useRef<HoveredNodeState | null>(null);

  useEffect(() => { pinnedNodeRef.current = pinnedNode; }, [pinnedNode]);

  useEffect(() => {
    if (minimized) {
      setHoveredNode(null);
      setPinnedNode(null);
    }
  }, [minimized]);

  // Zoom/pan
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
    return () => { svg.on(".zoom", null); };
  }, [svgRef]);

  // Hover/click event listeners
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
      if (!pinnedNodeRef.current) setHoveredNode(null);
    }

    function handleClick(event: MouseEvent, d: GraphNode) {
      event.stopPropagation();
      switch (d.type) {
        case "source": {
          try {
            const parsed = new URL(d.url);
            if (parsed.protocol === "http:" || parsed.protocol === "https:") {
              window.open(d.url, "_blank", "noopener,noreferrer");
            }
          } catch { /* invalid URL */ }
          onNodeClick?.("source", d.id);
          break;
        }
        case "stage":
          if (onNodeClick) onNodeClick("stage", d.id);
          else setPinnedNode({ node: d, x: event.clientX, y: event.clientY });
          break;
        case "concept":
          if (onNodeClick) onNodeClick("concept", d.id);
          else {
            let linkedTitles: string[] | undefined;
            if (links && nodes) {
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
            setPinnedNode({ node: d, x: event.clientX, y: event.clientY, linkedSourceTitles: linkedTitles });
          }
          break;
      }
    }

    nodeGroup
      .selectAll<SVGElement, GraphNode>(".node")
      .on("mouseenter", function (event, d) {
        handleMouseEnter(event as unknown as MouseEvent, d);
      })
      .on("mouseleave", handleMouseLeave)
      .on("click", function (event, d) {
        handleClick(event as unknown as MouseEvent, d);
      })
      .style("cursor", "pointer");

    return () => {
      nodeGroup
        .selectAll<SVGElement, GraphNode>(".node")
        .on("mouseenter", null)
        .on("mouseleave", null)
        .on("click", null);
    };
  }, [svgRef, nodes, links, onNodeClick]);

  const containerClasses = [
    "brain-graph-container",
    minimized ? "minimized" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={containerClasses}>
      <svg ref={svgRef} width="100%" height="100%" onClick={(e) => {
        if (e.target === e.currentTarget) setPinnedNode(null);
      }}>
        <defs>
          {/* Glow filters */}
          <filter id={`${p}-orb`} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <filter id={`${p}-concept`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <filter id={`${p}-link`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <filter id={`${p}-text`} x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="0.8" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>

          {/* Source orb radial gradients */}
          <radialGradient id={`${p}-academic`} cx="35%" cy="35%">
            <stop offset="0%" stopColor="hsl(217, 95%, 80%)" />
            <stop offset="50%" stopColor="hsl(217, 91%, 60%)" />
            <stop offset="100%" stopColor="hsl(217, 80%, 30%)" />
          </radialGradient>
          <radialGradient id={`${p}-news`} cx="35%" cy="35%">
            <stop offset="0%" stopColor="hsl(38, 95%, 75%)" />
            <stop offset="50%" stopColor="hsl(38, 92%, 50%)" />
            <stop offset="100%" stopColor="hsl(30, 80%, 28%)" />
          </radialGradient>
          <radialGradient id={`${p}-docs`} cx="35%" cy="35%">
            <stop offset="0%" stopColor="hsl(155, 80%, 68%)" />
            <stop offset="50%" stopColor="hsl(155, 71%, 45%)" />
            <stop offset="100%" stopColor="hsl(155, 60%, 22%)" />
          </radialGradient>
          <radialGradient id={`${p}-media`} cx="35%" cy="35%">
            <stop offset="0%" stopColor="hsl(270, 90%, 78%)" />
            <stop offset="50%" stopColor="hsl(262, 83%, 58%)" />
            <stop offset="100%" stopColor="hsl(262, 70%, 28%)" />
          </radialGradient>
          <radialGradient id={`${p}-other`} cx="35%" cy="35%">
            <stop offset="0%" stopColor="hsl(220, 15%, 62%)" />
            <stop offset="50%" stopColor="hsl(220, 9%, 46%)" />
            <stop offset="100%" stopColor="hsl(220, 8%, 22%)" />
          </radialGradient>

          {/* Grid pattern */}
          <pattern id={`${p}-grid`} width="30" height="30" patternUnits="userSpaceOnUse">
            <path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(45,212,170,0.10)" strokeWidth="0.3" />
          </pattern>

          {/* Scan gradient — uses app teal */}
          <linearGradient id={`${p}-scan`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(45,212,170,0)" />
            <stop offset="45%" stopColor="rgba(45,212,170,0.03)" />
            <stop offset="50%" stopColor="rgba(45,212,170,0.06)" />
            <stop offset="55%" stopColor="rgba(45,212,170,0.03)" />
            <stop offset="100%" stopColor="rgba(45,212,170,0)" />
          </linearGradient>
        </defs>

        {/* Ambient background */}
        <rect className="grid-bg" width="300%" height="300%" x="-100%" y="-100%"
          fill={`url(#${p}-grid)`} />
        <rect className="scan-line" width="100%" height="30%" x="0" y="0"
          fill={`url(#${p}-scan)`} />

        <g className="zoom-group">
          <g className="links"></g>
          <g className="nodes"></g>
        </g>
      </svg>
      {minimized && (
        <button
          className="brain-graph-control"
          onClick={onRestore}
          aria-label="Restore graph"
        >
          <Maximize2 size={16} />
        </button>
      )}
      {!minimized && (
        <BrainGraphTooltip
          hoveredNode={(pinnedNode ?? hoveredNode)?.node ?? null}
          x={(pinnedNode ?? hoveredNode)?.x ?? 0}
          y={(pinnedNode ?? hoveredNode)?.y ?? 0}
          linkedSourceTitles={(pinnedNode ?? hoveredNode)?.linkedSourceTitles}
        />
      )}
    </div>
  );
}
