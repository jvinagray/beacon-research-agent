import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import SearchInput from "@/components/SearchInput";
import DepthSelector, { type Depth } from "@/components/DepthSelector";
import ProgressFeed from "@/components/ProgressFeed";
import { useResearch } from "@/hooks/useResearch";
import { prepareRouterState } from "@/lib/prepareRouterState";

const SearchPage = () => {
  const [query, setQuery] = useState("");
  const [depth, setDepth] = useState<Depth>("standard");
  const { state, startResearch, reset } = useResearch();
  const navigate = useNavigate();

  const isActive = state.status === "loading" || state.status === "streaming";

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
    if (state.status === "complete") {
      navigate("/dashboard", { state: prepareRouterState(state) });
    }
  }, [state.status, state, navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 gap-8">
      {/* Background gradient orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-primary/3 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-8 w-full">
        {/* Logo */}
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            Beacon
          </h1>
          <p className="text-muted-foreground text-sm">Deep research, fast answers</p>
        </div>

        {/* Search Input */}
        <SearchInput
          value={query}
          onChange={setQuery}
          onSubmit={handleResearch}
          disabled={isActive}
        />

        {/* Depth Selector */}
        <DepthSelector value={depth} onChange={setDepth} disabled={isActive} />

        {/* Research Button */}
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
        />
      </div>
    </div>
  );
};

export default SearchPage;
