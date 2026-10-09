import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/** Renders the prose of the design pages. Never used for AI output or customer text (spec 4.1 rule 7). */
export function Markdown({ source }: { source: string }) {
  return (
    <div className="prose-linea max-w-3xl text-[15px] leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h2: ({ children }) => <h2 className="mt-6 mb-2 text-base font-semibold">{children}</h2>,
          h3: ({ children }) => <h3 className="mt-4 mb-1 text-sm font-semibold">{children}</h3>,
          p: ({ children }) => <p className="mb-3">{children}</p>,
          ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5">{children}</ol>,
          code: ({ children }) => <code className="rounded bg-muted px-1 py-0.5 text-[13px]">{children}</code>,
          table: ({ children }) => (
            <div className="mb-3 overflow-x-auto rounded-md border bg-card">
              <table className="w-full text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border-b px-2 py-1.5 text-left font-medium">{children}</th>,
          td: ({ children }) => <td className="border-b px-2 py-1.5 align-top">{children}</td>,
          a: ({ children, href }) => (
            <a href={href} className="text-primary underline">
              {children}
            </a>
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  )
}
