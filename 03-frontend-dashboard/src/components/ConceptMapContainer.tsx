import { GitBranch } from "lucide-react";

const ConceptMapContainer = () => {
  return (
    <div className="glass min-h-[500px] flex flex-col items-center justify-center gap-4 p-8">
      <GitBranch className="h-12 w-12 text-muted-foreground/40" />
      <p className="text-muted-foreground text-sm">Concept map visualization will render here</p>
      <p className="text-muted-foreground/60 text-xs">Powered by react-d3-tree</p>
    </div>
  );
};

export default ConceptMapContainer;
