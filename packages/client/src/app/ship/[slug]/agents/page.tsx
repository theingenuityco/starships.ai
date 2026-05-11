'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

import Icon from '@/components/primitives/Icon'
import AgentAvatar from '@/components/animated/AgentAvatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { PresenceIndicator } from '@/components/ui/PresenceIndicator'
import { MobileNavToggleButton } from '@/components/navigation/MobileNavToggleButton'

import { useStarshipBySlug } from '@/hooks/useStarships'
import { useInfiniteStarshipAgents } from '@/hooks/useAgents'
import { useMessageAttachments } from '@/hooks/useFileUpload'
import { cn } from '@/lib/utils'
import { formatAgentDisplayName } from '@/lib/agentDisplay'
import type { AgentModel } from '@starships/protocol'

const SEARCH_DEBOUNCE_MS = 400
const PAGE_SIZE = 18

const CTA_BUTTON_CLASS =
  'h-8 group min-w-[130px] justify-center shrink-0 font-medium transition-all duration-200 border border-transparent text-[rgba(245,158,11,0.8)] hover:text-[rgba(245,158,11,0.8)] hover:border-[rgba(245,158,11,0.25)] hover:bg-[linear-gradient(135deg,rgba(245,158,11,0.10),rgba(251,191,36,0.06))] hover:shadow-[0_0_4px_rgba(245,158,11,0.10)] disabled:text-muted-foreground disabled:hover:text-muted-foreground disabled:hover:border-transparent disabled:hover:bg-transparent disabled:hover:shadow-none'
const CTA_ICON_CLASS = 'mr-1 h-4 w-4 text-[rgba(245,158,11,0.85)] group-disabled:text-muted-foreground'
const LOAD_MORE_BUTTON_CLASS = 'h-7 px-2.5 text-[11px] bg-transparent border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40'

