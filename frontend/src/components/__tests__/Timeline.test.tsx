import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Timeline from "../Timeline";
import type { TimelineEvent } from "@/types/research";

// Mock IntersectionObserver
const mockObserve = vi.fn();
const mockUnobserve = vi.fn();
const mockDisconnect = vi.fn();

beforeEach(() => {
  mockObserve.mockReset();
  mockUnobserve.mockReset();
  mockDisconnect.mockReset();
  vi.stubGlobal(
    "IntersectionObserver",
    vi.fn().mockImplementation((callback: IntersectionObserverCallback) => {
      // Immediately trigger intersection for all observed elements
      setTimeout(() => {
        callback(
          [{ isIntersecting: true, target: document.createElement("div") }] as unknown as IntersectionObserverEntry[],
          {} as IntersectionObserver
        );
      }, 0);
      return {
        observe: mockObserve,
        unobserve: mockUnobserve,
        disconnect: mockDisconnect,
      };
    })
  );
});

const sampleEvents: TimelineEvent[] = [
  {
    date: "2024-01",
    title: "Initial Release",
    description: "The framework was first released.",
    source_title: "Official Blog",
    significance: "high",
  },
  {
    date: "2024-06",
    title: "Major Update",
    description: "Added plugin system.",
    source_title: "Release Notes",
    significance: "medium",
  },
  {
    date: "2024-12",
    title: "Minor Patch",
    description: "Bug fixes.",
    source_title: "Changelog",
    significance: "low",
  },
];

describe("Timeline", () => {
  it("renders a timeline item for each event", () => {
    render(<Timeline events={sampleEvents} />);
    const items = screen.getAllByTestId("timeline-event");
    expect(items).toHaveLength(3);
  });

  it("displays date, title, description for each event", () => {
    render(<Timeline events={sampleEvents} />);
    expect(screen.getByText("2024-01")).toBeInTheDocument();
    expect(screen.getByText("Initial Release")).toBeInTheDocument();
    expect(screen.getByText("The framework was first released.")).toBeInTheDocument();
    expect(screen.getByText("2024-06")).toBeInTheDocument();
    expect(screen.getByText("Major Update")).toBeInTheDocument();
  });

  it("displays source_title as badge", () => {
    render(<Timeline events={sampleEvents} />);
    expect(screen.getByText("Official Blog")).toBeInTheDocument();
    expect(screen.getByText("Release Notes")).toBeInTheDocument();
    expect(screen.getByText("Changelog")).toBeInTheDocument();
  });

  it("high significance events have primary glow styling", () => {
    render(<Timeline events={[sampleEvents[0]]} />);
    const card = screen.getByTestId("timeline-event");
    // High significance should have glow shadow class
    expect(card.innerHTML).toContain("shadow-");
  });

  it("low significance events have muted styling", () => {
    render(<Timeline events={[sampleEvents[2]]} />);
    const card = screen.getByTestId("timeline-event");
    expect(card.innerHTML).toContain("opacity-75");
  });

  it("renders empty state gracefully when events array is empty", () => {
    const { container } = render(<Timeline events={[]} />);
    expect(container.innerHTML).toBe("");
  });
});
