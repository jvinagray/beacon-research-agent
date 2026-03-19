import { useEffect, useRef, useState, type RefObject } from "react";
import { Brain, Activity, Layers, Zap, FileText, MessageSquare, BarChart3 } from "lucide-react";
import { BrainGraph } from "./BrainGraph";
import type { ResearchState, EvaluatedSource } from "@/types/research";
import { CONTENT_CATEGORY_COLORS, mapContentType } from "@/lib/brain-graph-utils";
import type { ContentCategory } from "@/types/brain-graph";

export interface TraceEntry {
  id: number;
  timestamp: number;
  message: string;
  type: "info" | "search" | "evaluate" | "extract" | "synthesize" | "conflict" | "complete";
}

interface BrainDashboardProps {
  svgRef: RefObject<SVGSVGElement | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  state: ResearchState;
  query: string;
}

function classifyTrace(msg: string): TraceEntry["type"] {
  const lower = msg.toLowerCase();
  if (lower.includes("conflict") || lower.includes("disagree")) return "conflict";
  if (lower.includes("search") || lower.includes("query")) return "search";
  if (lower.includes("evaluat")) return "evaluate";
  if (lower.includes("extract")) return "extract";
  if (lower.includes("synthesiz") || lower.includes("generat")) return "synthesize";
  if (lower.includes("complete") || lower.includes("done")) return "complete";
  return "info";
}

const TRACE_COLORS: Record<TraceEntry["type"], string> = {
  info: "rgba(100, 200, 255, 0.8)",
  search: "rgba(100, 200, 255, 1)",
  evaluate: "rgba(255, 180, 80, 1)",
  extract: "rgba(80, 220, 150, 1)",
  synthesize: "rgba(180, 120, 255, 1)",
  conflict: "rgba(255, 100, 100, 1)",
  complete: "rgba(100, 255, 180, 1)",
};

const TRACE_DOTS: Record<TraceEntry["type"], string> = {
  info: "bg-cyan-400",
  search: "bg-cyan-400",
  evaluate: "bg-amber-400",
  extract: "bg-emerald-400",
  synthesize: "bg-purple-400",
  conflict: "bg-red-400",
  complete: "bg-green-400",
};

/** Content category labels for the legend */
const SOURCE_LEGEND: Array<{ category: ContentCategory; label: string }> = [
  { category: "academic", label: "Academic" },
  { category: "news", label: "News / Forum" },
  { category: "docs", label: "Docs / Tutorial" },
  { category: "media", label: "Media / Code" },
  { category: "other", label: "Other" },
];

function getCurrentStage(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes("synthesiz") || lower.includes("generat")) return "SYNTHESIZE";
  if (lower.includes("extract")) return "EXTRACT";
  if (lower.includes("evaluat")) return "EVALUATE";
  if (lower.includes("search") || lower.includes("query")) return "SEARCH";
  return "INITIALIZING";
}

function getSourceTypeCounts(sources: EvaluatedSource[]): Record<ContentCategory, number> {
  const counts: Record<ContentCategory, number> = {
    academic: 0, news: 0, docs: 0, media: 0, other: 0,
  };
  for (const s of sources) {
    const cat = mapContentType(s.signals.content_type);
    counts[cat]++;
  }
  return counts;
}

