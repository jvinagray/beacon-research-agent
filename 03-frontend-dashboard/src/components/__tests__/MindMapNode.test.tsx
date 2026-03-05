import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import MindMapNode from "../MindMapNode";

describe("MindMapNode", () => {
  it("renders node name text without truncation", () => {
    render(
      <MindMapNode
        node={{ name: "Full Long Node Name That Should Not Be Truncated" }}
        depth={0}
      />
    );
    expect(
      screen.getByText("Full Long Node Name That Should Not Be Truncated")
    ).toBeInTheDocument();
  });

  it("leaf node (no children) does not render chevron icon", () => {
    const { container } = render(
      <MindMapNode node={{ name: "Leaf" }} depth={0} />
    );
    // Chevron should not be present for leaf nodes
    expect(container.querySelector("svg")).toBeNull();
  });

  it("node with children at depth 0 is initially expanded", () => {
    render(
      <MindMapNode
        node={{ name: "Root", children: [{ name: "Child" }] }}
        depth={0}
      />
    );
    expect(screen.getByText("Child")).toBeInTheDocument();
  });

  it("node with children at depth 1 is initially expanded", () => {
    render(
      <MindMapNode
        node={{ name: "Parent", children: [{ name: "Child" }] }}
        depth={1}
      />
    );
    expect(screen.getByText("Child")).toBeInTheDocument();
  });

  it("node with children at depth 2 is initially collapsed", () => {
    render(
      <MindMapNode
        node={{ name: "Deep", children: [{ name: "Hidden Child" }] }}
        depth={2}
      />
    );
    expect(screen.queryByText("Hidden Child")).not.toBeInTheDocument();
  });

  it("clicking collapsed node expands it", async () => {
    const user = userEvent.setup();
    render(
      <MindMapNode
        node={{ name: "Deep", children: [{ name: "Hidden Child" }] }}
        depth={2}
      />
    );
    expect(screen.queryByText("Hidden Child")).not.toBeInTheDocument();

    await user.click(screen.getByText("Deep"));
    expect(screen.getByText("Hidden Child")).toBeInTheDocument();
  });

  it("clicking expanded node collapses it", async () => {
    const user = userEvent.setup();
    render(
      <MindMapNode
        node={{ name: "Root", children: [{ name: "Visible Child" }] }}
        depth={0}
      />
    );
    expect(screen.getByText("Visible Child")).toBeInTheDocument();

    await user.click(screen.getByText("Root"));
    expect(screen.queryByText("Visible Child")).not.toBeInTheDocument();
  });

  it("depth 0 has primary border color class", () => {
    const { container } = render(
      <MindMapNode node={{ name: "Root" }} depth={0} />
    );
    const card = container.firstElementChild;
    expect(card?.className).toContain("border-primary");
  });

  it("depth 1 has blue border color class", () => {
    const { container } = render(
      <MindMapNode node={{ name: "Level1" }} depth={1} />
    );
    const card = container.firstElementChild;
    expect(card?.className).toContain("border-blue-500");
  });
});
