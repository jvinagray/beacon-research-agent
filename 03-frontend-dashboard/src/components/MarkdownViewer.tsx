import { useMemo } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import type { EvaluatedSource } from "@/types/research";
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from "@/components/ui/hover-card";
import { Search } from "lucide-react";

interface MarkdownViewerProps {
  content: string;
  sources?: EvaluatedSource[];
  onDrillDown?: (concept: string) => void;
}

function customUrlTransform(url: string): string {
  if (url.startsWith("cite:") || url.startsWith("drill://")) {
    return url;
  }
  return defaultUrlTransform(url);
}

function scoreColor(score: number): string {
  if (score >= 7) return "text-score-green";
  if (score >= 4) return "text-score-yellow";
  return "text-score-red";
}

const MarkdownViewer = ({ content, sources, onDrillDown }: MarkdownViewerProps) => {
  const memoizedComponents = useMemo<Components>(
    () => ({
      a: ({ children, href, ...props }) => {
        // Citation badge
        if (href?.startsWith("cite:") && sources) {
          const index = parseInt(href.slice(5), 10);
          const source = sources[index - 1];
          if (!source) {
            return <span>{children}</span>;
          }
          return (
            <HoverCard>
              <HoverCardTrigger asChild>
                <sup
                  className="text-primary cursor-pointer font-semibold text-xs hover:text-primary/80 transition-colors"
                  onClick={() => window.open(source.url, "_blank")}
                >
                  [{index}]
                </sup>
              </HoverCardTrigger>
              <HoverCardContent className="glass border border-glass-border w-72">
                <div className="space-y-2">
                  <p className="text-sm font-bold">{source.title}</p>
                  <span
                    className={`text-xs font-semibold ${scoreColor(source.signals.learning_efficiency_score)}`}
                  >
                    {source.signals.learning_efficiency_score}/10
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {source.signals.key_insight}
                  </p>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary text-xs hover:text-primary/80 transition-colors"
                  >
                    View source
                  </a>
                </div>
              </HoverCardContent>
            </HoverCard>
          );
        }

        // Citation without sources — render as plain text
        if (href?.startsWith("cite:")) {
          return <span>{children}</span>;
        }

        // Drill-down link
        if (href?.startsWith("drill://")) {
          if (onDrillDown) {
            const concept = href.slice(8);
            return (
              <button
                type="button"
                className="text-primary cursor-pointer border-b border-dotted border-primary/50 hover:border-primary transition-colors inline-flex items-center gap-1 bg-transparent p-0 font-inherit text-inherit"
                onClick={() => onDrillDown(concept)}
              >
                {children}
                <Search size={12} />
              </button>
            );
          }
          return <span>{children}</span>;
        }

        // Default external link
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:text-primary/80 transition-colors"
            {...props}
          >
            {children}
          </a>
        );
      },
      pre: ({ children, ...props }) => (
        <pre
          className="glass p-4 rounded-lg text-sm overflow-x-auto"
          {...props}
        >
          {children}
        </pre>
      ),
      code: ({ children, className, ...props }) => {
        if (className?.includes("language-")) {
          return (
            <code className={className} {...props}>
              {children}
            </code>
          );
        }
        return (
          <code
            className="px-1.5 py-0.5 rounded bg-muted text-sm"
            {...props}
          >
            {children}
          </code>
        );
      },
      tr: ({ children, ...props }) => (
        <tr className="even:bg-glass-highlight/10" {...props}>
          {children}
        </tr>
      ),
      table: ({ children, ...props }) => (
        <div className="overflow-x-auto">
          <table
            className="w-full border-collapse glass rounded-lg overflow-hidden"
            {...props}
          >
            {children}
          </table>
        </div>
      ),
      th: ({ children, ...props }) => (
        <th
          className="px-4 py-2 text-left text-sm font-semibold border-b border-glass-border"
          {...props}
        >
          {children}
        </th>
      ),
      td: ({ children, ...props }) => (
        <td
          className="px-4 py-2 text-sm border-b border-glass-border"
          {...props}
        >
          {children}
        </td>
      ),
    }),
    [sources, onDrillDown]
  );

  if (!content || !content.trim()) {
    return (
      <div className="prose prose-invert max-w-none">
        <p className="text-muted-foreground text-center py-8">
          No summary was generated for this research.
        </p>
      </div>
    );
  }

  return (
    <div className="prose prose-invert max-w-none overflow-auto">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={memoizedComponents}
        urlTransform={customUrlTransform}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownViewer;
