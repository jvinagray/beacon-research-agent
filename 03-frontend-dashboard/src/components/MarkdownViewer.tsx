import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

interface MarkdownViewerProps {
  content: string;
}

const components: Components = {
  a: ({ children, href, ...props }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary hover:text-primary/80 transition-colors"
      {...props}
    >
      {children}
    </a>
  ),
  pre: ({ children, ...props }) => (
    <pre
      className="glass p-4 rounded-lg text-sm overflow-x-auto"
      {...props}
    >
      {children}
    </pre>
  ),
  code: ({ children, className, ...props }) => {
    // Inline code only — block code is handled by `pre` override
    if (className?.includes("language-")) {
      return <code className={className} {...props}>{children}</code>;
    }
    return (
      <code className="px-1.5 py-0.5 rounded bg-muted text-sm" {...props}>
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
      <table className="w-full border-collapse glass rounded-lg overflow-hidden" {...props}>
        {children}
      </table>
    </div>
  ),
  th: ({ children, ...props }) => (
    <th className="px-4 py-2 text-left text-sm font-semibold border-b border-glass-border" {...props}>
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td className="px-4 py-2 text-sm border-b border-glass-border" {...props}>
      {children}
    </td>
  ),
};

const MarkdownViewer = ({ content }: MarkdownViewerProps) => {
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
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownViewer;
