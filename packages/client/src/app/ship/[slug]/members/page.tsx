'use client'

import Icon from '@/components/primitives/Icon'
import AgentAvatar from '@/components/animated/AgentAvatar'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PresenceIndicator } from '@/components/ui/PresenceIndicator'
import { useMessageAttachments } from '@/hooks/useFileUpload'
import type { StarshipMemberListItem, StarshipMembersAndInvitesPage } from '@/hooks/useStarshipMembers'
import { useInfiniteStarshipMembers } from '@/hooks/useStarshipMembers'
import { useInfiniteStarshipAgents } from '@/hooks/useAgents'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { useStarshipPresence } from '@/hooks/useStarshipPresence'
import { useAuth } from '@/hooks/useAuth'
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
  return { primary }
}

function getAgentMarketplaceStatus(a: AgentWithAvatar): { label: string; className: string } {
  const fromMarketplace = typeof a.sourceTemplateId === 'string' && a.sourceTemplateId.trim().length > 0
  if (fromMarketplace) return { label: 'Deployed from Marketplace', className: 'text-muted-foreground' }

  const status = a.publicationStatus
  if (status === 'published') return { label: 'Published to Marketplace', className: 'text-muted-foreground' }
  if (status === 'pending_approval') return { label: 'Publish pending', className: 'text-muted-foreground' }
  if (status === 'rejected') return { label: 'Publish rejected', className: 'text-destructive' }
  return { label: 'Private', className: 'text-muted-foreground' }
}

function getCategoryMeta(category?: string): { label: string; className: string } | null {
  const raw = typeof category === 'string' ? category.trim().toLowerCase() : ''
  if (!raw) return null

  if (raw === 'coding') return { label: 'Coding', className: 'text-muted-foreground' }
  if (raw === 'creative') return { label: 'Creative', className: 'text-muted-foreground' }
  if (raw === 'analysis') return { label: 'Analysis', className: 'text-muted-foreground' }
  if (raw === 'support') return { label: 'Support', className: 'text-muted-foreground' }
  if (raw === 'general') return { label: 'General', className: 'text-muted-foreground' }

  // Fallback for other categories (utility, data, communication, automation, etc.)
  const label = raw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  return { label, className: 'text-muted-foreground' }
}

