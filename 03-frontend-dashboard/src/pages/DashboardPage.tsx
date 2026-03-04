import { useState, useEffect, useMemo, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import DashboardHeader from "@/components/DashboardHeader";
import TabNavigation, { type TabId } from "@/components/TabNavigation";
import SourceCard from "@/components/SourceCard";
import MarkdownViewer from "@/components/MarkdownViewer";
import ConceptMap from "@/components/ConceptMap";
import FlashCard from "@/components/FlashCard";
import type { PreparedRouterState } from "@/lib/prepareRouterState";
import type { Flashcard } from "@/types/research";
import { API_BASE_URL } from "@/config";

const DashboardPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const researchState = location.state as PreparedRouterState | null;
  const [activeTab, setActiveTab] = useState<TabId>("sources");

  useEffect(() => {
    if (!researchState || !researchState.sessionId) {
      navigate("/search", {
        state: { message: "Your previous research session has expired." },
      });
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

  if (!researchState) return null;

  return (
    <div className="min-h-screen flex flex-col">
      <DashboardHeader
        topic={researchState.topic}
        sourceCount={researchState.sources.length}
        onExport={handleExport}
        exportDisabled={!researchState.sessionId}
      />
      <TabNavigation active={activeTab} onChange={setActiveTab} />

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
                <MarkdownViewer content={researchState.artifacts.summary as string} />
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
            const rawFlashcards = researchState.artifacts?.flashcards;
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
        </div>
      </main>
    </div>
  );
};

export default DashboardPage;
