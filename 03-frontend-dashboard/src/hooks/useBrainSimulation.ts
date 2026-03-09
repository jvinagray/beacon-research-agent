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
      )
      .force("charge", d3.forceManyBody().strength(-150))
      .force(
        "collide",
        d3.forceCollide<GraphNode>((d) =>
          (d as SourceNodeData).radius
            ? (d as SourceNodeData).radius + 4
            : 24
        )
      )
      .force(
        "center",
        d3.forceCenter(dimensions.width / 2, dimensions.height / 2)
      )
      .force("y", d3.forceY(dimensions.height * 0.6).strength(0.05))
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

        svg
          .selectAll<SVGTextElement, GraphNode>(".node-label")
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
    simulationRef.current?.alpha(0.3).restart();
  }, [dimensions.width, dimensions.height, updateSimulation]);

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
      simulationRef.current?.alpha(0.3).restart();
    },
    [updateSimulation]
  );

  const addConceptNodes = useCallback(
    (concepts: ConceptNodeData[], sourceLinks: GraphLink[]) => {
      nodesRef.current.push(...concepts);
      linksRef.current.push(...sourceLinks);
      updateSimulation();
      simulationRef.current?.alpha(0.5).restart();
    },
    [updateSimulation]
  );

  const activateStage = useCallback((stage: string) => {
    const node = nodesRef.current.find(
      (n) => n.id === `stage-${stage}`
    ) as StageNodeData | undefined;
    if (node) node.state = "active";
  }, []);

  const completeStage = useCallback((stage: string) => {
    const node = nodesRef.current.find(
      (n) => n.id === `stage-${stage}`
    ) as StageNodeData | undefined;
    if (node) node.state = "complete";
  }, []);

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
      simulationRef.current?.alpha(0.01).restart();
    },
    [updateSimulation]
  );

  const destroy = useCallback(() => {
    simulationRef.current?.stop();
    nodesRef.current = [];
    linksRef.current = [];
  }, []);

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
