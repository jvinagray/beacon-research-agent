import { useEffect, useRef } from "react";
import type { ResearchState } from "@/types/research";
import type { SerializedGraphSnapshot } from "@/types/brain-graph";
import type { useBrainSimulation } from "./useBrainSimulation";
import {
  extractConcepts,
  buildConceptSourceEdges,
} from "@/lib/brain-graph-concepts";

type BrainSimulationMethods = ReturnType<typeof useBrainSimulation>;

export function useBrainEventBridge(
  researchState: ResearchState,
  simulation: BrainSimulationMethods | null,
  onSnapshot?: (snapshot: SerializedGraphSnapshot) => void
): void {
  const processedSourceUrls = useRef<Set<string>>(new Set());
  const conceptsAdded = useRef(false);
  const stagesActivated = useRef<Set<string>>(new Set());
  const stagesCompleted = useRef<Set<string>>(new Set());
  const settleTimeoutId = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapshotTaken = useRef(false);
  const onSnapshotRef = useRef(onSnapshot);
  onSnapshotRef.current = onSnapshot;
  const stagesInitialized = useRef(false);

  // Reset refs when a new research run starts, and create stage nodes
  useEffect(() => {
    if (researchState.status === "loading") {
      processedSourceUrls.current.clear();
      conceptsAdded.current = false;
      stagesActivated.current.clear();
      stagesCompleted.current.clear();
      snapshotTaken.current = false;
      stagesInitialized.current = false;
      if (settleTimeoutId.current !== null) {
        clearTimeout(settleTimeoutId.current);
        settleTimeoutId.current = null;
      }
    }

    // Initialize stage nodes when research starts
    if (
      (researchState.status === "loading" || researchState.status === "streaming") &&
      simulation &&
      !stagesInitialized.current
    ) {
      stagesInitialized.current = true;
      simulation.addStageNodes();
    }
  }, [researchState.status, simulation]);

  // Stage detection effect
  useEffect(() => {
    if (!simulation) return;

    const msg = researchState.statusMessage.toLowerCase();

    if (msg.includes("search") && !stagesActivated.current.has("search")) {
      stagesActivated.current.add("search");
      simulation.activateStage("search");
    }

    if (
      researchState.sourceTotal > 0 &&
      !stagesActivated.current.has("evaluate")
    ) {
      stagesActivated.current.add("evaluate");
      simulation.activateStage("evaluate");
    }

    if (msg.includes("extract") && !stagesActivated.current.has("extract")) {
      stagesActivated.current.add("extract");
      simulation.activateStage("extract");
      if (!stagesCompleted.current.has("evaluate")) {
        stagesCompleted.current.add("evaluate");
        simulation.completeStage("evaluate");
      }
    }

    if (
      msg.includes("synthesiz") &&
      !stagesActivated.current.has("synthesize")
    ) {
      stagesActivated.current.add("synthesize");
      simulation.activateStage("synthesize");
      if (!stagesCompleted.current.has("extract")) {
        stagesCompleted.current.add("extract");
        simulation.completeStage("extract");
      }
    }
  }, [researchState.statusMessage, researchState.sourceTotal, simulation]);

  // Source node effect
  useEffect(() => {
    if (!simulation) return;

    for (const source of researchState.sources) {
      if (!processedSourceUrls.current.has(source.url)) {
        processedSourceUrls.current.add(source.url);
        simulation.addSourceNode(source);
      }
    }
  }, [researchState.sources, simulation]);

  // Concept node effect
  useEffect(() => {
    if (!simulation) return;
    if (conceptsAdded.current) return;

    const conceptMap = researchState.artifacts.concept_map;
    if (!conceptMap || typeof conceptMap !== "string") return;

    const conceptNames = extractConcepts(conceptMap);
    if (conceptNames.length === 0) return;

    const { concepts, edges } = buildConceptSourceEdges(conceptNames, researchState.sources);
    simulation.addConceptNodes(concepts, edges);
    conceptsAdded.current = true;
  }, [researchState.artifacts, researchState.sources, simulation]);

  // Completion/error effect
  useEffect(() => {
    if (!simulation) return;

    if (researchState.status === "complete" && !snapshotTaken.current) {
      simulation.settle();
      if (!stagesCompleted.current.has("synthesize")) {
        stagesCompleted.current.add("synthesize");
        simulation.completeStage("synthesize");
      }

      settleTimeoutId.current = setTimeout(() => {
        if (!snapshotTaken.current) {
          snapshotTaken.current = true;
          const snapshot = simulation.getSnapshot();
          onSnapshotRef.current?.(snapshot);
        }
      }, 2000);
    }

    if (researchState.status === "error" && !snapshotTaken.current) {
      snapshotTaken.current = true;
      const snapshot = simulation.getSnapshot();
      onSnapshotRef.current?.(snapshot);
    }
  }, [researchState.status, simulation]);

  // Cleanup effect
  useEffect(() => {
    return () => {
      if (settleTimeoutId.current !== null) {
        clearTimeout(settleTimeoutId.current);
      }
    };
  }, []);
}
