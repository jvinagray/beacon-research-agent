import { useState } from "react";
import type { Flashcard } from "@/types/research";

interface FlashCardProps {
  card: Flashcard;
  index: number;
  total: number;
}

const FlashCard = ({ card, index, total }: FlashCardProps) => {
  const [flipped, setFlipped] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <div
        data-testid="flashcard"
        onClick={() => setFlipped(!flipped)}
        className="relative w-full h-56 cursor-pointer"
        style={{ perspective: "1000px" }}
      >
        <div
          data-testid="flashcard-inner"
          className="absolute inset-0 transition-transform duration-500 w-full h-full"
          style={{
            transformStyle: "preserve-3d",
            transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
          }}
        >
          {/* Front - Question */}
          <div
            className="absolute inset-0 glass flex flex-col items-center justify-center p-6 text-center"
            style={{ backfaceVisibility: "hidden" }}
          >
            <p className="text-sm text-muted-foreground mb-2">Question</p>
            <p className="text-foreground font-medium leading-relaxed">
              {card.question}
            </p>
            <p className="text-xs text-muted-foreground/60 mt-4">
              Click to reveal answer
            </p>
          </div>

          {/* Back - Answer */}
          <div
            className="absolute inset-0 glass flex flex-col items-center justify-center p-6 text-center bg-primary/5"
            style={{
              backfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
            }}
          >
            <p className="text-sm text-emerald-400 mb-2">Answer</p>
            <p className="text-foreground text-sm leading-relaxed">
              {card.answer}
            </p>
            <p className="text-xs text-muted-foreground/60 mt-4">
              Click to flip back
            </p>
          </div>
        </div>
      </div>
      <span className="text-xs text-muted-foreground text-center">
        Card {index} of {total}
      </span>
    </div>
  );
};

export default FlashCard;
