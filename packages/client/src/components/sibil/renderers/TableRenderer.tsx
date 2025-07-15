'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface TableRendererProps {
  content: string
  headers?: string[]
}

export function TableRenderer({ content, headers }: TableRendererProps) {
  return (
    <div className="overflow-x-auto max-w-full">
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            table: ({ children }) => (
              <table className="min-w-full border-collapse border border-border rounded-lg overflow-hidden whitespace-nowrap">
                {children}
              </table>
            ),
            thead: ({ children }) => (
              <thead className="bg-muted">
                {children}
              </thead>
            ),
            tbody: ({ children }) => (
              <tbody className="bg-background">
                {children}
              </tbody>
            ),
            tr: ({ children }) => (
              <tr className="border-b border-border hover:bg-muted/50 transition-colors">
                {children}
              </tr>
            ),
            th: ({ children }) => (
              <th className="px-4 py-2 text-left text-xs font-semibold text-foreground uppercase tracking-wider border-r border-border last:border-r-0">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="px-4 py-2 text-sm text-foreground border-r border-border last:border-r-0">
                {children}
              </td>
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  )
}