export function BrainDashboard({ svgRef, containerRef, state, query }: BrainDashboardProps) {
  const [traceLog, setTraceLog] = useState<TraceEntry[]>([]);
  const traceIdRef = useRef(0);
  const lastMsgRef = useRef("");
  const traceEndRef = useRef<HTMLDivElement>(null);

  // Accumulate trace entries from status messages
  useEffect(() => {
    if (state.statusMessage && state.statusMessage !== lastMsgRef.current) {
      lastMsgRef.current = state.statusMessage;
      const entry: TraceEntry = {
        id: traceIdRef.current++,
        timestamp: Date.now(),
        message: state.statusMessage,
        type: classifyTrace(state.statusMessage),
      };
      setTraceLog((prev) => [...prev.slice(-50), entry]); // keep last 50
    }
  }, [state.statusMessage]);

  // Reset trace on new research
  useEffect(() => {
    if (state.status === "loading") {
      setTraceLog([]);
      traceIdRef.current = 0;
      lastMsgRef.current = "";
    }
  }, [state.status]);

  // Auto-scroll trace log
  useEffect(() => {
    traceEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [traceLog]);

  const currentStage = getCurrentStage(state.statusMessage);
  const sourceTypeCounts = getSourceTypeCounts(state.sources);
  const artifactCount = Object.keys(state.artifacts).length;
  const avgScore = state.sources.length > 0
    ? (state.sources.reduce((sum, s) => sum + s.signals.learning_efficiency_score, 0) / state.sources.length).toFixed(1)
    : "—";

  return (
    <div className="brain-dashboard">
      {/* ═══ HEADER BAR ═══ */}
      <header className="brain-dashboard-header">
        <div className="flex items-center gap-3">
          <Brain className="h-6 w-6 text-cyan-400" />
          <h1 className="text-lg font-bold tracking-widest uppercase">
            <span className="text-cyan-400">Beacon</span>{" "}
            <span className="text-slate-300">Research Brain</span>
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="brain-stage-indicator">
            <Zap className="h-3.5 w-3.5 text-cyan-400 animate-pulse" />
            <span className="text-xs font-mono text-cyan-300">{currentStage}</span>
          </div>
        </div>
      </header>

      {/* ═══ MAIN GRID ═══ */}
      <div className="brain-dashboard-grid">

        {/* ─── LEFT COLUMN ─── */}
        <div className="brain-left-col">
          {/* Live Trace Panel */}
          <div className="brain-panel brain-trace-panel">
            <div className="brain-panel-header">
              <Activity className="h-4 w-4 text-cyan-400" />
              <span className="brain-panel-title">LIVE TRACE</span>
              <span className="brain-live-badge">LIVE</span>
            </div>
            <div className="brain-trace-log">
              {traceLog.length === 0 && (
                <p className="text-xs text-slate-500 italic">Waiting for agent...</p>
              )}
              {traceLog.map((entry) => (
                <div key={entry.id} className="brain-trace-entry animate-trace-in">
                  <span className={`brain-trace-dot ${TRACE_DOTS[entry.type]}`} />
                  <span
                    className="brain-trace-msg"
                    style={{ color: TRACE_COLORS[entry.type] }}
                  >
                    {entry.message}
                  </span>
                </div>
              ))}
              <div ref={traceEndRef} />
            </div>
          </div>

          {/* Source Legend */}
          <div className="brain-panel brain-legend-panel">
            <div className="brain-panel-header">
              <Layers className="h-4 w-4 text-cyan-400" />
              <span className="brain-panel-title">SOURCE TYPES</span>
            </div>
            <div className="brain-legend-list">
              {SOURCE_LEGEND.map(({ category, label }) => (
                <div key={category} className="brain-legend-item">
                  <span
                    className="brain-legend-dot"
                    style={{ background: CONTENT_CATEGORY_COLORS[category] }}
                  />
                  <span className="brain-legend-label">{label}</span>
                  <span className="brain-legend-count">
                    {sourceTypeCounts[category] || 0}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ─── CENTER: NEURAL MAP ─── */}
        <div className="brain-center" ref={containerRef}>
          {/* Core Topic Label */}
          <div className="brain-topic-label">
            <span className="text-[10px] uppercase tracking-[3px] text-slate-500">Core Topic</span>
            <span className="text-sm font-bold text-cyan-300 tracking-wide">
              [{query.toUpperCase()}]
            </span>
          </div>

          {/* The D3 Graph */}
          <BrainGraph
            svgRef={svgRef}
            minimized={false}
            onMinimize={() => {}}
            onRestore={() => {}}
          />

          {/* Stats Bar */}
          <div className="brain-stats-bar">
            <div className="brain-stat">
              <span className="brain-stat-value">{state.sources.length}</span>
              <span className="brain-stat-label">SOURCES EVALUATED</span>
            </div>
            <div className="brain-stat-divider" />
            <div className="brain-stat">
              <span className="brain-stat-value">{state.sourceTotal}</span>
              <span className="brain-stat-label">TOTAL FOUND</span>
            </div>
            <div className="brain-stat-divider" />
            <div className="brain-stat">
              <span className="brain-stat-value">{avgScore}</span>
              <span className="brain-stat-label">AVG QUALITY</span>
            </div>
            <div className="brain-stat-divider" />
            <div className="brain-stat">
              <span className="brain-stat-value">{artifactCount}</span>
              <span className="brain-stat-label">ARTIFACTS</span>
            </div>
          </div>
        </div>

        {/* ─── RIGHT COLUMN ─── */}
        <div className="brain-right-col">
          {/* Context Cluster */}
          <div className="brain-panel brain-context-panel">
            <div className="brain-panel-header">
              <MessageSquare className="h-4 w-4 text-cyan-400" />
              <span className="brain-panel-title">CONTEXT CLUSTER</span>
              <span className="brain-live-badge">LIVE</span>
            </div>
            <div className="brain-context-list">
              {state.sources.length === 0 && (
                <p className="text-xs text-slate-500 italic">Discovering sources...</p>
              )}
              {state.sources.slice(-8).map((source) => {
                const cat = mapContentType(source.signals.content_type);
                const score = source.signals.learning_efficiency_score;
                return (
                  <div key={source.url} className="brain-context-item animate-trace-in">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="brain-context-dot"
                        style={{ background: CONTENT_CATEGORY_COLORS[cat] }}
                      />
                      <span className="brain-context-title" title={source.title}>
                        {source.title}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="brain-context-score" data-quality={score >= 7 ? "high" : score >= 4 ? "mid" : "low"}>
                        {score.toFixed(0)}
                      </span>
                      <span className="brain-context-match">
                        {Math.round(score * 10)}% MATCH
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Artifacts Explorer */}
          <div className="brain-panel brain-artifacts-panel">
            <div className="brain-panel-header">
              <BarChart3 className="h-4 w-4 text-cyan-400" />
              <span className="brain-panel-title">ARTIFACTS</span>
            </div>
            <div className="brain-artifacts-grid">
              {[
                { key: "summary", icon: FileText, label: "Summary" },
                { key: "concept_map", icon: Brain, label: "Concepts" },
                { key: "flashcards", icon: Layers, label: "Flashcards" },
                { key: "timeline", icon: Activity, label: "Timeline" },
                { key: "conflicts", icon: Zap, label: "Conflicts" },
                { key: "assumptions", icon: MessageSquare, label: "Assumptions" },
              ].map(({ key, icon: Icon, label }) => {
                const ready = key in state.artifacts;
                return (
                  <div
                    key={key}
                    className={`brain-artifact-tile ${ready ? "ready" : ""}`}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="text-[9px] uppercase tracking-wider">{label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
