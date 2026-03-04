import { useState } from "react";
import { cn } from "@/lib/utils";

interface FlashCardProps {
  question: string;
  answer: string;
  index: number;
  total: number;
}

const FlashCard = ({ question, answer, index, total }: FlashCardProps) => {
  const [flipped, setFlipped] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <div
        onClick={() => setFlipped(!flipped)}
        className="relative w-full h-56 cursor-pointer"
        style={{ perspective: "1000px" }}
      >
        <div
          className={cn(
            "absolute inset-0 transition-transform duration-500 w-full h-full"
          )}
          style={{
            transformStyle: "preserve-3d",
            transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
          }}
        >
          {/* Front */}
          <div
            className="absolute inset-0 glass flex items-center justify-center p-6 text-center"
            style={{ backfaceVisibility: "hidden" }}
          >
            <p className="text-foreground font-medium leading-relaxed">{question}</p>
          </div>

          {/* Back */}
          <div
            className="absolute inset-0 glass flex items-center justify-center p-6 text-center bg-primary/5"
            style={{
              backfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
            }}
          >
            <p className="text-foreground text-sm leading-relaxed">{answer}</p>
          </div>
        </div>
      </div>
      <span className="text-xs text-muted-foreground text-center">
        Card {index + 1} of {total}
      </span>
    </div>
  );
};

export default FlashCard;
