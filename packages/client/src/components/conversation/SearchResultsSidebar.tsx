'use client'

import Icon from '@/components/primitives/Icon'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import type { SearchResult } from './conversationSearch'

function snippetWithHighlight(snippet: string, term: string | undefined): React.ReactNode {
  if (!term || term.trim() === '') return snippet
  const t = term.trim()
  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = snippet.split(new RegExp(`(${escaped})`, 'gi'))
  const tLower = t.toLowerCase()
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === tLower ? (
          <mark key={i} className="bg-amber-200/70 dark:bg-amber-400/50 rounded px-0.5 font-medium">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  )
}

function formatTimestamp(ts?: string): string {
  if (!ts) return ''
  try {
    const d = new Date(ts)
    return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return ''
  }
}

export interface SearchResultsSidebarProps {
  query: string
  results: SearchResult[]
  onSelectResult: (messageId: string, matchIndex: number) => void
  onClose: () => void
  className?: string
}

export function SearchResultsSidebar({
  query,
  results,
  onSelectResult,
  onClose,
  className,
}: SearchResultsSidebarProps) {
  return (
    <div
      className={cn(
        'flex flex-col w-full min-w-[320px] max-w-[400px] border-l border-border bg-background flex-shrink-0',
        className
      )}
      role="region"
      aria-label="Search results"
    >
      <div className="flex-shrink-0 border-b border-border px-3 py-2 flex flex-col gap-2">
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 flex-shrink-0"
            onClick={onClose}
            aria-label="Close search"
          >
            <Icon name="x" className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center justify-between mt-4 mb-1.5 px-0">
          <span className="text-xs font-medium text-foreground">
            {results.length} {results.length === 1 ? 'Result' : 'Results'}
          </span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        {results.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No matches for &quot;{query}&quot;
          </div>
        ) : (
          <ul className="p-2 space-y-2" role="list">
            {results.map((r) => (
              <li key={r.messageId}>
                <button
                  type="button"
                  onClick={() => onSelectResult(r.messageId, r.firstMatchIndexInPositions)}
                  className={cn(
                    'w-full text-left rounded-lg px-3 py-2 border border-transparent',
                    'hover:bg-muted/50 hover:border-border/60 transition-colors'
                  )}
                  aria-label={`Jump to message, ${r.occurrenceCount} match${r.occurrenceCount === 1 ? '' : 'es'}`}
                >
                  <div className="flex items-start gap-2">
                    <Avatar className="h-8 w-8 rounded-full flex-shrink-0 mt-0.5">
                      <AvatarFallback className="rounded-full bg-primary/10 text-primary text-xs">
                        {r.role === 'user' ? 'Y' : (r.agentName ?? 'A').slice(0, 1).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium text-foreground">
                          {r.role === 'user' ? 'You' : (r.agentName ?? 'Assistant')}
                        </span>
                        {r.timestamp && (
                          <span className="text-xs text-muted-foreground">{formatTimestamp(r.timestamp)}</span>
                        )}
                        {r.occurrenceCount > 1 && (
                          <span className="text-xs text-muted-foreground">{r.occurrenceCount} matches</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 break-words">
                        {snippetWithHighlight(r.contentSnippet, query)}
                      </p>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
