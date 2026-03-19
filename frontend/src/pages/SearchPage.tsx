import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { X, Clock, Trash2 } from "lucide-react";
import SearchInput from "@/components/SearchInput";
import DepthSelector, { type Depth } from "@/components/DepthSelector";
import ProgressFeed from "@/components/ProgressFeed";
import { useResearch } from "@/hooks/useResearch";
import { prepareRouterState } from "@/lib/prepareRouterState";
import { saveSearch, loadHistory, removeEntry, clearHistory, type SearchHistoryEntry } from "@/lib/searchHistory";

const SearchPage = () => {
  const [query, setQuery] = useState("");
  const [depth, setDepth] = useState<Depth>("standard");
  const { state, startResearch, reset } = useResearch();
  const navigate = useNavigate();
  const location = useLocation();
  const [infoBanner, setInfoBanner] = useState<string | null>(null);
  const navigatedRef = useRef(false);

  const isActive = state.status === "loading" || state.status === "streaming";

  useEffect(() => {
    const msg = (location.state as { message?: string } | null)?.message;
    if (msg) {
      setInfoBanner(msg);
      window.history.replaceState({}, "");
      const timer = setTimeout(() => setInfoBanner(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [location.state]);

  const [history, setHistory] = useState<SearchHistoryEntry[]>(() => loadHistory());

  const handleResearch = () => {
    if (!query.trim()) return;
    startResearch(query, depth);
  };

  const handleRetry = () => {
    reset();
    if (query.trim()) {
      startResearch(query, depth);
    }
  };

  useEffect(() => {
    if (state.status === "loading") {
      navigatedRef.current = false;
    }
  }, [state.status]);

  useEffect(() => {
    if (state.status !== "complete" || navigatedRef.current) return;
    navigatedRef.current = true;
    const prepared = prepareRouterState(state);
    saveSearch(prepared);
    setHistory(loadHistory());
    navigate("/dashboard", { state: prepared });
  }, [state.status, state, navigate]);

  const handleHistoryClick = (entry: SearchHistoryEntry) => {
    navigate("/dashboard", { state: entry.state });
  };

  const handleRemoveEntry = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    removeEntry(id);
    setHistory(loadHistory());
  };

  const handleClearHistory = () => {
    clearHistory();
    setHistory([]);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 gap-8">
      {/* Background gradient orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-primary/3 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-8 w-full">
        {/* Info Banner */}
        {infoBanner && (
          <div className="w-full max-w-2xl glass rounded-xl p-4 border-l-4 border-slate-400 flex items-center justify-between animate-fade-in">
            <p className="text-slate-300 text-sm">{infoBanner}</p>
            <button
              onClick={() => setInfoBanner(null)}
              className="text-slate-400 hover:text-foreground transition-colors ml-3 shrink-0"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Logo */}
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">Beacon</h1>
          <p className="text-muted-foreground text-sm">Deep research, fast answers</p>
        </div>

        <SearchInput
          value={query}
          onChange={setQuery}
          onSubmit={handleResearch}
          disabled={isActive}
        />
        <DepthSelector value={depth} onChange={setDepth} disabled={isActive} />

        <button
          onClick={handleResearch}
          className="px-10 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-base
                     glow-primary hover:brightness-110 active:scale-[0.98] transition-all duration-200
                     disabled:opacity-40 disabled:pointer-events-none"
          disabled={!query.trim() || isActive}
        >
          Research
        </button>

        {/* Error Banner */}
        {state.status === "error" && state.error && (
          <div className="w-full max-w-2xl glass rounded-xl p-4 border-l-4 border-destructive">
            <p className="text-destructive text-sm font-medium">{state.error.message}</p>
            <button
              onClick={handleRetry}
              className="mt-2 px-4 py-1.5 rounded-lg bg-destructive/10 text-destructive text-sm font-medium
                         hover:bg-destructive/20 transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Progress Feed */}
        <ProgressFeed
          status={state.status}
          statusMessage={state.statusMessage}
          sources={state.sources}
          sourceTotal={state.sourceTotal}
          artifacts={state.artifacts}
        />

        {/* Search History */}
        {!isActive && history.length > 0 && (
          <div className="w-full max-w-2xl glass rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-medium text-foreground">Recent Searches</h2>
              </div>
              <button
                onClick={handleClearHistory}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear all
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {history.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => handleHistoryClick(entry)}
                  className="group flex items-center justify-between px-4 py-3 rounded-lg bg-glass-highlight/10 hover:bg-glass-highlight/25 transition-colors text-left"
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-sm text-foreground truncate">{entry.topic}</span>
                    <span className="text-xs text-muted-foreground">
                      {entry.depth} &middot; {entry.sourceCount} sources &middot;{" "}
                      {formatRelativeTime(entry.timestamp)}
                    </span>
                  </div>
                  <span
                    role="button"
                    onClick={(e) => handleRemoveEntry(e, entry.id)}
                    className="ml-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground transition-all"
                    title="Remove"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

function formatRelativeTime(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default SearchPage;
