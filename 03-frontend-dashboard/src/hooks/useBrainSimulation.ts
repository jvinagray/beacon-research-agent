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
  getContentColor,
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
            if (d.type === "spine") return 100;
            if (d.type === "source-to-stage") return 80;
            if (d.type === "concept-to-source") return 60;
            return 50;
          })
      )
      .force("charge", d3.forceManyBody().strength(-300))
      .force(
        "collide",
        d3.forceCollide<GraphNode>((d) =>
          (d as SourceNodeData).radius
            ? (d as SourceNodeData).radius + 6
            : 28
        )
      )
      .force(
        "center",
        d3.forceCenter(dimensions.width / 2, dimensions.height / 2)
      )
      .force("y", d3.forceY(dimensions.height * 0.55).strength(0.04))
      .on("tick", () => {
        if (!svgRef.current) return;
        const svg = d3.select(svgRef.current);

        svg
          .selectAll<SVGCircleElement, GraphNode>(".node-source, .node-stage")
          .attr("cx", (d) => d.x ?? 0)
          .attr("cy", (d) => d.y ?? 0);

        svg
          .selectAll<SVGRectElement, GraphNode>(".node-concept")
          .attr("x", (d) => (d.x ?? 0) - 30)
          .attr("y", (d) => (d.y ?? 0) - 12);

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
          .attr("y", (d) => (d.y ?? 0) + 4);
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
            .attr("stroke-opacity", 0)
            .transition()
            .duration(300)
            .attr("stroke-opacity", 1),
        (update) => update,
        (exit) => exit.transition().duration(200).attr("stroke-opacity", 0).remove(),
      );

    // --- Nodes ---
    const stageColor = "hsl(210, 60%, 50%)";
    const stageActiveColor = "hsl(210, 80%, 60%)";
    const stageCompleteColor = "hsl(142, 71%, 45%)";

    // Stage nodes (circles)
    nodeGroup
      .selectAll<SVGCircleElement, GraphNode>("circle.node-stage")
      .data(
        nodesRef.current.filter((n) => n.type === "stage") as StageNodeData[],
        (d) => d.id,
      )
      .join(
        (enter) =>
          enter
            .append("circle")
            .attr("class", "node node-stage")
            .attr("r", 20)
            .attr("fill", stageColor)
            .attr("stroke", "rgba(255,255,255,0.3)")
            .attr("stroke-width", 2)
            .attr("cx", (d) => d.fx ?? d.x ?? 0)
            .attr("cy", (d) => d.fy ?? d.y ?? 0),
        (update) =>
          update
            .attr("fill", (d) => {
              if (d.state === "active") return stageActiveColor;
              if (d.state === "complete") return stageCompleteColor;
              return stageColor;
            })
            .attr("class", (d) => {
              const cls = ["node", "node-stage"];
              if (d.state === "active") cls.push("pulse-fast");
              return cls.join(" ");
            }),
        (exit) => exit.remove(),
      );

    // Source nodes (circles)
    nodeGroup
      .selectAll<SVGCircleElement, GraphNode>("circle.node-source")
      .data(
        nodesRef.current.filter((n) => n.type === "source") as SourceNodeData[],
        (d) => d.id,
      )
      .join(
        (enter) =>
          enter
            .append("circle")
            .attr("class", "node node-source spawned")
            .attr("r", (d) => d.radius)
            .attr("fill", (d) => getContentColor(d.contentCategory))
            .attr("fill-opacity", (d) => d.opacity ?? 1)
            .attr("stroke", "rgba(255,255,255,0.2)")
            .attr("stroke-width", 1)
            .attr("cx", (d) => d.x ?? 0)
            .attr("cy", (d) => d.y ?? 0),
        (update) => update,
        (exit) => exit.transition().duration(200).attr("r", 0).remove(),
      );

    // Concept nodes (rects)
    nodeGroup
      .selectAll<SVGRectElement, GraphNode>("rect.node-concept")
      .data(
        nodesRef.current.filter((n) => n.type === "concept") as ConceptNodeData[],
        (d) => d.id,
      )
      .join(
        (enter) =>
          enter
            .append("rect")
            .attr("class", "node node-concept bloomed")
            .attr("width", 60)
            .attr("height", 24)
            .attr("rx", 6)
            .attr("fill", "hsl(262, 60%, 30%)")
            .attr("stroke", "hsl(262, 83%, 58%)")
            .attr("stroke-width", 1)
            .attr("x", (d) => (d.x ?? 0) - 30)
            .attr("y", (d) => (d.y ?? 0) - 12),
        (update) => update,
        (exit) => exit.remove(),
      );

    // --- Labels ---
    // Stage labels
    labelGroup
      .selectAll<SVGTextElement, GraphNode>("text.stage-label")
      .data(
        nodesRef.current.filter((n) => n.type === "stage") as StageNodeData[],
        (d) => d.id,
      )
      .join(
        (enter) =>
          enter
            .append("text")
            .attr("class", "node-label stage-label")
            .attr("font-size", "9px")
            .attr("font-weight", "bold")
            .attr("x", (d) => d.fx ?? d.x ?? 0)
            .attr("y", (d) => (d.fy ?? d.y ?? 0) + 4)
            .text((d) => d.label),
        (update) => update,
        (exit) => exit.remove(),
      );

    // Concept labels
    labelGroup
      .selectAll<SVGTextElement, GraphNode>("text.concept-text-label")
      .data(
        nodesRef.current.filter((n) => n.type === "concept") as ConceptNodeData[],
        (d) => d.id,
      )
      .join(
        (enter) =>
          enter
            .append("text")
            .attr("class", "concept-label concept-text-label")
            .attr("x", (d) => d.x ?? 0)
            .attr("y", (d) => (d.y ?? 0) + 4)
            .text((d) => {
              const name = d.name;
              return name.length > 10 ? name.slice(0, 9) + "\u2026" : name;
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
          // Remove lowest and its link (handle D3-resolved object refs)
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
      // Use a higher alpha so the tick handler fires enough to position everything
      simulationRef.current?.alpha(0.3).restart();
    },
    [updateSimulation, renderElements]
  );

  const destroy = useCallback(() => {
    simulationRef.current?.stop();
    nodesRef.current = [];
    linksRef.current = [];
    // Clear SVG elements
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
