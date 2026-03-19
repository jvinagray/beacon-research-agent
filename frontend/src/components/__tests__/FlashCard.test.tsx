import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import FlashCard from "../FlashCard";
import type { Flashcard } from "@/types/research";

const sampleCard: Flashcard = {
  question: "What is React?",
  answer: "A JavaScript library for building user interfaces.",
};

describe("FlashCard", () => {
  it("renders question text on front face", () => {
    render(<FlashCard card={sampleCard} index={1} total={5} />);
    expect(screen.getByText("What is React?")).toBeInTheDocument();
  });

  it("renders answer text on back face", () => {
    render(<FlashCard card={sampleCard} index={1} total={5} />);
    expect(
      screen.getByText(
        "A JavaScript library for building user interfaces.",
      ),
    ).toBeInTheDocument();
  });

  it("clicking card toggles flipped state", () => {
    const { container } = render(
      <FlashCard card={sampleCard} index={1} total={5} />,
    );
    const clickTarget = container.querySelector("[data-testid='flashcard']")!;
    const inner = container.querySelector(
      "[data-testid='flashcard-inner']",
    ) as HTMLElement;

    // Initially not flipped
    expect(inner.style.transform).toBe("rotateY(0deg)");

    // Click to flip
    fireEvent.click(clickTarget);
    expect(inner.style.transform).toBe("rotateY(180deg)");

    // Click again to unflip
    fireEvent.click(clickTarget);
    expect(inner.style.transform).toBe("rotateY(0deg)");
  });

  it("flipped card shows answer (backface-visibility logic)", () => {
    const { container } = render(
      <FlashCard card={sampleCard} index={1} total={5} />,
    );
    const clickTarget = container.querySelector("[data-testid='flashcard']")!;
    fireEvent.click(clickTarget);

    const inner = container.querySelector(
      "[data-testid='flashcard-inner']",
    ) as HTMLElement;
    expect(inner.style.transform).toBe("rotateY(180deg)");

    // Both faces should have backface-visibility hidden
    const faces = container.querySelectorAll("[data-testid='flashcard-inner'] > div");
    faces.forEach((face) => {
      expect((face as HTMLElement).style.backfaceVisibility).toBe("hidden");
    });
  });

  it("applies glassmorphism styling", () => {
    const { container } = render(
      <FlashCard card={sampleCard} index={1} total={5} />,
    );
    // Both faces should have the glass class
    const faces = container.querySelectorAll(".glass");
    expect(faces.length).toBeGreaterThanOrEqual(2);
  });

  it("displays card counter", () => {
    render(<FlashCard card={sampleCard} index={3} total={10} />);
    expect(screen.getByText("Card 3 of 10")).toBeInTheDocument();
  });
});
