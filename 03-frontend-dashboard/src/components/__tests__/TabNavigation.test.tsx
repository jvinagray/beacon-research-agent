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
});
