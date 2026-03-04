import { Download } from "lucide-react";

interface DashboardHeaderProps {
  topic: string;
  sourceCount: number;
  onExport: () => void;
  exportDisabled: boolean;
}

const DashboardHeader = ({ topic, sourceCount, onExport, exportDisabled }: DashboardHeaderProps) => {
  return (
    <header className="w-full flex items-center justify-between px-6 py-4 glass border-t-0 border-x-0 rounded-none">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold text-foreground tracking-tight">Beacon</h1>
        <span className="text-sm text-muted-foreground hidden sm:inline truncate max-w-xs" title={topic}>
          / {topic}
        </span>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm text-muted-foreground hidden sm:inline">
          {sourceCount} sources evaluated
        </span>
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
