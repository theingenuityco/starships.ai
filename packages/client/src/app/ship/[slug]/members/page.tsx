'use client'

import Icon from '@/components/primitives/Icon'
import AgentAvatar from '@/components/animated/AgentAvatar'
import { Button } from '@/components/ui/button'
import { getAttachmentPreviewUrl } from '@/hooks/useFileUpload'
import type { StarshipMemberListItem, StarshipMembersAndInvitesPage } from '@/hooks/useStarshipMembers'
import { useInfiniteStarshipMembers } from '@/hooks/useStarshipMembers'
import { useInfiniteStarshipAgents } from '@/hooks/useAgents'
import { useStarshipBySlug } from '@/hooks/useStarships'
import type { AgentModel } from '@starships/protocol'
import { formatAgentDisplayName } from '@/lib/agentDisplay'
import { isImageUrl } from '@/lib/isImageUrl'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useMemo, useState } from 'react'

type Filter = 'all' | 'humans' | 'agents'

type AgentWithAvatar = AgentModel & { avatarAttachmentId?: string | null }

function getUserLabel(m: StarshipMemberListItem): { primary: string; secondary?: string } {
  const displayName = typeof m.displayName === 'string' ? m.displayName.trim() : ''
  const email = typeof m.email === 'string' ? m.email.trim() : ''
  const primary = displayName || email || 'Unknown member'
  const role = typeof m.role === 'string' ? m.role.trim() : ''
  const secondaryParts = [role ? role[0]?.toUpperCase() + role.slice(1) : null, displayName && email ? email : null].filter(Boolean) as string[]
  return { primary, secondary: secondaryParts.length ? secondaryParts.join(' · ') : undefined }
}

function getAgentLabel(a: AgentWithAvatar): { primary: string; secondary?: string } {
  const primary = formatAgentDisplayName(a)
  const category = typeof a.category === 'string' ? a.category.trim() : ''
  const isPublic = typeof a.isPublic === 'boolean' ? a.isPublic : null
  const secondaryParts = [category ? category[0]?.toUpperCase() + category.slice(1) : null, isPublic === true ? 'Public' : isPublic === false ? 'Private' : null].filter(Boolean) as string[]
  return { primary, secondary: secondaryParts.length ? secondaryParts.join(' · ') : undefined }
}

