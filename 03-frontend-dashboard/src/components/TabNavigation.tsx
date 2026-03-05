import { cn } from "@/lib/utils";

export type TabId = "sources" | "summary" | "concept-map" | "flashcards" | "chat";

const tabs: { id: TabId; label: string }[] = [
  { id: "sources", label: "Sources" },
  { id: "summary", label: "Summary" },
  { id: "concept-map", label: "Concept Map" },
  { id: "flashcards", label: "Flashcards" },
  { id: "chat", label: "Chat" },
];

interface TabNavigationProps {
  active: TabId;
  onChange: (tab: TabId) => void;
}

const TabNavigation = ({ active, onChange }: TabNavigationProps) => {
  return (
    <nav className="flex gap-1 px-6 py-2 border-b border-glass-border overflow-x-auto">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap",
            active === tab.id
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:text-foreground hover:bg-glass-highlight/20"
          )}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
};

export default TabNavigation;
