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
  const idPrefix = filterId.replace(/:/g, "");
  const [hoveredNode, setHoveredNode] = useState<HoveredNodeState | null>(null);
  const [pinnedNode, setPinnedNode] = useState<HoveredNodeState | null>(null);
  const pinnedNodeRef = useRef<HoveredNodeState | null>(null);

  // Keep ref in sync with state (avoids pinnedNode in effect deps)
  useEffect(() => { pinnedNodeRef.current = pinnedNode; }, [pinnedNode]);

  // Clear tooltip when graph is minimized
  useEffect(() => {
    if (minimized) {
      setHoveredNode(null);
      setPinnedNode(null);
    }
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
          } catch {
            // invalid URL, silently ignore
          }
          onNodeClick?.("source", d.id);
          break;
        }
        case "stage":
          if (onNodeClick) {
            onNodeClick("stage", d.id);
          } else {
            setPinnedNode({ node: d, x: event.clientX, y: event.clientY });
          }
          break;
        case "concept":
          if (onNodeClick) {
            onNodeClick("concept", d.id);
          } else {
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
    "glass-morphism",
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
          {/* === GLOW FILTERS === */}
          <filter id={`${idPrefix}-stage-glow-idle`} x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <filter id={`${idPrefix}-stage-glow-active`} x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <filter id={`${idPrefix}-stage-glow-complete`} x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <filter id={`${idPrefix}-link-glow`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <filter id={`${idPrefix}-orb-glow`} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <filter id={`${idPrefix}-text-glow`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <filter id={`${idPrefix}-concept-glow`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>

          {/* === RADIAL GRADIENTS FOR SOURCE ORBS === */}
          <radialGradient id={`${idPrefix}-grad-academic`} cx="35%" cy="35%">
            <stop offset="0%" stopColor="hsl(217, 95%, 78%)" />
            <stop offset="50%" stopColor="hsl(217, 91%, 60%)" />
            <stop offset="100%" stopColor="hsl(217, 85%, 35%)" />
          </radialGradient>
          <radialGradient id={`${idPrefix}-grad-news`} cx="35%" cy="35%">
            <stop offset="0%" stopColor="hsl(38, 95%, 72%)" />
            <stop offset="50%" stopColor="hsl(38, 92%, 50%)" />
            <stop offset="100%" stopColor="hsl(30, 85%, 30%)" />
          </radialGradient>
          <radialGradient id={`${idPrefix}-grad-docs`} cx="35%" cy="35%">
            <stop offset="0%" stopColor="hsl(155, 80%, 65%)" />
            <stop offset="50%" stopColor="hsl(155, 71%, 45%)" />
            <stop offset="100%" stopColor="hsl(155, 65%, 25%)" />
          </radialGradient>
          <radialGradient id={`${idPrefix}-grad-media`} cx="35%" cy="35%">
            <stop offset="0%" stopColor="hsl(270, 90%, 75%)" />
            <stop offset="50%" stopColor="hsl(262, 83%, 58%)" />
            <stop offset="100%" stopColor="hsl(262, 75%, 32%)" />
          </radialGradient>
          <radialGradient id={`${idPrefix}-grad-other`} cx="35%" cy="35%">
            <stop offset="0%" stopColor="hsl(220, 15%, 60%)" />
            <stop offset="50%" stopColor="hsl(220, 9%, 46%)" />
            <stop offset="100%" stopColor="hsl(220, 10%, 25%)" />
          </radialGradient>

          {/* === STAGE NODE GRADIENTS === */}
          <radialGradient id={`${idPrefix}-stage-idle`} cx="35%" cy="35%">
            <stop offset="0%" stopColor="hsl(210, 70%, 60%)" />
            <stop offset="100%" stopColor="hsl(210, 60%, 30%)" />
          </radialGradient>
          <radialGradient id={`${idPrefix}-stage-active`} cx="35%" cy="35%">
            <stop offset="0%" stopColor="hsl(200, 100%, 75%)" />
            <stop offset="60%" stopColor="hsl(210, 90%, 55%)" />
            <stop offset="100%" stopColor="hsl(220, 80%, 35%)" />
          </radialGradient>
          <radialGradient id={`${idPrefix}-stage-complete`} cx="35%" cy="35%">
            <stop offset="0%" stopColor="hsl(155, 85%, 65%)" />
            <stop offset="60%" stopColor="hsl(155, 71%, 45%)" />
            <stop offset="100%" stopColor="hsl(155, 60%, 25%)" />
          </radialGradient>

          {/* === CONCEPT GRADIENT === */}
          <linearGradient id={`${idPrefix}-concept-fill`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="hsl(270, 50%, 25%)" />
            <stop offset="100%" stopColor="hsl(250, 45%, 18%)" />
          </linearGradient>

          {/* === GRID PATTERN === */}
          <pattern id={`${idPrefix}-grid`} width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(100,180,255,0.15)" strokeWidth="0.5" />
          </pattern>

          {/* === SCANNING LINE GRADIENT === */}
          <linearGradient id={`${idPrefix}-scan`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(80,160,255,0)" />
            <stop offset="45%" stopColor="rgba(80,160,255,0.06)" />
            <stop offset="50%" stopColor="rgba(80,160,255,0.12)" />
            <stop offset="55%" stopColor="rgba(80,160,255,0.06)" />
            <stop offset="100%" stopColor="rgba(80,160,255,0)" />
          </linearGradient>
        </defs>

        {/* Background grid */}
        <rect className="grid-bg" width="200%" height="200%" x="-50%" y="-50%"
          fill={`url(#${idPrefix}-grid)`} />

        {/* Scanning line */}
        <rect className="scan-line" width="100%" height="40%" x="0" y="0"
          fill={`url(#${idPrefix}-scan)`} />

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
          hoveredNode={(pinnedNode ?? hoveredNode)?.node ?? null}
          x={(pinnedNode ?? hoveredNode)?.x ?? 0}
          y={(pinnedNode ?? hoveredNode)?.y ?? 0}
          linkedSourceTitles={(pinnedNode ?? hoveredNode)?.linkedSourceTitles}
        />
      )}
    </div>
  );
}
