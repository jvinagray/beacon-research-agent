import { Download, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface DashboardHeaderProps {
  topic: string;
  sourceCount: number;
  onExport: () => void;
  exportDisabled: boolean;
}

const DashboardHeader = ({ topic, sourceCount, onExport, exportDisabled }: DashboardHeaderProps) => {
  const navigate = useNavigate();

  return (
    <header className="w-full flex items-center justify-between px-6 py-4 glass border-t-0 border-x-0 rounded-none">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate("/search")}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          title="Back to search"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-xl font-bold text-foreground tracking-tight">Beacon</h1>
        <span className="text-sm text-muted-foreground hidden sm:inline-block truncate max-w-[400px]" title={topic}>
          / {topic}
        </span>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm text-muted-foreground hidden sm:inline">
          {sourceCount} sources evaluated
        </span>
        <button
          onClick={() => navigate("/search")}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-glass-border text-sm text-foreground hover:bg-glass-highlight/30 transition-colors"
        >
          New Search
        </button>
        <button
          onClick={onExport}
          disabled={exportDisabled}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-glass-border text-sm text-foreground hover:bg-glass-highlight/30 transition-colors disabled:opacity-40 disabled:pointer-events-none"
        >
          <Download className="h-4 w-4" />
          Export
        </button>
      </div>
    </header>
  );
};

export default DashboardHeader;
