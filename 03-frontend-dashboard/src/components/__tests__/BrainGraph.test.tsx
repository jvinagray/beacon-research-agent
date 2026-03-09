import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { createRef } from "react";
import { BrainGraph } from "../BrainGraph";

// Mock d3 to avoid JSDOM SVG issues — all methods return chainable self
vi.mock("d3", () => {
  const chainable = (): any =>
    new Proxy(() => {}, {
      get: () => chainable(),
      apply: () => chainable(),
    });
  return {
    zoom: chainable,
    select: chainable,
    drag: chainable,
  };
});

describe("BrainGraph", () => {
  const defaultProps = {
    svgRef: createRef<SVGSVGElement>(),
    minimized: false,
    onMinimize: vi.fn(),
    onRestore: vi.fn(),
  };

  it("renders an SVG element", () => {
    const { container } = render(<BrainGraph {...defaultProps} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("SVG contains defs, links, nodes, labels groups", () => {
    const { container } = render(<BrainGraph {...defaultProps} />);
    const svg = container.querySelector("svg")!;
    expect(svg.querySelector("defs")).toBeInTheDocument();
    expect(svg.querySelector(".links")).toBeInTheDocument();
    expect(svg.querySelector(".nodes")).toBeInTheDocument();
    expect(svg.querySelector(".labels")).toBeInTheDocument();
  });

  it("minimize button renders and calls onMinimize when clicked", () => {
    const onMinimize = vi.fn();
    render(<BrainGraph {...defaultProps} onMinimize={onMinimize} />);
    const btn = screen.getByRole("button", { name: /minimize/i });
    fireEvent.click(btn);
    expect(onMinimize).toHaveBeenCalledOnce();
  });

  it("restore button renders when minimized and calls onRestore when clicked", () => {
    const onRestore = vi.fn();
    render(
      <BrainGraph {...defaultProps} minimized={true} onRestore={onRestore} />
    );
    const btn = screen.getByRole("button", { name: /restore/i });
    fireEvent.click(btn);
    expect(onRestore).toHaveBeenCalledOnce();
  });

  it("applies glass morphism class to container", () => {
    const { container } = render(<BrainGraph {...defaultProps} />);
    const wrapper = container.querySelector(".brain-graph-container");
    expect(wrapper).toBeInTheDocument();
    expect(wrapper).toHaveClass("glass-morphism");
  });

  it("applies minimized class when minimized prop is true", () => {
    const { container } = render(
      <BrainGraph {...defaultProps} minimized={true} />
    );
    const wrapper = container.querySelector(".brain-graph-container");
    expect(wrapper).toHaveClass("minimized");
  });
});
