import { Download } from "lucide-react";

interface DashboardHeaderProps {
  topic?: string;
}

const DashboardHeader = ({ topic }: DashboardHeaderProps) => {
  return (
    <header className="w-full flex items-center justify-between px-6 py-4 glass border-t-0 border-x-0 rounded-none">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold text-foreground tracking-tight">Beacon</h1>
        {topic && (
          <span className="text-sm text-muted-foreground hidden sm:inline">/ {topic}</span>
        )}
      </div>
      <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-glass-border text-sm text-foreground hover:bg-glass-highlight/30 transition-colors">
        <Download className="h-4 w-4" />
        Export
      </button>
    </header>
  );
};

export default DashboardHeader;
