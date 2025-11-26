'use client'

import React, { useRef } from 'react'
import Icon from '@/components/primitives/Icon'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'

interface GetMarkdownComponentsOptions {
  theme: string | undefined
  enableLinkPreview?: boolean
  messageId?: string
  copiedStates?: Record<string, boolean>
  onCopyCodeBlock?: (code: string, blockId: string) => void
  onCopyTable?: (tableContent: string, tableId: string) => void
}

// Helper function to convert table DOM structure to plain text table
function tableToMarkdown(tableElement: HTMLTableElement): string {
  const rows: string[][] = []
  const columnWidths: number[] = []

  // Extract all rows (from thead and tbody, or just table rows)
  const allRows = Array.from(tableElement.querySelectorAll('tr'))

  // First pass: extract all cell content as plain text
  for (const row of allRows) {
    const cells: string[] = []
    const cells_elements = Array.from(row.querySelectorAll('th, td'))
    for (let i = 0; i < cells_elements.length; i++) {
      const cell = cells_elements[i]
      // Get plain text content only (no markdown formatting)
      const plainText = (cell.textContent || (cell as HTMLElement).innerText || '').trim()
      cells.push(plainText)

      // Track column widths based on plain text length
      if (!columnWidths[i] || plainText.length > columnWidths[i]) {
        columnWidths[i] = Math.max(plainText.length, 3) // Minimum 3 for separator
      }
    }
    if (cells.length > 0) {
      rows.push(cells)
    }
  }

  if (rows.length === 0) {
    return ''
  }

  // Build plain text table
  const numColumns = Math.max(...rows.map(r => r.length), 1)

  // Ensure we have widths for all columns
  while (columnWidths.length < numColumns) {
    columnWidths.push(3)
  }

  // Use first row as header
  const headerRow = rows[0]
  const paddedHeader = [...headerRow, ...Array(numColumns - headerRow.length).fill('')]
  let table = '| ' + paddedHeader.map(cell => cell || '').join(' | ') + ' |\n'

  // Separator row with dashes matching column widths
  const separator = columnWidths
    .slice(0, numColumns)
    .map(width => '-'.repeat(Math.max(width, 3)))
    .join(' | ')
  table += '| ' + separator + ' |\n'

  // Data rows (skip first row if we have more than one row)
  if (rows.length > 1) {
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      const paddedRow = [...row, ...Array(numColumns - row.length).fill('')]
      table += '| ' + paddedRow.join(' | ') + ' |\n'
    }
  }

  return table.trim()
}

// Table component with copy functionality
function TableWithCopy({
  children,
  messageId,
  copiedStates,
  onCopyTable,
}: {
  children: React.ReactNode
  messageId: string
  copiedStates?: Record<string, boolean>
  onCopyTable?: (tableContent: string, tableId: string) => void
}) {
  const tableRef = useRef<HTMLTableElement>(null)
  const tableIdRef = useRef<string>(`${messageId}-table-${Math.random().toString(36).slice(2, 8)}`)
  const hasCopy = typeof onCopyTable === 'function'

  const handleCopyTable = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (tableRef.current && onCopyTable) {
      const markdown = tableToMarkdown(tableRef.current)
      onCopyTable(markdown, tableIdRef.current)
    }
  }

  return (
    <div className="table-wrapper relative rounded-lg border bg-muted/30 my-2 group/table">
      {hasCopy && (
        <div className="absolute top-2 right-2 z-10 opacity-0 group-hover/table:opacity-100 transition-opacity">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopyTable}>
            {copiedStates?.[tableIdRef.current] ? <Icon name="check" className="w-3 h-3 text-green-500" /> : <Icon name="copy" className="w-3 h-3" />}
          </Button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table ref={tableRef} className="min-w-full border-collapse border border-border rounded-lg">
          {children}
        </table>
      </div>
    </div>
  )
}

export function getMarkdownComponents({ theme, enableLinkPreview = true, messageId = 'md', copiedStates = {}, onCopyCodeBlock, onCopyTable }: GetMarkdownComponentsOptions) {
  return {
    p: ({ children }: any) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,

    a: ({ href, children }: any) => (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:text-primary/80 inline-flex items-center gap-1">
        {children}
        {enableLinkPreview && <Icon name="external-link" className="w-3 h-3" />}
      </a>
    ),

    code: ({ className: codeClassName, children, ...props }: any) => {
      const match = /language-(\w+)/.exec(codeClassName || '')
      const language = match ? match[1] : ''
      const isCodeBlock = Boolean(language)

      if (isCodeBlock) {
        const codeContent = String(children).replace(/\n$/, '')
        const blockId = `${messageId}-${Math.random().toString(36).slice(2, 8)}`
        const hasCopy = typeof onCopyCodeBlock === 'function'

        return (
          <div className="relative rounded-lg border bg-muted/30 my-2">
            <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/20">
              <span className="text-xs font-medium text-muted-foreground uppercase">{language}</span>
              {hasCopy && (
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onCopyCodeBlock(codeContent, blockId)}>
                  {copiedStates?.[blockId] ? <Icon name="check" className="w-3 h-3 text-green-500" /> : <Icon name="copy" className="w-3 h-3" />}
                </Button>
              )}
            </div>
            <SyntaxHighlighter
              style={theme === 'dark' ? oneDark : oneLight}
              language={language}
              PreTag="div"
              className="!m-0 !bg-transparent code-block-enhanced"
              customStyle={{
                margin: 0,
                background: 'transparent',
                fontSize: '0.875rem',
                padding: '1rem',
                lineHeight: '1.5',
              }}
            >
              {codeContent}
            </SyntaxHighlighter>
          </div>
        )
      }

      return (
        <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
          {children}
        </code>
      )
    },

    blockquote: ({ children }: any) => <blockquote className="border-l-4 border-primary/20 pl-4 py-2 bg-muted/20 rounded-r-lg my-2">{children}</blockquote>,
    ul: ({ children }: any) => <ul className="list-disc list-inside space-y-1 my-2">{children}</ul>,
    ol: ({ children }: any) => <ol className="list-decimal list-inside space-y-1 my-2">{children}</ol>,
    table: ({ children }: any) => (
      <TableWithCopy messageId={messageId} copiedStates={copiedStates} onCopyTable={onCopyTable}>
        {children}
      </TableWithCopy>
    ),
    th: ({ children }: any) => <th className="border border-border bg-muted/50 px-3 py-2 text-left font-medium">{children}</th>,
    td: ({ children }: any) => <td className="border border-border px-3 py-2">{children}</td>,
    h1: ({ children }: any) => <h1 className="text-xl font-bold mt-4 mb-2 first:mt-0">{children}</h1>,
    h2: ({ children }: any) => <h2 className="text-lg font-semibold mt-3 mb-2 first:mt-0">{children}</h2>,
    h3: ({ children }: any) => <h3 className="text-base font-medium mt-3 mb-2 first:mt-0">{children}</h3>,
  }
}

interface MarkdownContentProps {
  content: string
  className?: string
  theme: string | undefined
  enableLinkPreview?: boolean
}

export function MarkdownContent({ content, className, theme, enableLinkPreview = true }: MarkdownContentProps) {
  const components = getMarkdownComponents({ theme, enableLinkPreview, messageId: 'md' })
  return (
    <div className={cn('prose prose-sm dark:prose-invert max-w-none break-words', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
