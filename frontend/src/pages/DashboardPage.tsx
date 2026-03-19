import { useState, useEffect, useMemo, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import DashboardHeader from "@/components/DashboardHeader";
import TabNavigation, { type TabId } from "@/components/TabNavigation";
import SourceCard from "@/components/SourceCard";
import MarkdownViewer from "@/components/MarkdownViewer";
import ConceptMap from "@/components/ConceptMap";
import FlashCard from "@/components/FlashCard";
import ChatPanel from "@/components/ChatPanel";
import ComplexitySlider from "@/components/ComplexitySlider";
import DrillDownPanel from "@/components/DrillDownPanel";
import Timeline from "@/components/Timeline";
import ConflictCard from "@/components/ConflictCard";
import AssumptionCard from "@/components/AssumptionCard";
import { BrainBadge } from "@/components/BrainBadge";
import { BrainGraphModal } from "@/components/BrainGraphModal";
import { useChat } from "@/hooks/useChat";
import { useRewrite } from "@/hooks/useRewrite";
import { useDrillDown } from "@/hooks/useDrillDown";
import { normalizeArtifact } from "@/lib/artifacts";
import type { PreparedRouterState } from "@/lib/prepareRouterState";
import type { Conflict, Assumption, Flashcard, TimelineEvent } from "@/types/research";
import { API_BASE_URL } from "@/config";

const DashboardPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const researchState = location.state as PreparedRouterState | null;
  const [activeTab, setActiveTab] = useState<TabId>("sources");
  const brainGraphSnapshot = researchState?.brainGraphSnapshot ?? null;
  const [brainModalOpen, setBrainModalOpen] = useState(false);

  useEffect(() => {
    if (!researchState || !researchState.sessionId) {
      navigate("/search", {
        state: { message: "Your previous research session has expired." },
      });
    } else {
      const artKeys = Object.keys(researchState.artifacts);
      const artSummary = artKeys.map(k => {
        const v = researchState.artifacts[k];
        const info = Array.isArray(v) ? `[${v.length} items]` : typeof v === 'string' ? `string(${v.length})` : typeof v;
        return `${k}: ${info}`;
      });
      console.log(`[Beacon Dashboard] artifacts loaded:`, artSummary);
    }
  }, [researchState, navigate]);

  const sortedSources = useMemo(() => {
    if (!researchState) return [];
    const sources = researchState.sources;
    const successful = sources.filter(s => !s.signals.evaluation_failed);
    const failed = sources.filter(s => s.signals.evaluation_failed);
    const sorted = [...successful].sort((a, b) =>
      b.signals.learning_efficiency_score - a.signals.learning_efficiency_score
    );
    return [...sorted, ...failed];
  }, [researchState]);

  const timelineEvents = useMemo(() => {
    const raw = researchState?.artifacts?.timeline;
    if (!raw) return [];
    const parsed = normalizeArtifact("timeline", raw as string);
    return Array.isArray(parsed) ? (parsed as TimelineEvent[]) : [];
  }, [researchState?.artifacts?.timeline]);

  const conflicts = useMemo(() => {
    const raw = researchState?.artifacts?.conflicts;
    if (!raw) return [];
    return normalizeArtifact('conflicts', raw as string) as Conflict[];
  }, [researchState?.artifacts?.conflicts]);

  const assumptions = useMemo(() => {
    const raw = researchState?.artifacts?.assumptions;
    if (!raw) return [];
    return normalizeArtifact('assumptions', raw as string) as Assumption[];
  }, [researchState?.artifacts?.assumptions]);

  const visibleTabs = useMemo((): TabId[] => {
    const base: TabId[] = ["sources", "summary", "concept-map", "flashcards"];
    if (timelineEvents.length > 0) base.push("timeline");
    base.push("analysis");
    base.push("chat");
    return base;
  }, [timelineEvents]);

  useEffect(() => {
    if (!visibleTabs.includes(activeTab)) {
      setActiveTab("sources");
    }
  }, [visibleTabs, activeTab]);

  const handleExport = useCallback(async () => {
    if (!researchState?.sessionId) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/export/${researchState.sessionId}`);

      if (response.status === 404) {
        toast.error("Research session has expired. Please run a new search.");
        return;
      }

      if (!response.ok) {
        toast.error("Export failed. Check your connection and try again.");
        return;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `beacon-research-${researchState.topic.replace(/\s+/g, "-")}.md`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error("Export failed. Check your connection and try again.");
    }
  }, [researchState]);

  const originalSummary = (researchState?.artifacts?.summary as string) || "";
  const rewriteState = useRewrite(researchState?.sessionId ?? null, originalSummary);

  const chatState = useChat(researchState?.sessionId ?? null);

  const drillDown = useDrillDown(researchState?.sessionId ?? null);

  const handleBrainNodeClick = useCallback(
    (nodeType: "stage" | "source" | "concept", nodeId: string) => {
      switch (nodeType) {
        case "stage":
          if (nodeId === "stage-search" || nodeId === "stage-evaluate") {
            setActiveTab("sources");
          } else if (nodeId === "stage-synthesize") {
            setActiveTab("summary");
          }
          // stage-extract: no tab change
          break;
        case "concept":
          setActiveTab("concept-map");
          break;
        case "source":
          // source clicks open URL directly in BrainGraph, no tab change needed
          break;
      }
    },
    [],
  );

  const handleDrillDown = useCallback((concept: string, parentId?: string) => {
    const status = drillDown.startDrillDown(concept, parentId);
    if (status === "max-depth") {
      toast.info("Maximum depth reached. Use the chat to explore further.");
    } else if (status === "max-sessions") {
      toast.info("Too many drill-downs. Use the chat to explore further.");
    }
  }, [drillDown.startDrillDown]);

  if (!researchState) return null;

  return (
    <div className="min-h-screen flex flex-col">
      <DashboardHeader
        topic={researchState.topic}
        sourceCount={researchState.sources.length}
        onExport={handleExport}
        exportDisabled={!researchState.sessionId}
      />
      <TabNavigation active={activeTab} onChange={setActiveTab} visibleTabs={visibleTabs} />

      {brainGraphSnapshot && (
        <div className="max-w-5xl mx-auto w-full px-6 pt-4">
          <BrainBadge
            snapshot={brainGraphSnapshot}
            onExpand={() => setBrainModalOpen(true)}
          />
        </div>
      )}
      {brainGraphSnapshot && (
        <BrainGraphModal
          isOpen={brainModalOpen}
          onClose={() => setBrainModalOpen(false)}
          snapshot={brainGraphSnapshot}
          onNodeClick={(nodeType, nodeId) => {
            handleBrainNodeClick(nodeType, nodeId);
            setBrainModalOpen(false);
          }}
        />
      )}

      <main className="flex-1 p-6 max-w-5xl mx-auto w-full">
        <div key={activeTab} className="animate-fade-in">
          {activeTab === "sources" && (
            <div className="space-y-4">
              {sortedSources.length === 0 ? (
                <div className="glass rounded-xl p-8 text-center">
                  <p className="text-slate-400 text-lg">
                    No sources could be evaluated. Try a different topic.
                  </p>
                  <button
                    onClick={() => navigate("/search")}
                    className="mt-4 px-6 py-2 rounded-lg bg-primary/15 text-primary text-sm font-medium hover:bg-primary/25 transition-colors"
                  >
                    New Search
                  </button>
                </div>
              ) : (
                <div className="grid gap-3">
                  {sortedSources.map((source) => (
                    <SourceCard key={source.url} source={source} />
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "summary" && (
            <div data-testid="summary-placeholder">
              {researchState.artifacts.summary ? (
                <>
                  <ComplexitySlider
                    currentLevel={rewriteState.currentLevel}
                    onLevelChange={rewriteState.requestRewrite}
                    isStreaming={rewriteState.isStreaming}
                  />
                  <div className={rewriteState.isStreaming ? "opacity-50 transition-opacity" : ""}>
                    <MarkdownViewer
                      content={rewriteState.content || originalSummary}
                      sources={researchState.sources}
                      onDrillDown={handleDrillDown}
                    />
                    {rewriteState.isStreaming && (
                      <span className="inline-block w-0.5 h-5 bg-primary animate-pulse ml-0.5" />
                    )}
                  </div>
                  {drillDown.sessions.length > 0 && (
                    <div className="mt-6">
                      <DrillDownPanel
                        sessions={drillDown.sessions}
                        sources={researchState.sources}
                        onDrillDown={handleDrillDown}
                      />
                    </div>
                  )}
                </>
              ) : (
                <p className="text-slate-400 text-center py-8">
                  No summary was generated for this research.
                </p>
              )}
            </div>
          )}

          {activeTab === "concept-map" && (
            <div>
              {researchState.artifacts.concept_map ? (
                <ConceptMap data={researchState.artifacts.concept_map as string} />
              ) : (
                <p className="text-slate-400 text-center py-8">
                  No concept map was generated for this research.
                </p>
              )}
            </div>
          )}

          {activeTab === "flashcards" && (() => {
            let rawFlashcards = researchState.artifacts?.flashcards;
            // Defensive: if stored as a JSON string, try parsing it
            if (typeof rawFlashcards === 'string') {
              try { rawFlashcards = JSON.parse(rawFlashcards); } catch { /* keep as-is */ }
            }
            const flashcards: Flashcard[] = Array.isArray(rawFlashcards) ? rawFlashcards : [];
            return (
              <div>
                {flashcards.length > 0 ? (
                  <div>
                    <p className="text-muted-foreground mb-4">
                      {flashcards.length} flashcard{flashcards.length !== 1 ? "s" : ""}
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {flashcards.map((card, idx) => (
                        <FlashCard
                          key={idx}
                          card={card}
                          index={idx + 1}
                          total={flashcards.length}
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-400 text-center py-8">
                    No flashcards were generated for this research.
                  </p>
                )}
              </div>
            );
          })()}

          {activeTab === "timeline" && <Timeline events={timelineEvents} />}

          {activeTab === "analysis" && (
            <div className="space-y-8">
              <section>
                <h2 className="text-xl font-semibold mb-4">Source Disagreements</h2>
                {conflicts.length > 0 ? (
                  <div className="space-y-4">
                    {conflicts.map((c, i) => <ConflictCard key={i} conflict={c} />)}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-6 glass rounded-xl">
                    No disagreements detected between sources.
                  </p>
                )}
              </section>
              <section>
                <h2 className="text-xl font-semibold mb-4">Hidden Assumptions</h2>
                {assumptions.length > 0 ? (
                  <div className="space-y-4">
                    {assumptions.map((a, i) => <AssumptionCard key={i} assumption={a} />)}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-6 glass rounded-xl">
                    No notable assumptions identified.
                  </p>
                )}
              </section>
            </div>
          )}
        </div>

        {/* Chat outside the keyed div — state persists across tab switches */}
        {activeTab === "chat" && (
          <ChatPanel
            sessionId={researchState.sessionId}
            topic={researchState.topic}
            messages={chatState.messages}
            isStreaming={chatState.isStreaming}
            error={chatState.error}
            sendMessage={chatState.sendMessage}
          />
        )}
      </main>
    </div>
  );
};

export default DashboardPage;
