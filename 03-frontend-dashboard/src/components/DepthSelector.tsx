import { cn } from "@/lib/utils";

export type Depth = "quick" | "standard" | "deep";

const depths: { value: Depth; label: string; time: string }[] = [
  { value: "quick", label: "Quick", time: "~2 min" },
  { value: "standard", label: "Standard", time: "~5 min" },
  { value: "deep", label: "Deep", time: "~8 min" },
];

interface DepthSelectorProps {
  value: Depth;
  onChange: (value: Depth) => void;
  disabled?: boolean;
}

const DepthSelector = ({ value, onChange, disabled }: DepthSelectorProps) => {
  return (
    <div className="glass inline-flex p-1 gap-1">
      {depths.map((depth) => (
        <button
          key={depth.value}
          onClick={() => !disabled && onChange(depth.value)}
          disabled={disabled}
          className={cn(
            "flex flex-col items-center px-6 py-2.5 rounded-lg transition-all duration-300 min-w-[100px] disabled:opacity-50 disabled:pointer-events-none",
            value === depth.value
              ? "bg-primary/15 text-primary border border-primary/30 shadow-[0_0_12px_hsl(var(--primary)/0.15)]"
              : "text-muted-foreground hover:text-foreground hover:bg-glass-highlight/30"
          )}
        >
          <span className="text-sm font-medium">{depth.label}</span>
          <span className="text-xs opacity-70">{depth.time}</span>
        </button>
      ))}
    </div>
  );
};

export default DepthSelector;
