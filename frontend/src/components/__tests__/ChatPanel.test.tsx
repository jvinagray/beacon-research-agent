import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import ChatPanel from "../ChatPanel";
import type { ChatMessage } from "@/types/research";

vi.mock("../MarkdownViewer", () => ({
  default: ({ content }: { content: string }) => (
    <div data-testid="markdown-viewer">{content}</div>
  ),
}));

const defaultProps = {
  sessionId: "test-session",
  topic: "AI",
  messages: [] as ChatMessage[],
  isStreaming: false,
  error: null,
  sendMessage: vi.fn(),
};

function renderChatPanel(props = {}) {
  return render(
    <MemoryRouter>
      <ChatPanel {...defaultProps} {...props} />
    </MemoryRouter>,
  );
}

describe("ChatPanel", () => {
  it("renders suggestion chips in empty state", () => {
    renderChatPanel();
    const chips = screen.getAllByTestId("suggestion-chip");
    expect(chips.length).toBeGreaterThanOrEqual(3);
  });

  it("suggestion chips include the topic name", () => {
    renderChatPanel({ topic: "Machine Learning" });
    const chips = screen.getAllByTestId("suggestion-chip");
    const hasTopicChip = chips.some((chip) =>
      chip.textContent?.includes("Machine Learning"),
    );
    expect(hasTopicChip).toBe(true);
  });

  it("clicking a suggestion chip calls sendMessage with chip text", async () => {
    const sendMessage = vi.fn();
    const user = userEvent.setup();
    renderChatPanel({ sendMessage });

    const chips = screen.getAllByTestId("suggestion-chip");
    await user.click(chips[0]);

    expect(sendMessage).toHaveBeenCalledWith(chips[0].textContent);
  });

  it("renders session expired message when sessionId is null", () => {
    renderChatPanel({ sessionId: null });
    expect(
      screen.getByText(/start a research session/i),
    ).toBeInTheDocument();
    const input = screen.getByPlaceholderText(/ask a question/i);
    expect(input).toBeDisabled();
  });

  it("renders user messages", () => {
    const messages: ChatMessage[] = [
      { role: "user", content: "Hello there" },
    ];
    renderChatPanel({ messages });
    expect(screen.getByText("Hello there")).toBeInTheDocument();
  });

  it("renders assistant messages with MarkdownViewer", () => {
    const messages: ChatMessage[] = [
      { role: "assistant", content: "# Hello" },
    ];
    renderChatPanel({ messages });
    expect(screen.getByTestId("markdown-viewer")).toHaveTextContent("# Hello");
  });

  it("renders source citation chips below assistant messages", () => {
    const messages: ChatMessage[] = [
      {
        role: "assistant",
        content: "Here is info",
        sources: [{ title: "Source A", url: "https://example.com" }],
      },
    ];
    renderChatPanel({ messages });
    expect(screen.getByText("Source A")).toBeInTheDocument();
  });

  it("input is disabled during streaming", () => {
    renderChatPanel({ isStreaming: true });
    const input = screen.getByPlaceholderText(/ask a question/i);
    expect(input).toBeDisabled();
  });

  it("send button is disabled when input is empty", () => {
    renderChatPanel();
    const sendBtn = screen.getByLabelText(/send message/i);
    expect(sendBtn).toBeDisabled();
  });

  it("shows thinking indicator when streaming but no content yet", () => {
    const messages: ChatMessage[] = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "" },
    ];
    renderChatPanel({ messages, isStreaming: true });
    expect(screen.getByTestId("thinking-indicator")).toBeInTheDocument();
  });

  it("shows conversation length notice when messages >= 40", () => {
    const messages: ChatMessage[] = Array.from({ length: 40 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `Message ${i}`,
    }));
    renderChatPanel({ messages });
    expect(screen.getByText(/long conversation/i)).toBeInTheDocument();
  });
});