export default function MembersPage() {
  const { slug: slugParam } = useParams<{ slug: string }>()
  const slug = typeof slugParam === 'string' ? slugParam : ''
  const { data: starship } = useStarshipBySlug(slug, Boolean(slug))
  const starshipId = starship?.id ?? null

  const [filter, setFilter] = useState<Filter>('all')

  const humansQuery = useInfiniteStarshipMembers(String(starshipId || ''), Boolean(starshipId), { limit: 50 })
  const agentsQuery = useInfiniteStarshipAgents(String(starshipId || ''), Boolean(starshipId), { limit: 50, order: 'ASC' })

  const humans = useMemo(() => {
    const pages: StarshipMembersAndInvitesPage[] = humansQuery.data?.pages ?? []
    return pages.flatMap(p => p.members)
  }, [humansQuery.data])

  const agents = useMemo(() => {
    const pages = agentsQuery.data?.pages ?? []
    return pages.flatMap(p => p.agents) as AgentWithAvatar[]
  }, [agentsQuery.data])

  const filteredHumans = useMemo(() => {
    if (filter === 'agents') return []
    return humans
  }, [humans, filter])

  const filteredAgents = useMemo(() => {
    if (filter === 'humans') return []
    return agents
  }, [agents, filter])

  const renderHumanRow = (m: StarshipMemberListItem) => {
    const label = getUserLabel(m)
    const userId = typeof m.userId === 'string' ? m.userId.trim() : ''
    const href = slug && userId ? `/ship/${encodeURIComponent(slug)}/dm/${encodeURIComponent(`u-${userId}`)}` : slug ? `/ship/${encodeURIComponent(slug)}` : '/'
    const avatarUrlRaw = typeof m.avatar === 'string' ? m.avatar.trim() : ''
    const avatarUrl = isImageUrl(avatarUrlRaw) ? avatarUrlRaw : null
    return (
      <div key={userId || `${label.primary}-${label.secondary || ''}`} className={cn('rounded-lg border border-border/60 bg-card px-4 py-3 flex items-start justify-between gap-3')}>
        <Link href={href} className={cn('min-w-0 flex-1 group outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md')} aria-label={label.primary}>
          <div className="flex items-start gap-3">
            <span className={cn('mt-0.5 flex h-10 w-10 items-center justify-center rounded-full ring-1 ring-border/50 bg-muted/10 overflow-hidden')}>
              <AgentAvatar
                seed={label.primary}
                imageUrl={avatarUrl}
                fill
                instanceId={userId ? `member-u-${userId}` : `member-u-${label.primary}`}
                rounded
              />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={cn('text-sm font-medium truncate text-foreground')}>{label.primary}</span>
              </div>
              {label.secondary ? (
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span className="truncate">{label.secondary}</span>
                </div>
              ) : null}
            </div>
          </div>
        </Link>
      </div>
    )
  }

  const renderAgentRow = (a: AgentWithAvatar) => {
    const label = getAgentLabel(a)
    const agentSlug = typeof a.slug === 'string' ? a.slug.trim() : ''
    const href = slug && agentSlug ? `/ship/${encodeURIComponent(slug)}/agent/${encodeURIComponent(agentSlug)}` : slug ? `/ship/${encodeURIComponent(slug)}/agents` : '/'
    const key = a.id || agentSlug || label.primary
    const avatarAttachmentId = typeof a.avatarAttachmentId === 'string' ? a.avatarAttachmentId.trim() : ''
    const avatarUrl = avatarAttachmentId && starshipId ? getAttachmentPreviewUrl(avatarAttachmentId, String(starshipId)) : null
    return (
      <div key={key} className={cn('rounded-lg border border-border/60 bg-card px-4 py-3 flex items-start justify-between gap-3')}>
        <Link href={href} className={cn('min-w-0 flex-1 group outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md')} aria-label={label.primary}>
          <div className="flex items-start gap-3">
            <span className={cn('mt-0.5 flex h-10 w-10 items-center justify-center rounded-full ring-1 ring-border/50 bg-muted/10 overflow-hidden')}>
              <AgentAvatar
                seed={label.primary}
                imageUrl={avatarUrl}
                fill
                instanceId={a.id ? `member-a-${a.id}` : `member-a-${label.primary}`}
                rounded
              />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={cn('text-sm font-medium truncate text-foreground')}>{label.primary}</span>
              </div>
              {label.secondary ? (
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span className="truncate">{label.secondary}</span>
                </div>
              ) : null}
            </div>
          </div>
        </Link>
      </div>
    )
  }

  const isLoading = Boolean(humansQuery.isLoading || agentsQuery.isLoading)
  const humansCount = humans.length
  const agentsCount = agents.length
  const totalCount = humansCount + agentsCount

  const canLoadMoreHumans = Boolean(humansQuery.hasNextPage)
  const canLoadMoreAgents = Boolean(agentsQuery.hasNextPage)
  const isLoadingMoreHumans = Boolean(humansQuery.isFetchingNextPage)
  const isLoadingMoreAgents = Boolean(agentsQuery.isFetchingNextPage)

  return (
    <div className="relative flex flex-col h-full min-w-0">
      <div className="sticky top-0 z-10 border-b border-border/60 bg-card">
        <div className="px-4 pt-3.5 pb-3">
          <div className="w-full">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
                <div className="flex items-baseline gap-2 min-w-0 w-full">
                  <span aria-hidden="true" className="flex-shrink-0 self-center text-foreground leading-none">
                    <Icon name="users" weight="bold" className="h-5 w-5" />
                  </span>
                  <h3 className="flex-1 text-xl font-semibold text-foreground truncate tracking-tight leading-tight min-w-0">Members</h3>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs leading-none text-muted-foreground min-h-5">
                  <span className="font-medium leading-none">{totalCount ? `${totalCount} total` : isLoading ? 'Loading…' : 'No members yet'}</span>
                  {humansCount ? <span aria-label={`${humansCount} human members`}>{humansCount} humans</span> : null}
                  {agentsCount ? <span aria-label={`${agentsCount} agents`}>{agentsCount} agents</span> : null}
                </div>
              </div>

              {/* Keep header right side aligned like Notifications (even if currently empty). */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {slug ? (
                  <Button asChild size="sm" variant="secondary" className="h-8">
                    <Link href={`/ship/${encodeURIComponent(slug)}/settings/management`}>Manage</Link>
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-6" style={{ paddingBottom: 32 }}>
        <div className={cn('w-full bg-transparent max-w-4xl mx-auto min-h-full flex flex-col')}>
          <div className="flex flex-wrap items-center gap-2 pb-4">
            <Button size="sm" className="h-8" variant={filter === 'all' ? 'default' : 'secondary'} onClick={() => setFilter('all')}>
              All
            </Button>
            <Button size="sm" className="h-8" variant={filter === 'humans' ? 'default' : 'secondary'} onClick={() => setFilter('humans')}>
              Humans
            </Button>
            <Button size="sm" className="h-8" variant={filter === 'agents' ? 'default' : 'secondary'} onClick={() => setFilter('agents')}>
              Agents
            </Button>
          </div>

          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : filteredHumans.length === 0 && filteredAgents.length === 0 ? (
            <div className="text-sm text-muted-foreground">No members found.</div>
          ) : (
            <div className="space-y-6">
              {filteredHumans.length > 0 ? (
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Humans</div>
                  <div className="space-y-2">{filteredHumans.map(renderHumanRow)}</div>
                  {filter !== 'agents' && canLoadMoreHumans ? (
                    <div className="flex justify-center pt-4">
                      <Button variant="secondary" onClick={() => humansQuery.fetchNextPage()} disabled={isLoadingMoreHumans} className="h-8">
                        {isLoadingMoreHumans ? 'Loading…' : 'Load more humans'}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {filteredAgents.length > 0 ? (
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agents</div>
                  <div className="space-y-2">{filteredAgents.map(renderAgentRow)}</div>
                  {filter !== 'humans' && canLoadMoreAgents ? (
                    <div className="flex justify-center pt-4">
                      <Button variant="secondary" onClick={() => agentsQuery.fetchNextPage()} disabled={isLoadingMoreAgents} className="h-8">
                        {isLoadingMoreAgents ? 'Loading…' : 'Load more agents'}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

