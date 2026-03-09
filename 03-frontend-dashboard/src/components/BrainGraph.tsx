import { useEffect, useId, type RefObject } from "react";
import * as d3 from "d3";
import { Minimize2, Maximize2 } from "lucide-react";
import "./BrainGraph.css";

interface BrainGraphProps {
  svgRef: RefObject<SVGSVGElement | null>;
  minimized: boolean;
  onMinimize: () => void;
  onRestore: () => void;
  className?: string;
}

export function BrainGraph({
  svgRef,
  minimized,
  onMinimize,
  onRestore,
  className,
}: BrainGraphProps) {
  const filterId = useId();
  const glowId = `glow-${filterId.replace(/:/g, "")}`;

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
    </div>
  );
}
