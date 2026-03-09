import { useRef, useEffect, useCallback, type RefObject } from "react";
import * as d3 from "d3";
import type {
  GraphNode,
  GraphLink,
  ConceptNodeData,
  SerializedGraphSnapshot,
  SourceNodeData,
  StageNodeData,
} from "@/types/brain-graph";
import type { EvaluatedSource } from "@/types/research";
import {
  mapContentType,
  computeSourceRadius,
  computeSourceOpacity,
} from "@/lib/brain-graph-utils";

const MAX_SOURCES = 25;

/** Extract string ID from a link endpoint that may be a D3-resolved object ref */
function linkId(endpoint: string | GraphNode | any): string {
  return typeof endpoint === "object" && endpoint !== null
    ? endpoint.id
    : endpoint;
}

const STAGE_DEFS: Array<{
  id: string;
  label: StageNodeData["label"];
  fxRatio: number;
}> = [
  { id: "stage-search", label: "SEARCH", fxRatio: 0.15 },
  { id: "stage-evaluate", label: "EVALUATE", fxRatio: 0.38 },
  { id: "stage-extract", label: "EXTRACT", fxRatio: 0.62 },
  { id: "stage-synthesize", label: "SYNTHESIZE", fxRatio: 0.85 },
];

/** Resolve the SVG filter/gradient ID prefix from the defs in the SVG */
function getIdPrefix(svgEl: SVGSVGElement): string {
  // The BrainGraph component uses useId() and strips colons
  // Find any gradient/filter that starts with a known suffix
  const defs = svgEl.querySelector("defs");
  if (!defs) return "";
  const firstGrad = defs.querySelector("[id$='-grad-academic']");
  if (firstGrad) {
    return firstGrad.id.replace("-grad-academic", "");
  }
  const firstFilter = defs.querySelector("[id$='-stage-glow-idle']");
  if (firstFilter) {
    return firstFilter.id.replace("-stage-glow-idle", "");
  }
  return "";
}

/** Map content category to gradient ID */
function getGradientUrl(prefix: string, category: string): string {
  const map: Record<string, string> = {
    academic: "grad-academic",
    news: "grad-news",
    docs: "grad-docs",
    media: "grad-media",
    other: "grad-other",
  };
  return `url(#${prefix}-${map[category] ?? "grad-other"})`;
}

