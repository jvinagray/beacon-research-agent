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

/** Get the SVG defs ID prefix from the rendered component */
function getIdPrefix(svgEl: SVGSVGElement): string {
  const el = svgEl.querySelector("defs [id$='-academic']");
  return el ? el.id.replace("-academic", "") : "";
}

/** Map content category to gradient URL */
function gradUrl(prefix: string, cat: string): string {
  const m: Record<string, string> = {
    academic: "academic", news: "news", docs: "docs", media: "media", other: "other",
  };
  return `url(#${prefix}-${m[cat] ?? "other"})`;
}

/** Truncate text to a max length */
function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "\u2026" : s;
}

/** Z-depth → visual scale (0.6 to 1.15) */
function depthScale(d: any): number {
  const z = (d._z ?? 0) as number;
  return 0.6 + (z + 1) * 0.275;
}

/** Z-depth → opacity (0.35 to 1.0) */
function depthOpacity(d: any): number {
  const z = (d._z ?? 0) as number;
  return 0.35 + (z + 1) * 0.325;
}

export function useBrainSimulation(
  svgRef: RefObject<SVGSVGElement | null>,
  dimensions: { width: number; height: number }
) {
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const linksRef = useRef<GraphLink[]>([]);
  const moreCountRef = useRef(0);
  const dimRef = useRef(dimensions);
  dimRef.current = dimensions;

  // Initialize simulation — wait for real dimensions
  useEffect(() => {
    if (dimensions.width === 0 || dimensions.height === 0) return;

    const cx = dimensions.width / 2;
    const cy = dimensions.height / 2;

    // Seed any existing nodes near center so they don't cluster at (0,0)
    for (const node of nodesRef.current) {
      if ((node.x ?? 0) === 0 && (node.y ?? 0) === 0) {
        node.x = cx + (Math.random() - 0.5) * 200;
        node.y = cy + (Math.random() - 0.5) * 200;
      }
    }

    const sim = d3
      .forceSimulation<GraphNode, GraphLink>(nodesRef.current)
      .force(
        "link",
        d3
          .forceLink<GraphNode, GraphLink>(linksRef.current)
          .id((d) => d.id)
          .distance(120)
          .strength(0.3)
      )
      .force("charge", d3.forceManyBody().strength((d) =>
        (d as GraphNode).type === "stage" ? 0 : -500
      ))
      .force(
        "collide",
        d3.forceCollide<GraphNode>((d) => {
          if ((d as GraphNode).type === "stage") return 0;
          if ((d as GraphNode).type === "concept") return 50;
          return ((d as SourceNodeData).radius ?? 10) + 30;
        })
      )
      .force("x", d3.forceX(cx).strength(0.025))
      .force("y", d3.forceY(cy).strength(0.025))
      .velocityDecay(0.4)
      .on("tick", () => {
        if (!svgRef.current) return;
        const svg = d3.select(svgRef.current);

        // Source groups
        svg.selectAll<SVGGElement, SourceNodeData>("g.source-group")
          .attr("transform", (d) =>
            `translate(${d.x ?? 0},${d.y ?? 0}) scale(${depthScale(d)})`
          )
          .attr("opacity", depthOpacity);

        // Concept groups
        svg.selectAll<SVGGElement, ConceptNodeData>("g.concept-group")
          .attr("transform", (d) =>
            `translate(${d.x ?? 0},${d.y ?? 0}) scale(${depthScale(d)})`
          )
          .attr("opacity", depthOpacity);

        // Links
        svg.selectAll<SVGLineElement, GraphLink>(".link")
          .attr("x1", (d) => ((d.source as unknown as GraphNode).x ?? 0))
          .attr("y1", (d) => ((d.source as unknown as GraphNode).y ?? 0))
          .attr("x2", (d) => ((d.target as unknown as GraphNode).x ?? 0))
          .attr("y2", (d) => ((d.target as unknown as GraphNode).y ?? 0));
      });

    simulationRef.current = sim;

    return () => { sim.stop(); };
  }, [dimensions.width, dimensions.height, svgRef]);

  const updateSimulation = useCallback(() => {
    const sim = simulationRef.current;
    if (!sim) return;
    sim.nodes(nodesRef.current);
    const linkForce = sim.force("link") as d3.ForceLink<GraphNode, GraphLink>;
    if (linkForce) linkForce.links(linksRef.current);
  }, []);

  /** D3 enter/update/exit — render labeled nodes and connections */
  const renderElements = useCallback(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const prefix = getIdPrefix(svgEl);
    const svg = d3.select(svgEl);
    const linkGroup = svg.select<SVGGElement>(".zoom-group .links");
    const nodeGroup = svg.select<SVGGElement>(".zoom-group .nodes");

    const sourceNodes = nodesRef.current.filter((n) => n.type === "source") as SourceNodeData[];
    const conceptNodes = nodesRef.current.filter((n) => n.type === "concept") as ConceptNodeData[];

    // Only render concept-to-source links (the meaningful connections)
    const visibleLinks = linksRef.current.filter((l) => l.type === "concept-to-source");

    // --- Links ---
    linkGroup
      .selectAll<SVGLineElement, GraphLink>("line")
      .data(visibleLinks, (d) => `${linkId(d.source)}-${linkId(d.target)}`)
      .join(
        (enter) =>
          enter
            .append("line")
            .attr("class", "link link-concept")
            .attr("filter", `url(#${prefix}-link)`)
            .attr("stroke-opacity", 0)
            .transition()
            .duration(600)
            .attr("stroke-opacity", 1),
        (update) => update,
        (exit) => exit.transition().duration(300).attr("stroke-opacity", 0).remove(),
      );

    // --- Source node groups (circle + title) ---
    const sourceJoin = nodeGroup
      .selectAll<SVGGElement, SourceNodeData>("g.source-group")
      .data(sourceNodes, (d) => d.id);

    const sourceEnter = sourceJoin.enter()
      .append("g")
      .attr("class", "source-group node spawning")
      .attr("transform", (d) =>
        `translate(${d.x ?? 0},${d.y ?? 0}) scale(${depthScale(d)})`
      )
      .attr("opacity", depthOpacity);

    // Orb
    sourceEnter
      .append("circle")
      .attr("class", "source-circle")
      .attr("r", (d) => d.radius)
      .attr("fill", (d) => gradUrl(prefix, d.contentCategory))
      .attr("fill-opacity", (d) => d.opacity ?? 1)
      .attr("stroke", (d) => {
        const c: Record<string, string> = {
          academic: "rgba(100,160,255,0.35)",
          news: "rgba(255,180,80,0.35)",
          docs: "rgba(80,220,150,0.35)",
          media: "rgba(180,120,255,0.35)",
          other: "rgba(150,160,170,0.25)",
        };
        return c[d.contentCategory] ?? c.other;
      })
      .attr("stroke-width", 0.8)
      .attr("filter", `url(#${prefix}-orb)`);

    // Title text below the orb
    sourceEnter
      .append("text")
      .attr("class", "source-title")
      .attr("y", (d) => d.radius + 14)
      .attr("filter", `url(#${prefix}-text)`)
      .text((d) => truncate(d.title, 36));

    sourceJoin.exit().transition().duration(300)
      .attr("opacity", 0)
      .attr("transform", (d: any) =>
        `translate(${d.x ?? 0},${d.y ?? 0}) scale(0)`
      )
      .remove();

    // --- Concept node groups (glowing text + subtle ring) ---
    const conceptJoin = nodeGroup
      .selectAll<SVGGElement, ConceptNodeData>("g.concept-group")
      .data(conceptNodes, (d) => d.id);

    const conceptEnter = conceptJoin.enter()
      .append("g")
      .attr("class", "concept-group node blooming")
      .attr("transform", (d) =>
        `translate(${d.x ?? 0},${d.y ?? 0}) scale(${depthScale(d)})`
      )
      .attr("opacity", depthOpacity);

    // Subtle halo ring
    conceptEnter
      .append("circle")
      .attr("r", 20)
      .attr("fill", "rgba(140, 100, 255, 0.06)")
      .attr("stroke", "rgba(160, 120, 255, 0.2)")
      .attr("stroke-width", 0.8);

    // Concept name
    conceptEnter
      .append("text")
      .attr("class", "concept-name")
      .attr("filter", `url(#${prefix}-concept)`)
      .text((d) => truncate(d.name, 18));

    conceptJoin.exit().remove();
  }, [svgRef]);

  // ================================================
  // Public API (unchanged contract for event bridge)
  // ================================================

  const addStageNodes = useCallback(() => {
    // Stage nodes exist for state tracking but are not rendered
    const stages: StageNodeData[] = STAGE_DEFS.map((def) => ({
      id: def.id,
      type: "stage" as const,
      label: def.label,
      state: "idle" as const,
      // No fx/fy — let them drift harmlessly (they're invisible and have 0 charge)
    }));
    nodesRef.current.push(...stages);
    // No spine links — the pipeline bar is gone
    updateSimulation();
    simulationRef.current?.alpha(0.1).restart();
  }, [updateSimulation]);

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
      // Assign random z-depth for 3D effect and seed position near center
      (newNode as any)._z = Math.random() * 2 - 1;
      const d = dimRef.current;
      newNode.x = d.width / 2 + (Math.random() - 0.5) * 300;
      newNode.y = d.height / 2 + (Math.random() - 0.5) * 300;

      if (nodesRef.current.some((n) => n.id === source.url)) return;

      const sourceNodes = nodesRef.current.filter(
        (n) => n.type === "source"
      ) as SourceNodeData[];

      if (sourceNodes.length >= MAX_SOURCES) {
        const lowest = sourceNodes.reduce((min, n) =>
          n.score < min.score ? n : min
        );
        if (score > lowest.score) {
          nodesRef.current = nodesRef.current.filter((n) => n.id !== lowest.id);
          linksRef.current = linksRef.current.filter(
            (l) => linkId(l.source) !== lowest.id && linkId(l.target) !== lowest.id
          );
        } else {
          moreCountRef.current++;
          return;
        }
      }

      nodesRef.current.push(newNode);
      // No source-to-stage link — sources float freely in space

      updateSimulation();
      renderElements();
      simulationRef.current?.alpha(0.3).restart();
    },
    [updateSimulation, renderElements]
  );

  const addConceptNodes = useCallback(
    (concepts: ConceptNodeData[], sourceLinks: GraphLink[]) => {
      // Assign z-depth and seed position near center
      const d = dimRef.current;
      for (const c of concepts) {
        (c as any)._z = Math.random() * 2 - 1;
        if (!c.x && !c.y) {
          c.x = d.width / 2 + (Math.random() - 0.5) * 200;
          c.y = d.height / 2 + (Math.random() - 0.5) * 200;
        }
      }
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
          n.type === "source" ? (n as SourceNodeData).contentCategory : undefined,
        score: n.type === "source" ? (n as SourceNodeData).score : undefined,
        state: n.type === "stage" ? (n as StageNodeData).state : undefined,
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
        _z: Math.random() * 2 - 1,
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
