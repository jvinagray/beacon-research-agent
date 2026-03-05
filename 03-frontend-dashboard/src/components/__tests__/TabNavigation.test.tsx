import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import TabNavigation from "../TabNavigation";

describe("TabNavigation", () => {
  it("renders Chat tab button", () => {
    render(<TabNavigation active="sources" onChange={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /chat/i }),
    ).toBeInTheDocument();
  });

  it("Chat tab button triggers onChange with 'chat'", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<TabNavigation active="sources" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /chat/i }));
    expect(onChange).toHaveBeenCalledWith("chat");
  });

  it("renders Timeline tab when included in visibleTabs", () => {
    render(
      <TabNavigation
        active="sources"
        onChange={vi.fn()}
        visibleTabs={["sources", "timeline", "chat"]}
      />
    );
    expect(screen.getByRole("button", { name: /timeline/i })).toBeInTheDocument();
  });

  it("does not render Timeline tab when excluded from visibleTabs", () => {
    render(
      <TabNavigation
        active="sources"
        onChange={vi.fn()}
        visibleTabs={["sources", "summary", "chat"]}
      />
    );
    expect(screen.queryByRole("button", { name: /timeline/i })).not.toBeInTheDocument();
  });

  it("accepts visibleTabs prop to control which tabs display", () => {
    render(
      <TabNavigation
        active="sources"
        onChange={vi.fn()}
        visibleTabs={["sources", "flashcards"]}
      />
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(2);
    expect(screen.getByRole("button", { name: /sources/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /flashcards/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /chat/i })).not.toBeInTheDocument();
  });
});
