import { useState, useRef, useEffect, useCallback, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { MessageCircle, Send, ExternalLink } from "lucide-react";
import MarkdownViewer from "./MarkdownViewer";
import type { ChatMessage } from "@/types/research";

interface ChatPanelProps {
  sessionId: string | null;
  topic: string;
  messages: ChatMessage[];
  isStreaming: boolean;
  error: string | null;
  sendMessage: (message: string) => void;
}

function getSuggestionChips(topic: string): string[] {
  return [
    `What are the key takeaways about ${topic}?`,
    "Compare the main approaches discussed",
    `What should I learn first about ${topic}?`,
    "What are the practical applications?",
  ];
}

const ThinkingIndicator = () => (
  <div data-testid="thinking-indicator" className="flex gap-1.5 py-2 px-1">
    <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-pulse" style={{ animationDelay: "0ms" }} />
    <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-pulse" style={{ animationDelay: "150ms" }} />
    <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-pulse" style={{ animationDelay: "300ms" }} />
  </div>
);

const ChatPanel = ({ sessionId, topic, messages, isStreaming, error, sendMessage }: ChatPanelProps) => {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  const scrollToBottom = useCallback(() => {
    const container = containerRef.current;
    if (isNearBottomRef.current && container) {
      container.scrollTop = container.scrollHeight;
    }
  }, []);

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    isNearBottomRef.current =
      container.scrollHeight - container.scrollTop - container.clientHeight < 100;
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    sendMessage(trimmed);
    setInput("");
  };

  const isDisabled = !sessionId;
  const isEmpty = messages.length === 0 && !!sessionId;
  const showLengthNotice = messages.length >= 40;
  const lastMessage = messages[messages.length - 1];
  const showThinking = isStreaming && lastMessage?.role === "assistant" && lastMessage.content === "";

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Message area */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
      >
        {isDisabled && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <MessageCircle className="w-12 h-12 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">
              Start a research session to use chat
            </p>
            <Link
              to="/search"
              className="mt-2 text-sm text-primary hover:text-primary/80 transition-colors"
            >
              Go to Search
            </Link>
          </div>
        )}

        {isEmpty && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <MessageCircle className="w-12 h-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-medium mb-6">Ask about your research</h3>
            <div className="flex flex-wrap justify-center gap-2 max-w-lg">
              {getSuggestionChips(topic).map((chip) => (
                <button
                  key={chip}
                  data-testid="suggestion-chip"
                  onClick={() => sendMessage(chip)}
                  className="px-4 py-2 rounded-full text-sm glass border border-glass-border hover:bg-glass-highlight/20 transition-colors text-left"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={idx}>
            {msg.role === "user" ? (
              <div className="flex justify-end">
                <div className="max-w-[80%] px-4 py-3 rounded-2xl bg-primary/15 text-sm">
                  {msg.content}
                </div>
              </div>
            ) : (
              <div className="flex justify-start">
                <div className="max-w-[80%] glass rounded-2xl px-4 py-3">
                  {showThinking && idx === messages.length - 1 ? (
                    <ThinkingIndicator />
                  ) : (
                    <>
                      <div className="text-sm">
                        <MarkdownViewer content={msg.content} />
                        {isStreaming && idx === messages.length - 1 && msg.content && (
                          <span className="inline-block animate-pulse">&#9610;</span>
                        )}
                      </div>
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-glass-border">
                          {msg.sources.map((source) => (
                            <a
                              key={source.url}
                              href={source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-3 py-1 text-xs rounded-full glass border border-glass-border hover:bg-glass-highlight/20 transition-colors"
                            >
                              {source.title}
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Conversation length notice */}
      {showLengthNotice && (
        <div className="px-4 py-2 text-center">
          <p className="text-xs text-muted-foreground">
            This is a long conversation. Consider starting a new one for best results.
          </p>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="mx-4 mb-2 px-4 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Input area */}
      <form onSubmit={handleSubmit} className="px-4 pb-4 pt-2">
        <div className="flex gap-2 items-center glass rounded-xl px-4 py-2 border border-glass-border">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Ask a question about ${topic}...`}
            disabled={isDisabled || isStreaming}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || isStreaming || isDisabled}
            aria-label="Send message"
            className="p-2 rounded-lg text-primary hover:bg-primary/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
};

export default ChatPanel;