export function useBrainSimulation(
  svgRef: RefObject<SVGSVGElement | null>,
  dimensions: { width: number; height: number }
) {
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(
    null
  );
  const nodesRef = useRef<GraphNode[]>([]);
  const linksRef = useRef<GraphLink[]>([]);
  const moreCountRef = useRef(0);

  // Initialize simulation
  useEffect(() => {
    const sim = d3
      .forceSimulation<GraphNode, GraphLink>(nodesRef.current)
      .force(
        "link",
        d3
          .forceLink<GraphNode, GraphLink>(linksRef.current)
          .id((d) => d.id)
          .distance((d) => {
            if (d.type === "spine") return 120;
            if (d.type === "source-to-stage") return 100;
            if (d.type === "concept-to-source") return 70;
            return 60;
          })
      )
      .force("charge", d3.forceManyBody().strength(-400))
      .force(
        "collide",
        d3.forceCollide<GraphNode>((d) =>
          (d as SourceNodeData).radius
            ? (d as SourceNodeData).radius + 8
            : 30
        )
      )
      .force(
        "center",
        d3.forceCenter(dimensions.width / 2, dimensions.height / 2)
      )
      .force("y", d3.forceY(dimensions.height * 0.55).strength(0.03))
      .on("tick", () => {
        if (!svgRef.current) return;
        const svg = d3.select(svgRef.current);

        svg
          .selectAll<SVGCircleElement, GraphNode>(".node-source, .node-stage")
          .attr("cx", (d) => d.x ?? 0)
          .attr("cy", (d) => d.y ?? 0);

        // Pulse rings follow stage nodes
        svg
          .selectAll<SVGCircleElement, GraphNode>(".pulse-ring")
          .attr("cx", (d) => d.x ?? 0)
          .attr("cy", (d) => d.y ?? 0);

        svg
          .selectAll<SVGRectElement, GraphNode>(".node-concept")
          .attr("x", (d) => (d.x ?? 0) - 32)
          .attr("y", (d) => (d.y ?? 0) - 11);

        svg
          .selectAll<SVGLineElement, GraphLink>(".link")
          .attr("x1", (d) => ((d.source as unknown as GraphNode).x ?? 0))
          .attr("y1", (d) => ((d.source as unknown as GraphNode).y ?? 0))
          .attr("x2", (d) => ((d.target as unknown as GraphNode).x ?? 0))
          .attr("y2", (d) => ((d.target as unknown as GraphNode).y ?? 0));

        // Stage labels
        svg
          .selectAll<SVGTextElement, GraphNode>(".node-label")
          .attr("x", (d) => d.x ?? 0)
          .attr("y", (d) => (d.y ?? 0) + 4);

        // Concept labels
        svg
          .selectAll<SVGTextElement, GraphNode>(".concept-text-label")
          .attr("x", (d) => d.x ?? 0)
          .attr("y", (d) => (d.y ?? 0) + 1);
      });

    simulationRef.current = sim;

    return () => {
      sim.stop();
    };
  }, [dimensions.width, dimensions.height, svgRef]);

  const updateSimulation = useCallback(() => {
    const sim = simulationRef.current;
    if (!sim) return;
    sim.nodes(nodesRef.current);
    const linkForce = sim.force("link") as d3.ForceLink<GraphNode, GraphLink>;
    if (linkForce) linkForce.links(linksRef.current);
  }, []);

  /** D3 enter/update/exit — creates and updates SVG elements from data arrays */
  const renderElements = useCallback(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const prefix = getIdPrefix(svgEl);
    const svg = d3.select(svgEl);
    const linkGroup = svg.select<SVGGElement>(".zoom-group .links");
    const nodeGroup = svg.select<SVGGElement>(".zoom-group .nodes");
    const labelGroup = svg.select<SVGGElement>(".zoom-group .labels");

    // --- Links ---
    linkGroup
      .selectAll<SVGLineElement, GraphLink>("line")
      .data(linksRef.current, (d) => `${linkId(d.source)}-${linkId(d.target)}`)
      .join(
        (enter) =>
          enter
            .append("line")
            .attr("class", (d) => {
              const classes = ["link"];
              if (d.type === "spine") classes.push("link-spine");
              else if (d.type === "source-to-stage") classes.push("link-source-to-stage");
              else if (d.type === "concept-to-source") classes.push("link-concept-to-source");
              return classes.join(" ");
            })
            .attr("filter", (d) => d.type === "spine" ? `url(#${prefix}-link-glow)` : null)
            .attr("stroke-opacity", 0)
            .transition()
            .duration(400)
            .attr("stroke-opacity", 1),
        (update) => update,
        (exit) => exit.transition().duration(200).attr("stroke-opacity", 0).remove(),
      );

    // --- Nodes ---
    const stageNodes = nodesRef.current.filter((n) => n.type === "stage") as StageNodeData[];
    const sourceNodes = nodesRef.current.filter((n) => n.type === "source") as SourceNodeData[];
    const conceptNodes = nodesRef.current.filter((n) => n.type === "concept") as ConceptNodeData[];

    // Stage nodes (circles with gradient fills and glow)
    nodeGroup
      .selectAll<SVGCircleElement, StageNodeData>("circle.node-stage")
      .data(stageNodes, (d) => d.id)
      .join(
        (enter) =>
          enter
            .append("circle")
            .attr("class", "node node-stage node-stage-idle")
            .attr("r", 18)
            .attr("fill", `url(#${prefix}-stage-idle)`)
            .attr("stroke", "rgba(100, 180, 255, 0.4)")
            .attr("stroke-width", 1.5)
            .attr("filter", `url(#${prefix}-stage-glow-idle)`)
            .attr("cx", (d) => d.fx ?? d.x ?? 0)
            .attr("cy", (d) => d.fy ?? d.y ?? 0),
        (update) =>
          update
            .attr("fill", (d) => {
              if (d.state === "active") return `url(#${prefix}-stage-active)`;
              if (d.state === "complete") return `url(#${prefix}-stage-complete)`;
              return `url(#${prefix}-stage-idle)`;
            })
            .attr("stroke", (d) => {
              if (d.state === "active") return "rgba(100, 200, 255, 0.7)";
              if (d.state === "complete") return "rgba(100, 255, 180, 0.5)";
              return "rgba(100, 180, 255, 0.4)";
            })
            .attr("filter", (d) => {
              if (d.state === "active") return `url(#${prefix}-stage-glow-active)`;
              if (d.state === "complete") return `url(#${prefix}-stage-glow-complete)`;
              return `url(#${prefix}-stage-glow-idle)`;
            })
            .attr("class", (d) => {
              const cls = ["node", "node-stage"];
              if (d.state === "idle") cls.push("node-stage-idle");
              else if (d.state === "active") cls.push("node-stage-active");
              else if (d.state === "complete") cls.push("node-stage-complete");
              return cls.join(" ");
            }),
        (exit) => exit.remove(),
      );

    // Pulse rings for active stages
    nodeGroup
      .selectAll<SVGCircleElement, StageNodeData>("circle.pulse-ring")
      .data(stageNodes.filter((s) => s.state === "active"), (d) => `ring-${d.id}`)
      .join(
        (enter) =>
          enter
            .append("circle")
            .attr("class", "pulse-ring")
            .attr("r", 24)
            .attr("fill", "none")
            .attr("stroke", "rgba(100, 200, 255, 0.5)")
            .attr("stroke-width", 1.5)
            .attr("cx", (d) => d.fx ?? d.x ?? 0)
            .attr("cy", (d) => d.fy ?? d.y ?? 0),
        (update) => update,
        (exit) => exit.remove(),
      );

    // Source nodes (circles with radial gradients and glow)
    nodeGroup
      .selectAll<SVGCircleElement, SourceNodeData>("circle.node-source")
      .data(sourceNodes, (d) => d.id)
      .join(
        (enter) =>
          enter
            .append("circle")
            .attr("class", "node node-source spawned")
            .attr("r", (d) => d.radius)
            .attr("fill", (d) => getGradientUrl(prefix, d.contentCategory))
            .attr("fill-opacity", (d) => d.opacity ?? 1)
            .attr("stroke", (d) => {
              const colors: Record<string, string> = {
                academic: "rgba(100, 160, 255, 0.4)",
                news: "rgba(255, 180, 80, 0.4)",
                docs: "rgba(80, 220, 150, 0.4)",
                media: "rgba(180, 120, 255, 0.4)",
                other: "rgba(150, 160, 170, 0.3)",
              };
              return colors[d.contentCategory] ?? colors.other;
            })
            .attr("stroke-width", 1)
            .attr("filter", `url(#${prefix}-orb-glow)`)
            .attr("cx", (d) => d.x ?? 0)
            .attr("cy", (d) => d.y ?? 0),
        (update) => update,
        (exit) => exit.transition().duration(200).attr("r", 0).attr("opacity", 0).remove(),
      );

    // Concept nodes (rounded rects with gradient and glow)
    nodeGroup
      .selectAll<SVGRectElement, ConceptNodeData>("rect.node-concept")
      .data(conceptNodes, (d) => d.id)
      .join(
        (enter) =>
          enter
            .append("rect")
            .attr("class", "node node-concept bloomed")
            .attr("width", 64)
            .attr("height", 22)
            .attr("rx", 11)
            .attr("fill", `url(#${prefix}-concept-fill)`)
            .attr("stroke", "rgba(180, 130, 255, 0.45)")
            .attr("stroke-width", 1)
            .attr("filter", `url(#${prefix}-concept-glow)`)
            .attr("x", (d) => (d.x ?? 0) - 32)
            .attr("y", (d) => (d.y ?? 0) - 11),
        (update) => update,
        (exit) => exit.remove(),
      );

    // --- Labels ---
    // Stage labels
    labelGroup
      .selectAll<SVGTextElement, StageNodeData>("text.stage-label")
      .data(stageNodes, (d) => d.id)
      .join(
        (enter) =>
          enter
            .append("text")
            .attr("class", "node-label stage-label")
            .attr("filter", `url(#${prefix}-text-glow)`)
            .attr("x", (d) => d.fx ?? d.x ?? 0)
            .attr("y", (d) => (d.fy ?? d.y ?? 0) + 4)
            .text((d) => d.label),
        (update) => update,
        (exit) => exit.remove(),
      );

    // Concept labels
    labelGroup
      .selectAll<SVGTextElement, ConceptNodeData>("text.concept-text-label")
      .data(conceptNodes, (d) => d.id)
      .join(
        (enter) =>
          enter
            .append("text")
            .attr("class", "concept-label concept-text-label")
            .attr("x", (d) => d.x ?? 0)
            .attr("y", (d) => (d.y ?? 0) + 1)
            .text((d) => {
              const name = d.name;
              return name.length > 9 ? name.slice(0, 8) + "\u2026" : name;
            }),
        (update) => update,
        (exit) => exit.remove(),
      );
  }, [svgRef]);

  const addStageNodes = useCallback(() => {
    const fyVal = dimensions.height * 0.3;
    const stages: StageNodeData[] = STAGE_DEFS.map((def) => ({
      id: def.id,
      type: "stage" as const,
      label: def.label,
      state: "idle" as const,
      fx: dimensions.width * def.fxRatio,
      fy: fyVal,
    }));

    nodesRef.current.push(...stages);

    const spineLinks: GraphLink[] = [];
    for (let i = 0; i < STAGE_DEFS.length - 1; i++) {
      spineLinks.push({
        source: STAGE_DEFS[i].id,
        target: STAGE_DEFS[i + 1].id,
        type: "spine",
      });
    }
    linksRef.current.push(...spineLinks);

    updateSimulation();
    renderElements();
    simulationRef.current?.alpha(0.3).restart();
  }, [dimensions.width, dimensions.height, updateSimulation, renderElements]);

  const addSourceNode = useCallback(
    (source: EvaluatedSource) => {
      const score = source.signals.learning_efficiency_score;
      const newNode: SourceNodeData = {
        id: source.url,
        type: "source",
        url: source.url,
        title: source.title,
        score,
        contentCategory: mapContentType(source.signals.content_type),
        radius: computeSourceRadius(score),
        opacity: computeSourceOpacity(score),
      };

      // Guard against duplicate source URLs
      if (nodesRef.current.some((n) => n.id === source.url)) return;

      const sourceNodes = nodesRef.current.filter(
        (n) => n.type === "source"
      ) as SourceNodeData[];

      if (sourceNodes.length >= MAX_SOURCES) {
        const lowest = sourceNodes.reduce((min, n) =>
          n.score < min.score ? n : min
        );
        if (score > lowest.score) {
          nodesRef.current = nodesRef.current.filter(
            (n) => n.id !== lowest.id
          );
          linksRef.current = linksRef.current.filter(
            (l) =>
              linkId(l.source) !== lowest.id &&
              linkId(l.target) !== lowest.id
          );
        } else {
          moreCountRef.current++;
          return;
        }
      }

      nodesRef.current.push(newNode);
      linksRef.current.push({
        source: source.url,
        target: "stage-evaluate",
        type: "source-to-stage",
      });

      updateSimulation();
      renderElements();
      simulationRef.current?.alpha(0.3).restart();
    },
    [updateSimulation, renderElements]
  );

  const addConceptNodes = useCallback(
    (concepts: ConceptNodeData[], sourceLinks: GraphLink[]) => {
      nodesRef.current.push(...concepts);
      linksRef.current.push(...sourceLinks);
      updateSimulation();
      renderElements();
      simulationRef.current?.alpha(0.5).restart();
    },
    [updateSimulation, renderElements]
  );

  const activateStage = useCallback((stage: string) => {
    const node = nodesRef.current.find(
      (n) => n.id === `stage-${stage}`
    ) as StageNodeData | undefined;
    if (node) {
      node.state = "active";
      renderElements();
    }
  }, [renderElements]);

  const completeStage = useCallback((stage: string) => {
    const node = nodesRef.current.find(
      (n) => n.id === `stage-${stage}`
    ) as StageNodeData | undefined;
    if (node) {
      node.state = "complete";
      renderElements();
    }
  }, [renderElements]);

  const settle = useCallback(() => {
    simulationRef.current?.alphaTarget(0);
  }, []);

  const getSnapshot = useCallback((): SerializedGraphSnapshot => {
    return {
      nodes: nodesRef.current.map((n) => ({
        id: n.id,
        type: n.type,
        label: n.type === "stage" ? (n as StageNodeData).label : undefined,
        title: n.type === "source" ? (n as SourceNodeData).title : undefined,
        name: n.type === "concept" ? (n as ConceptNodeData).name : undefined,
        x: n.x ?? 0,
        y: n.y ?? 0,
        radius:
          n.type === "source"
            ? (n as SourceNodeData).radius
            : n.type === "concept"
              ? (n as ConceptNodeData).radius
              : 20,
        contentCategory:
          n.type === "source"
            ? (n as SourceNodeData).contentCategory
            : undefined,
        score:
          n.type === "source" ? (n as SourceNodeData).score : undefined,
        state:
          n.type === "stage" ? (n as StageNodeData).state : undefined,
      })),
      links: linksRef.current.map((l) => ({
        source: linkId(l.source),
        target: linkId(l.target),
        type: l.type,
      })),
      nodeCount: nodesRef.current.length,
      linkCount: linksRef.current.length,
    };
  }, []);

  const initFromSnapshot = useCallback(
    (snapshot: SerializedGraphSnapshot) => {
      nodesRef.current = snapshot.nodes.map((n) => ({
        ...n,
        fx: n.x,
        fy: n.y,
      })) as unknown as GraphNode[];
      linksRef.current = [...snapshot.links];
      updateSimulation();
      renderElements();
      simulationRef.current?.alpha(0.3).restart();
    },
    [updateSimulation, renderElements]
  );

  const destroy = useCallback(() => {
    simulationRef.current?.stop();
    nodesRef.current = [];
    linksRef.current = [];
    const svgEl = svgRef.current;
    if (svgEl) {
      const svg = d3.select(svgEl);
      svg.select(".zoom-group .links").selectAll("*").remove();
      svg.select(".zoom-group .nodes").selectAll("*").remove();
      svg.select(".zoom-group .labels").selectAll("*").remove();
    }
  }, [svgRef]);

  return {
    addStageNodes,
    addSourceNode,
    addConceptNodes,
    activateStage,
    completeStage,
    settle,
    getSnapshot,
    initFromSnapshot,
    destroy,
  };
}
