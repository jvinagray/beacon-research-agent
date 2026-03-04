import { useState } from "react";
import SearchInput from "@/components/SearchInput";
import DepthSelector, { type Depth } from "@/components/DepthSelector";
import ProgressFeed from "@/components/ProgressFeed";

const SearchPage = () => {
  const [query, setQuery] = useState("");
  const [depth, setDepth] = useState<Depth>("standard");

  const handleResearch = () => {
    if (!query.trim()) return;
    // Will be implemented later
    console.log("Research:", query, depth);
  };

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
        <SearchInput value={query} onChange={setQuery} onSubmit={handleResearch} />

        {/* Depth Selector */}
        <DepthSelector value={depth} onChange={setDepth} />

        {/* Research Button */}
        <button
          onClick={handleResearch}
          className="px-10 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-base
                     glow-primary hover:brightness-110 active:scale-[0.98] transition-all duration-200
                     disabled:opacity-40 disabled:pointer-events-none"
          disabled={!query.trim()}
        >
          Research
        </button>

        {/* Progress Feed */}
        <ProgressFeed />
      </div>
    </div>
  );
};

export default SearchPage;
