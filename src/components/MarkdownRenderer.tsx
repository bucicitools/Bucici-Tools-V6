import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className = "" }: Props) {
  return (
    <div className={`markdown-body text-sm leading-relaxed space-y-2.5 ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-base sm:text-lg font-bold text-foreground mt-3 mb-1.5 border-b border-border/40 pb-1">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-sm sm:text-base font-bold text-foreground mt-3 mb-1">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-semibold text-foreground mt-2 mb-1">{children}</h3>
          ),
          p: ({ children }) => <p className="mb-2 leading-relaxed last:mb-0">{children}</p>,
          ul: ({ children }) => (
            <ul className="list-disc list-inside space-y-1 my-2 pl-1">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside space-y-1 my-2 pl-1">{children}</ol>
          ),
          li: ({ children }) => <li className="text-foreground/90">{children}</li>,
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          em: ({ children }) => <em className="italic text-foreground/80">{children}</em>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-primary/60 bg-muted/40 italic px-3 py-1.5 my-2 rounded-r text-muted-foreground text-xs">
              {children}
            </blockquote>
          ),
          code({ className, children, ...props }) {
            const isBlock = Boolean(className);
            if (isBlock) {
              return (
                <div className="my-2 overflow-x-auto rounded-lg bg-slate-900 dark:bg-slate-950 p-3 text-xs text-slate-100 font-mono">
                  <code {...props}>{children}</code>
                </div>
              );
            }
            return (
              <code
                className="rounded bg-muted px-1.5 py-0.5 text-[12px] font-mono font-medium text-primary"
                {...props}
              >
                {children}
              </code>
            );
          },
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto rounded-xl border border-border/60 bg-card/50 shadow-sm">
              <table className="w-full text-left text-xs border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-muted/80 text-foreground font-semibold border-b border-border/60">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-border/40 text-foreground/90">{children}</tbody>
          ),
          tr: ({ children }) => <tr className="hover:bg-muted/30 transition-colors">{children}</tr>,
          th: ({ children }) => <th className="px-3 py-2 font-bold">{children}</th>,
          td: ({ children }) => <td className="px-3 py-2 leading-snug">{children}</td>,
          hr: () => <hr className="my-3 border-border/50" />,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline hover:text-primary-glow font-medium"
            >
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
