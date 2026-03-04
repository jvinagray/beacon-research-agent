import { useState, useEffect, useMemo, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import DashboardHeader from "@/components/DashboardHeader";
import TabNavigation, { type TabId } from "@/components/TabNavigation";
import SourceCard from "@/components/SourceCard";
import type { PreparedRouterState } from "@/lib/prepareRouterState";
import { API_BASE_URL } from "@/config";

const DashboardPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const researchState = location.state as PreparedRouterState | null;
  const [activeTab, setActiveTab] = useState<TabId>("sources");

  useEffect(() => {
    if (!researchState || !researchState.sessionId) {
      navigate("/search");
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
        {activeTab === "sources" && (
          <div className="space-y-4 animate-fade-in">
            {sortedSources.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No sources could be evaluated. Try a different topic.
              </p>
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
          <div className="animate-fade-in" data-testid="summary-placeholder">
            <p className="text-muted-foreground text-center py-8">Summary view coming soon...</p>
          </div>
        )}

        {activeTab === "concept-map" && (
          <div className="animate-fade-in" data-testid="concept-map-placeholder">
            <p className="text-muted-foreground text-center py-8">Concept map coming soon...</p>
          </div>
        )}

        {activeTab === "flashcards" && (
          <div className="animate-fade-in" data-testid="flashcards-placeholder">
            <p className="text-muted-foreground text-center py-8">Flashcards coming soon...</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default DashboardPage;
