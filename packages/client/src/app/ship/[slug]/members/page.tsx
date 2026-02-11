'use client'

import Icon from '@/components/primitives/Icon'
import AgentAvatar from '@/components/animated/AgentAvatar'
import { Button } from '@/components/ui/button'
import { useMessageAttachments } from '@/hooks/useFileUpload'
import { useStarshipMembersAndInvites } from '@/hooks/useStarshipMembers'
import { useStarshipBySlug, useStarshipAgents } from '@/hooks/useStarships'
import { formatAgentDisplayName } from '@/lib/agentDisplay'
import { isImageUrl } from '@/lib/isImageUrl'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useMemo, useState } from 'react'

type Filter = 'all' | 'humans' | 'agents'

function getUserLabel(m: any): { primary: string; secondary?: string } {
  const displayName = typeof m?.displayName === 'string' ? m.displayName.trim() : ''
  const email = typeof m?.email === 'string' ? m.email.trim() : ''
  const primary = displayName || email || 'Unknown member'
  const role = typeof m?.role === 'string' ? m.role.trim() : ''
  const secondaryParts = [role ? role[0]?.toUpperCase() + role.slice(1) : null, displayName && email ? email : null].filter(Boolean) as string[]
  return { primary, secondary: secondaryParts.length ? secondaryParts.join(' · ') : undefined }
}

function getAgentLabel(a: any): { primary: string; secondary?: string } {
  const primary = a ? formatAgentDisplayName(a) : 'Unknown agent'
  const category = typeof a?.category === 'string' ? a.category.trim() : ''
  const isPublic = typeof a?.isPublic === 'boolean' ? a.isPublic : null
  const secondaryParts = [category ? category[0]?.toUpperCase() + category.slice(1) : null, isPublic === true ? 'Public' : isPublic === false ? 'Private' : null].filter(Boolean) as string[]
  return { primary, secondary: secondaryParts.length ? secondaryParts.join(' · ') : undefined }
}

export default function MembersPage() {
  const params = useParams()
  const slug = typeof (params as any)?.slug === 'string' ? String((params as any).slug) : ''
  const { data: starship } = useStarshipBySlug(slug, Boolean(slug))
  const starshipId = starship?.id ?? null

  const [filter, setFilter] = useState<Filter>('all')

  const { data: membersData, isLoading: membersLoading } = useStarshipMembersAndInvites(String(starshipId || ''), Boolean(starshipId))
  const { data: agentsData, isLoading: agentsLoading } = useStarshipAgents(String(starshipId || ''), Boolean(starshipId))

  const humans = useMemo(() => {
    const list = (membersData as any)?.members
    return Array.isArray(list) ? list : []
  }, [membersData])

  const agents = useMemo(() => (Array.isArray(agentsData) ? agentsData : []), [agentsData])

  const agentAvatarAttachmentIds = useMemo(() => {
    const ids = new Set<string>()
    for (const a of agents) {
      const id = typeof (a as any)?.avatarAttachmentId === 'string' ? String((a as any).avatarAttachmentId).trim() : ''
      if (id) ids.add(id)
    }
    return Array.from(ids)
  }, [agents])

  const { data: agentAvatarAttachments = [] } = useMessageAttachments(agentAvatarAttachmentIds, starshipId ? String(starshipId) : undefined)

  const agentAvatarUrlByAttachmentId = useMemo(() => {
    const map = new Map<string, string>()
    for (const att of agentAvatarAttachments as any[]) {
      const id = typeof att?.id === 'string' ? att.id.trim() : ''
      const previewUrl = typeof att?.previewUrl === 'string' ? att.previewUrl.trim() : ''
      if (id && previewUrl) map.set(id, previewUrl)
    }
    return map
  }, [agentAvatarAttachments])

  const filteredHumans = useMemo(() => {
    if (filter === 'agents') return []
    return humans
  }, [humans, filter])

  const filteredAgents = useMemo(() => {
    if (filter === 'humans') return []
    return agents
  }, [agents, filter])

  const renderHumanRow = (m: any) => {
    const label = getUserLabel(m)
    const userId = typeof m?.userId === 'string' ? m.userId.trim() : ''
    const href = slug && userId ? `/ship/${encodeURIComponent(slug)}/dm/${encodeURIComponent(`u-${userId}`)}` : slug ? `/ship/${encodeURIComponent(slug)}` : '/'
    const avatarUrlRaw = typeof m?.avatar === 'string' ? m.avatar.trim() : ''
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

  const renderAgentRow = (a: any) => {
    const label = getAgentLabel(a)
    const agentSlug = typeof a?.slug === 'string' ? a.slug.trim() : ''
    const href = slug && agentSlug ? `/ship/${encodeURIComponent(slug)}/agent/${encodeURIComponent(agentSlug)}` : slug ? `/ship/${encodeURIComponent(slug)}/agents` : '/'
    const key = typeof a?.id === 'string' ? a.id : agentSlug || label.primary
    const avatarAttachmentId = typeof (a as any)?.avatarAttachmentId === 'string' ? String((a as any).avatarAttachmentId).trim() : ''
    const avatarUrl = avatarAttachmentId ? agentAvatarUrlByAttachmentId.get(avatarAttachmentId) ?? null : null
    return (
      <div key={key} className={cn('rounded-lg border border-border/60 bg-card px-4 py-3 flex items-start justify-between gap-3')}>
        <Link href={href} className={cn('min-w-0 flex-1 group outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md')} aria-label={label.primary}>
          <div className="flex items-start gap-3">
            <span className={cn('mt-0.5 flex h-10 w-10 items-center justify-center rounded-full ring-1 ring-border/50 bg-muted/10 overflow-hidden')}>
              <AgentAvatar
                seed={label.primary}
                imageUrl={avatarUrl}
                fill
                instanceId={typeof (a as any)?.id === 'string' ? `member-a-${String((a as any).id)}` : `member-a-${label.primary}`}
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

  const isLoading = Boolean(membersLoading || agentsLoading)
  const humansCount = humans.length
  const agentsCount = agents.length
  const totalCount = humansCount + agentsCount

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
                </div>
              ) : null}

              {filteredAgents.length > 0 ? (
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agents</div>
                  <div className="space-y-2">{filteredAgents.map(renderAgentRow)}</div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

