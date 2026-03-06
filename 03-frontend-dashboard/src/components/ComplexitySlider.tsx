import { useState, useEffect } from 'react';
import { Slider } from '@/components/ui/slider';

const LEVEL_LABELS = ['ELI5', 'Simple', 'General', 'Technical', 'Expert'] as const;

interface ComplexitySliderProps {
  currentLevel: number;
  onLevelChange: (level: number) => void;
  isStreaming: boolean;
}

const ComplexitySlider = ({ currentLevel, onLevelChange, isStreaming }: ComplexitySliderProps) => {
  const [displayLevel, setDisplayLevel] = useState(currentLevel);

  // Sync display level when the external level changes (e.g. after rewrite completes)
  useEffect(() => {
    setDisplayLevel(currentLevel);
  }, [currentLevel]);

  return (
    <div className="mb-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">Complexity</span>
        {isStreaming && (
          <span className="text-xs text-primary animate-pulse">Rewriting...</span>
        )}
      </div>
      <Slider
        min={1}
        max={5}
        step={1}
        value={[displayLevel]}
        onValueChange={(value) => setDisplayLevel(value[0])}
        onValueCommit={(value) => onLevelChange(value[0])}
        disabled={isStreaming}
      />
      <div className="flex justify-between px-1">
        {LEVEL_LABELS.map((label, i) => (
          <span
            key={label}
            className={`text-xs ${
              i + 1 === displayLevel ? 'text-primary font-medium' : 'text-muted-foreground'
            }`}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
};

export default ComplexitySlider;
