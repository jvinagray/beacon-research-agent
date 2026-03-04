const MarkdownViewer = ({ content }: { content: string }) => {
  return (
    <div className="glass p-8 max-w-3xl mx-auto prose-invert">
      <div
        className="text-foreground leading-relaxed space-y-4
          [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-foreground [&_h1]:mb-4
          [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground [&_h2]:mb-3 [&_h2]:mt-6
          [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-foreground [&_h3]:mb-2 [&_h3]:mt-4
          [&_p]:text-sm [&_p]:text-muted-foreground [&_p]:leading-relaxed
          [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:text-sm [&_ul]:text-muted-foreground
          [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:text-sm [&_ol]:text-muted-foreground
          [&_li]:mb-1
          [&_strong]:text-foreground [&_strong]:font-semibold
          [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    </div>
  );
};

export default MarkdownViewer;