export default function AgentsPage(): React.JSX.Element {
  const router = useRouter()
  const { slug: slugParam } = useParams<{ slug: string }>()
  const slug = typeof slugParam === 'string' ? slugParam : ''

  const { data: starship, isLoading: starshipLoading } = useStarshipBySlug(slug, Boolean(slug))
  const starshipId = starship?.id ? String(starship.id) : ''

  const [searchValue, setSearchValue] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchValue.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [searchValue])

  const agentsQuery = useInfiniteStarshipAgents(starshipId, Boolean(starshipId), {
    limit: PAGE_SIZE,
    order: 'DESC',
    search: debouncedQuery || undefined,
  })

  const agents = useMemo(() => {
    const pages = agentsQuery.data?.pages ?? []
    return pages.flatMap(p => (Array.isArray(p?.agents) ? p.agents : []))
  }, [agentsQuery.data])

  const agentAvatarAttachmentIds = useMemo(() => {
    const ids = agents.map(a => String(a?.avatarAttachmentId || '').trim()).filter(Boolean)
    return Array.from(new Set(ids))
  }, [agents])

  const { data: agentAvatarAttachments = [] } = useMessageAttachments(agentAvatarAttachmentIds, starshipId || undefined)

  const agentAvatarUrlById = useMemo(() => {
    const m = new Map<string, string>()
    for (const att of agentAvatarAttachments || []) {
      const id = String((att as any)?.id || '').trim()
      const url = String((att as any)?.previewUrl || '').trim()
      if (id && url) m.set(id, url)
    }
    return m
  }, [agentAvatarAttachments])

  const q = debouncedQuery.trim()
  const isInitialLoading = !q && Boolean(agentsQuery.isLoading)
  const isSearching = Boolean(q && (agentsQuery.isLoading || (agentsQuery.isFetching && !agentsQuery.isFetchingNextPage)))

  const renderRowSkeleton = useCallback((key: string) => {
    return (
      <div key={key} className="rounded-lg border border-border/60 bg-card px-4 py-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <div className="relative mt-0.5 h-10 w-10 flex-shrink-0">
              <span className="flex h-10 w-10 items-center justify-center rounded-full ring-1 ring-border/50 bg-muted/10 overflow-hidden">
                <Skeleton className="h-[22px] w-[22px] rounded-md" />
              </span>
              <span className="absolute bottom-0 right-0 translate-x-[22%] translate-y-[6%] z-50 pointer-events-none">
                <Skeleton className="h-2 w-2 rounded-full ring-2 ring-background outline outline-1 outline-border" />
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-40 max-w-[70%]" />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                <Skeleton className="h-3 w-64 max-w-full" />
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 self-center">
          <Skeleton className="h-8 min-w-[130px] rounded-2xl" />
        </div>
      </div>
    )
  }, [])

  const renderList = () => {
    if (starshipLoading || isInitialLoading) {
      return <div className="space-y-2">{Array.from({ length: 3 }, (_, i) => renderRowSkeleton(`agent-skel-${i}`))}</div>
    }
    if (isSearching) {
      return (
        <div className="flex items-center justify-center py-10">
          <p className="text-sm text-muted-foreground text-center">Searching &quot;{q}&quot;…</p>
        </div>
      )
    }
    if (agents.length === 0) {
      return (
        <div className="flex items-center justify-center py-10">
          <p className="text-sm text-muted-foreground text-center">
            {debouncedQuery ? `No agents match "${debouncedQuery}".` : 'No agents in this starship yet.'}
          </p>
        </div>
      )
    }

    return (
      <div className="space-y-2">
        {agents.map((a: AgentModel) => {
          const agentSlug = String(a?.slug || '')
          const avatarAttachmentId = String(a?.avatarAttachmentId || '').trim()
          const avatarUrl = avatarAttachmentId ? agentAvatarUrlById.get(avatarAttachmentId) : undefined
          const avatarSeed = formatAgentDisplayName(a) || String(a?.name || '').trim() || agentSlug || 'Agent'
          return (
            <div key={String(a.id)} className="rounded-lg border border-border/60 bg-card px-4 py-3 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1" aria-label={formatAgentDisplayName(a) || agentSlug || 'Agent'}>
                <div className="flex items-start gap-3">
                  <div className="relative mt-0.5 h-10 w-10 flex-shrink-0">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full ring-1 ring-border/50 bg-muted/10 overflow-hidden">
                      <AgentAvatar seed={avatarSeed} imageUrl={avatarUrl} size={40} rounded instanceId={String(a.id)} />
                    </span>
                    <PresenceIndicator kind="online" active={true} size="sm" placement="outset" className="translate-x-[22%] translate-y-[6%]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="text-sm font-medium truncate text-foreground hover:underline text-left"
                        onClick={() => {
                          if (!agentSlug) return
                          router.push(`/ship/${slug}/agent/${encodeURIComponent(agentSlug)}`)
                        }}
                        title={formatAgentDisplayName(a) || agentSlug}
                        disabled={!agentSlug}
                      >
                        {formatAgentDisplayName(a) || 'Untitled agent'}
                      </button>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      {a?.description ? <span className="truncate">{String(a.description)}</span> : null}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 self-center">
                <Button
                  size="sm"
                  variant="ghost"
                  className={CTA_BUTTON_CLASS}
                  onClick={() => {
                    if (!agentSlug) return
                    router.push(`/ship/${slug}/agent/${encodeURIComponent(agentSlug)}`)
                  }}
                  disabled={!agentSlug}
                >
                  <Icon name="chevron-right" className={CTA_ICON_CLASS} />
                  Open
                </Button>
              </div>
            </div>
          )
        })}
        {agentsQuery.hasNextPage ? (
          <div className="flex justify-center pt-4">
            <Button size="sm" variant="outline" onClick={() => agentsQuery.fetchNextPage()} disabled={agentsQuery.isFetchingNextPage} className={LOAD_MORE_BUTTON_CLASS}>
              {agentsQuery.isFetchingNextPage ? 'Loading…' : 'Load more agents'}
            </Button>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="relative flex flex-col min-h-full min-w-0">
      <div className="sticky top-0 z-10 border-b border-border/60 bg-card">
        <div className="px-4 pt-3.5 pb-2 md:py-2">
          <div className="w-full">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                <div className="flex min-w-0 w-full gap-2 items-center">
                  <span className="flex-shrink-0 self-center md:hidden">
                    <MobileNavToggleButton className="mx-2" />
                  </span>
                  <div className="min-w-0 flex-1 flex flex-col justify-center gap-1">
                    <div className="flex items-baseline gap-2 min-w-0 w-full">
                      <span aria-hidden="true" className="flex-shrink-0 self-center text-foreground leading-none">
                        <Icon name="bot" weight="bold" className="h-4 w-4" />
                      </span>
                      <h3 className="flex-1 text-base font-medium text-foreground truncate leading-tight min-w-0">Agents</h3>
                    </div>
                    <div className="min-w-0 text-xs leading-snug text-muted-foreground min-h-6">
                      <span className="block min-w-0 truncate font-medium leading-snug text-muted-foreground" title="Agents installed in this starship.">
                        Agents installed in this starship.
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-visible md:overflow-y-auto px-4 pt-6 pb-8 md:pb-8">
        <div className={cn('w-full bg-transparent max-w-4xl mx-auto min-h-full flex flex-col')}>
          <div className="pt-4 pb-8 hidden md:block">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex justify-start" />
              <div className="w-full sm:w-64">
                <div className="relative">
                  <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4 z-10 pointer-events-none" />
                  <Input
                    value={searchValue}
                    onChange={e => setSearchValue(e.target.value)}
                    placeholder="Search agents"
                    className="pl-9 h-9 py-1.5 text-[13px] rounded-2xl border-border/60 bg-card shadow-sm"
                    aria-label="Search agents"
                  />
                </div>
              </div>
            </div>
          </div>

          {renderList()}
        </div>
      </div>
    </div>
  )
}