export default function MembersPage() {
  const { slug: slugParam } = useParams<{ slug: string }>()
  const slug = typeof slugParam === 'string' ? slugParam : ''
  const { user, isInstanceAdmin } = useAuth()
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

  const starshipIdStr = starshipId ? String(starshipId) : null

  const presence = useStarshipPresence(starshipIdStr ?? '', Boolean(starshipIdStr))

  const visibleAgentAvatarAttachmentIds = useMemo(() => {
    if (!starshipIdStr) return []
    if (filter === 'humans') return []
    const ids = new Set<string>()
    for (const a of filteredAgents) {
      const id = typeof a.avatarAttachmentId === 'string' ? a.avatarAttachmentId.trim() : ''
      if (id) ids.add(id)
    }
    return Array.from(ids)
  }, [filteredAgents, filter, starshipIdStr])

  const { data: agentAvatarAttachments = [] } = useMessageAttachments(visibleAgentAvatarAttachmentIds, starshipIdStr ?? undefined)

  const agentAvatarUrlByAttachmentId = useMemo(() => {
    const map = new Map<string, string>()
    for (const att of agentAvatarAttachments) {
      const id = typeof att?.id === 'string' ? att.id.trim() : ''
      const url = typeof att?.previewUrl === 'string' ? att.previewUrl.trim() : ''
      if (id && url) map.set(id, url)
    }
    return map
  }, [agentAvatarAttachments])

  const renderHumanRow = (m: StarshipMemberListItem) => {
    const label = getUserLabel(m)
    const userId = typeof m.userId === 'string' ? m.userId.trim() : ''
    const isOnline = presence.isUserOnline(userId)
    const href = slug && userId ? `/ship/${encodeURIComponent(slug)}/dm/${encodeURIComponent(`u-${userId}`)}` : slug ? `/ship/${encodeURIComponent(slug)}` : '/'
    const avatarUrlRaw = typeof m.avatar === 'string' ? m.avatar.trim() : ''
    const avatarUrl = isImageUrl(avatarUrlRaw) ? avatarUrlRaw : null
    const presenceText = isOnline ? 'Online' : 'Offline'
    return (
      <div key={userId || `${label.primary}-${label.secondary || ''}`} className={cn('rounded-lg border border-border/60 bg-card px-4 py-3 flex items-start justify-between gap-3')}>
        <Link href={href} className={cn('min-w-0 flex-1 group outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md')} aria-label={label.primary}>
          <div className="flex items-start gap-3">
            <div className="relative mt-0.5 h-10 w-10 flex-shrink-0">
              <span className={cn('flex h-10 w-10 items-center justify-center rounded-full ring-1 ring-border/50 bg-muted/10 overflow-hidden')}>
                <AgentAvatar
                  seed={label.primary}
                  imageUrl={avatarUrl}
                  fill
                  instanceId={userId ? `member-u-${userId}` : `member-u-${label.primary}`}
                  rounded
                />
              </span>
              <PresenceIndicator
                kind={isOnline ? 'online' : 'offline'}
                active={true}
                size="sm"
                placement="outset"
                // Slightly more down/right for 40px avatar.
                className="translate-x-[22%] translate-y-[6%]"
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={cn('text-sm font-medium truncate text-foreground')}>{label.primary}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className={cn('truncate', isOnline ? 'text-emerald-600 dark:text-emerald-400' : undefined)}>{presenceText}</span>
                {label.secondary ? <span aria-hidden="true">·</span> : null}
                {label.secondary ? <span className="truncate">{label.secondary}</span> : null}
              </div>
            </div>
          </div>
        </Link>
      </div>
    )
  }

  const renderAgentRow = (a: AgentWithAvatar) => {
    const label = getAgentLabel(a)
    const status = getAgentMarketplaceStatus(a)
    const categoryMeta = getCategoryMeta(a.category)
    const agentSlug = typeof a.slug === 'string' ? a.slug.trim() : ''
    const href = slug && agentSlug ? `/ship/${encodeURIComponent(slug)}/agent/${encodeURIComponent(agentSlug)}` : slug ? `/ship/${encodeURIComponent(slug)}/agents` : '/'
    const key = a.id || agentSlug || label.primary
    const avatarAttachmentId = typeof a.avatarAttachmentId === 'string' ? a.avatarAttachmentId.trim() : ''
    const avatarUrl = avatarAttachmentId ? agentAvatarUrlByAttachmentId.get(avatarAttachmentId) ?? null : null
    return (
      <div key={key} className={cn('rounded-lg border border-border/60 bg-card px-4 py-3 flex items-start justify-between gap-3')}>
        <Link href={href} className={cn('min-w-0 flex-1 group outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md')} aria-label={label.primary}>
          <div className="flex items-start gap-3">
            <div className="relative mt-0.5 h-10 w-10 flex-shrink-0">
              <span className={cn('flex h-10 w-10 items-center justify-center rounded-full ring-1 ring-border/50 bg-muted/10 overflow-hidden')}>
                <AgentAvatar
                  seed={label.primary}
                  imageUrl={avatarUrl}
                  fill
                  instanceId={a.id ? `member-a-${a.id}` : `member-a-${label.primary}`}
                  rounded
                />
              </span>
              <PresenceIndicator kind="online" active={true} size="sm" placement="outset" className="translate-x-[22%] translate-y-[6%]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={cn('text-sm font-medium truncate text-foreground')}>{label.primary}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className="truncate text-emerald-600 dark:text-emerald-400">Online</span>
                <span aria-hidden="true">·</span>
                {categoryMeta ? (
                  <span className={cn('inline-flex items-center gap-1', categoryMeta.className)} aria-label={`Category: ${categoryMeta.label}`} title={`Category: ${categoryMeta.label}`}>
                    <span>{categoryMeta.label}</span>
                  </span>
                ) : null}
                {categoryMeta ? <span aria-hidden="true">·</span> : null}
                <span className={cn('inline-flex items-center gap-1', status.className)} aria-label={status.label} title={status.label}>
                  <span>{status.label}</span>
                </span>
              </div>
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

  const canInviteUsers = Boolean(starship?.id && (isInstanceAdmin === true || (user?.id && starship?.ownerId && String(starship.ownerId) === String(user.id))))

  const isFilterValue = (value: string): value is Filter => value === 'all' || value === 'humans' || value === 'agents'

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

            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-6" style={{ paddingBottom: 32 }}>
        <div className={cn('w-full bg-transparent max-w-4xl mx-auto min-h-full flex flex-col')}>
          <div className="pb-8">
            <Tabs
              value={filter}
              onValueChange={value => {
                if (isFilterValue(value)) setFilter(value)
              }}
            >
              <div className="flex justify-start">
                <TabsList className="w-full sm:w-auto flex-wrap justify-start gap-1">
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="humans">Humans</TabsTrigger>
                  <TabsTrigger value="agents">Agents</TabsTrigger>
                </TabsList>
              </div>
            </Tabs>
          </div>

          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : filteredHumans.length === 0 && filteredAgents.length === 0 ? (
            <div className="text-sm text-muted-foreground">No members found.</div>
          ) : (
            <div className="space-y-10">
              {filteredHumans.length > 0 ? (
                <div>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex items-baseline gap-3">
                      <h3 className="text-lg font-semibold leading-tight text-foreground">Humans</h3>
                      <span className="text-sm text-muted-foreground tabular-nums">{humansCount}</span>
                    </div>
                    {slug && canInviteUsers ? (
                      <Button asChild size="sm" variant="ghost" className="h-8 text-primary hover:text-primary">
                        <Link href={`/ship/${encodeURIComponent(slug)}/settings/my-starship`}>
                          <Icon name="user-plus" iconOverride={{ type: 'phosphor', component: 'UserPlus' }} className="h-4 w-4 mr-1.5" />
                          Invite user
                        </Link>
                      </Button>
                    ) : null}
                  </div>
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
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex items-baseline gap-3">
                      <h3 className="text-lg font-semibold leading-tight text-foreground">Agents</h3>
                      <span className="text-sm text-muted-foreground tabular-nums">{agentsCount}</span>
                    </div>
                    <Button asChild size="sm" variant="ghost" className="h-8 text-primary hover:text-primary">
                      <Link href="/marketplace">
                        <Icon name="store" iconOverride={{ type: 'phosphor', component: 'Storefront' }} className="h-4 w-4 mr-1.5" />
                        Explore agents
                      </Link>
                    </Button>
                  </div>
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

