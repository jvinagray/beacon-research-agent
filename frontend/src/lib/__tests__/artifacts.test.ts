import { describe, it, expect } from "vitest";
import { normalizeArtifact } from "../artifacts";

describe("normalizeArtifact - flashcard fence stripping", () => {
  it("strips ```json fenced response and returns parsed array", () => {
    const fenced = '```json\n[{"question":"Q","answer":"A"}]\n```';
    const result = normalizeArtifact("flashcards", fenced);
    expect(result).toEqual([{ question: "Q", answer: "A" }]);
  });

  it("strips plain ``` fences (no language tag)", () => {
    const fenced = '```\n[{"question":"Q","answer":"A"}]\n```';
    const result = normalizeArtifact("flashcards", fenced);
    expect(result).toEqual([{ question: "Q", answer: "A" }]);
  });

  it("still works for clean JSON string (no fences)", () => {
    const clean = '[{"question":"Q","answer":"A"}]';
    const result = normalizeArtifact("flashcards", clean);
    expect(result).toEqual([{ question: "Q", answer: "A" }]);
  });

  it("passes through pre-parsed arrays unchanged", () => {
    const arr = [{ question: "Q", answer: "A" }];
    const result = normalizeArtifact("flashcards", arr as unknown as string);
    expect(result).toEqual(arr);
  });
});
