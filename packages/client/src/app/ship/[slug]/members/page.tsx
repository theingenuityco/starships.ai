'use client'

import Icon from '@/components/primitives/Icon'
import AgentAvatar from '@/components/animated/AgentAvatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PresenceIndicator } from '@/components/ui/PresenceIndicator'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { HoverProfilePopover } from '@/components/conversation/HoverProfilePopover'
import { AgentProfileHoverCardContent, UserProfileHoverCardContent } from '@/components/conversation/ProfileHoverCardContent'
import { useMessageAttachments } from '@/hooks/useFileUpload'
import type { StarshipInviteListItem, StarshipMemberListItem, StarshipMembersAndInvitesPage } from '@/hooks/useStarshipMembers'
import { STARSHIP_MEMBERS_QUERY_KEYS, useInfiniteStarshipMembers, useRemoveStarshipMember, useRevokeStarshipInvite } from '@/hooks/useStarshipMembers'
import { useCreateStarshipInvite } from '@/hooks/useStarshipInvites'
import { useInfiniteStarshipAgents } from '@/hooks/useAgents'
import { useDeleteAgent, useDeleteAgentWithUnusedTools, useUnpublishAgent } from '@/hooks/useAgents'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { useStarshipPresence } from '@/hooks/useStarshipPresence'
import { useAuth } from '@/hooks/useAuth'
import type { AgentModel } from '@starships/protocol'
import { useQueryClient } from '@tanstack/react-query'
import { formatAgentDisplayName } from '@/lib/agentDisplay'
import { isImageUrl } from '@/lib/isImageUrl'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

type Filter = 'all' | 'humans' | 'agents'

type AgentWithAvatar = AgentModel & { avatarAttachmentId?: string | null }

const SKELETON_CARD_COUNT = 2

function initialsFromName(name?: string | null): string {
  if (!name || typeof name !== 'string') return 'U'
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2)
  if (parts.length === 0) return 'U'
  return (
    parts
      .map(p => p[0]?.toUpperCase())
      .filter(Boolean)
      .join('') || 'U'
  )
}

function formatMemberRoleLabel(role?: string | null): string {
  const r = typeof role === 'string' ? role.trim().toLowerCase() : ''
  if (!r) return ''
  if (r === 'owner') return 'Owner'
  if (r === 'admin') return 'Admin'
  if (r === 'collaborator') return 'Collaborator'
  return r.replace(/\b\w/g, c => c.toUpperCase())
}

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
  const queryClient = useQueryClient()
  const { data: starship } = useStarshipBySlug(slug, Boolean(slug))
  const starshipId = starship?.id ?? null
  const starshipIdStr = starshipId ? String(starshipId) : null

  const [filter, setFilter] = useState<Filter>('all')
  const [searchText, setSearchText] = useState<string>('')
  const [debouncedSearch, setDebouncedSearch] = useState<string>('')

  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null)

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedSearch(searchText.trim())
    }, 250)
    return () => window.clearTimeout(handle)
  }, [searchText])

  useEffect(() => {
    if (!inviteOpen) return
    setLastInviteUrl(null)
  }, [inviteOpen])

  const humansQuery = useInfiniteStarshipMembers(String(starshipId || ''), Boolean(starshipId), { limit: 50, search: debouncedSearch })
  const agentsQuery = useInfiniteStarshipAgents(String(starshipId || ''), Boolean(starshipId), { limit: 50, order: 'ASC', search: debouncedSearch })

  const humans = useMemo(() => {
    const pages: StarshipMembersAndInvitesPage[] = humansQuery.data?.pages ?? []
    return pages.flatMap(p => p.members)
  }, [humansQuery.data])

  const invites = useMemo(() => {
    const pages: StarshipMembersAndInvitesPage[] = humansQuery.data?.pages ?? []
    return pages.flatMap(p => p.invites)
  }, [humansQuery.data])

  const agents = useMemo(() => {
    const pages = agentsQuery.data?.pages ?? []
    return pages.flatMap(p => p.agents) as AgentWithAvatar[]
  }, [agentsQuery.data])

  const filteredHumans = useMemo(() => {
    if (filter === 'agents') return []
    return humans
  }, [humans, filter])

  const filteredInvites = useMemo(() => {
    if (filter === 'agents') return []
    return invites
  }, [invites, filter])

  const filteredAgents = useMemo(() => {
    if (filter === 'humans') return []
    return agents
  }, [agents, filter])

  const presence = useStarshipPresence(starshipIdStr ?? '', Boolean(starshipIdStr))
  const removeMember = useRemoveStarshipMember(starshipIdStr ?? '')
  const revokeInvite = useRevokeStarshipInvite(starshipIdStr ?? '')
  const createInvite = useCreateStarshipInvite(starshipIdStr ?? '')
  const deleteAgent = useDeleteAgent()
  const deleteAgentWithUnusedTools = useDeleteAgentWithUnusedTools()
  const unpublishAgent = useUnpublishAgent()

  const [confirmAction, setConfirmAction] = useState<
    | { kind: 'kickHuman'; userId: string; label: string }
    | { kind: 'kickAgent'; agentId: string; label: string }
    | { kind: 'revokeInvite'; email: string; label: string }
    | { kind: 'deleteAgent'; agentId: string; label: string }
    | { kind: 'unpublishAgent'; agentId: string; label: string }
    | null
  >(null)

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
    const avatarUrlRaw = typeof m.avatar === 'string' ? m.avatar.trim() : ''
    const avatarUrl = isImageUrl(avatarUrlRaw) ? avatarUrlRaw : null
    const presenceText = isOnline ? 'Online' : 'Offline'
    const isAuthedUser = Boolean(user?.id && userId && String(user.id) === String(userId))
    const displayName = typeof m.displayName === 'string' ? m.displayName.trim() : ''
    const email = typeof m.email === 'string' ? m.email.trim() : ''
    const userHoverTitle = isAuthedUser ? 'You' : label.primary
    const userHoverSub = isAuthedUser ? (displayName || email || '') : email && email !== label.primary ? email : ''
    const userHoverCard = (
      <UserProfileHoverCardContent
        title={userHoverTitle}
        subtitle={userHoverSub || undefined}
        isAuthedUser={isAuthedUser}
        explicitAvatarUrl={avatarUrl || undefined}
        resolvedAvatarUrl={undefined}
        avatarSeed={label.primary || undefined}
        fallbackInitials={initialsFromName(userHoverTitle || email || displayName || label.primary)}
        fallbackVariant="initials"
        userIdShort={userId ? `#${userId.slice(0, 6)}` : undefined}
        email={email || undefined}
        roleLabel={formatMemberRoleLabel(m.role) || undefined}
        memberSince={m.createdAt || undefined}
        statusLabel={presenceText}
      />
    )
    const chatHref = !isAuthedUser && slug && userId ? `/ship/${encodeURIComponent(slug)}/dm/${encodeURIComponent(`u-${userId}`)}` : null
    const canKick = Boolean(!isAuthedUser && m.role !== 'owner' && userId)
    return (
      <div key={userId || `${label.primary}-${label.secondary || ''}`} className={cn('rounded-lg border border-border/60 bg-card px-4 py-3 flex items-start justify-between gap-3')}>
        <div className={cn('min-w-0 flex-1')} aria-label={label.primary}>
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
                <HoverProfilePopover
                  trigger={
                    <button
                      type="button"
                      className={cn('block max-w-full truncate text-left text-sm font-medium text-foreground hover:underline underline-offset-2')}
                    >
                      {label.primary}
                    </button>
                  }
                  content={userHoverCard}
                  side="right"
                />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className={cn('truncate', isOnline ? 'text-emerald-600 dark:text-emerald-400' : undefined)}>{presenceText}</span>
                {label.secondary ? <span aria-hidden="true">·</span> : null}
                {label.secondary ? <span className="truncate">{label.secondary}</span> : null}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 self-center">
          {chatHref ? (
            <Button asChild size="sm" variant="ghost" className="h-8 text-muted-foreground hover:bg-accent/80 hover:text-foreground">
              <Link href={chatHref} className="inline-flex items-center gap-1.5">
                <Icon name="message-square" className="h-4 w-4" />
                Chat
              </Link>
            </Button>
          ) : null}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 text-muted-foreground hover:bg-accent/80 hover:text-foreground"
                aria-label="More options"
              >
                <Icon name="dots-vertical" className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {canKick ? (
                <DropdownMenuItem
                  onClick={() => setConfirmAction({ kind: 'kickHuman', userId, label: label.primary })}
                  className="flex items-center gap-2 cursor-pointer hover:bg-destructive/10 focus:bg-destructive/10 text-destructive focus:text-destructive"
                >
                  <Icon name="x-circle" className="h-4 w-4" />
                  Kick
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem disabled className="text-muted-foreground">
                  No actions
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    )
  }

  const renderInviteRow = (inv: StarshipInviteListItem) => {
    const emailRaw = typeof inv.invitedEmail === 'string' ? inv.invitedEmail.trim() : ''
    const roleRaw = typeof inv.role === 'string' ? inv.role.trim() : ''
    const roleLabel = roleRaw ? roleRaw[0]?.toUpperCase() + roleRaw.slice(1) : ''
    const key = emailRaw ? `invite-${emailRaw}` : `invite-${inv.createdAt}`
    const primary = emailRaw || 'Invited member'
    const canRevoke = Boolean(canInviteUsers && emailRaw)
    return (
      <div key={key} className={cn('rounded-lg border border-border/60 bg-card px-4 py-3 flex items-start justify-between gap-3')}>
        <div className={cn('min-w-0 flex-1 outline-none rounded-md')} aria-label={primary}>
          <div className="flex items-start gap-3">
            <div className="relative mt-0.5 h-10 w-10 flex-shrink-0">
              <span className={cn('flex h-10 w-10 items-center justify-center rounded-full ring-1 ring-border/50 bg-muted/10 overflow-hidden')}>
                <AgentAvatar seed={primary} imageUrl={null} fill instanceId={key} rounded />
              </span>
              <PresenceIndicator kind="offline" active={true} size="sm" placement="outset" className="translate-x-[22%] translate-y-[6%]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={cn('text-sm font-medium truncate text-foreground')}>{primary}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className="truncate">Invited</span>
                {roleLabel ? <span aria-hidden="true">·</span> : null}
                {roleLabel ? <span className="truncate">{roleLabel}</span> : null}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 self-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 text-muted-foreground hover:bg-accent/80 hover:text-foreground"
                aria-label="More options"
              >
                <Icon name="dots-vertical" className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {canRevoke ? (
                <DropdownMenuItem
                  onClick={() => setConfirmAction({ kind: 'revokeInvite', email: emailRaw, label: primary })}
                  className="flex items-center gap-2 cursor-pointer hover:bg-destructive/10 focus:bg-destructive/10 text-destructive focus:text-destructive"
                >
                  <Icon name="x-circle" className="h-4 w-4" />
                  Revoke
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem disabled className="text-muted-foreground">
                  No actions
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    )
  }

  const renderAgentRow = (a: AgentWithAvatar) => {
    const label = getAgentLabel(a)
    const status = getAgentMarketplaceStatus(a)
    const categoryMeta = getCategoryMeta(a.category)
    const agentSlug = typeof a.slug === 'string' ? a.slug.trim() : ''
    const key = a.id || agentSlug || label.primary
    const avatarAttachmentId = typeof a.avatarAttachmentId === 'string' ? a.avatarAttachmentId.trim() : ''
    const avatarUrl = avatarAttachmentId ? agentAvatarUrlByAttachmentId.get(avatarAttachmentId) ?? null : null
    const toolsCount = Array.isArray((a as any)?.assignedToolSlugs) ? ((a as any).assignedToolSlugs as unknown[]).length : undefined
    const modelIdRaw = (a as any)?.model
    const modelId = typeof modelIdRaw === 'string' ? modelIdRaw : undefined
    const agentHoverCard = (
      <AgentProfileHoverCardContent
        name={label.primary || 'Assistant'}
        avatarUrl={avatarUrl || undefined}
        modelId={modelId}
        statusLabel="Available"
        roleLabel={typeof a.role === 'string' ? a.role : undefined}
        category={categoryMeta?.label || (typeof a.category === 'string' ? a.category : undefined)}
        version={typeof a.version === 'string' ? a.version : undefined}
        toolsCount={typeof toolsCount === 'number' ? toolsCount : undefined}
        createdAt={typeof a.createdAt === 'string' ? a.createdAt : undefined}
        updatedAt={typeof a.updatedAt === 'string' ? a.updatedAt : undefined}
      />
    )
    const detailsHref = slug && agentSlug ? `/ship/${encodeURIComponent(slug)}/agent/${encodeURIComponent(agentSlug)}` : null
    const dmPeerKey = agentSlug || (typeof a.id === 'string' && a.id.trim().length > 0 ? `a:${a.id.trim()}` : '')
    const chatHref = slug && dmPeerKey ? `/ship/${encodeURIComponent(slug)}/dm/${encodeURIComponent(dmPeerKey)}` : null
    const fromMarketplace = typeof a.sourceTemplateId === 'string' && a.sourceTemplateId.trim().length > 0
    const isPublished = a.publicationStatus === 'published'
    const canKickAgent = Boolean(fromMarketplace && a.id)
    const canUnpublish = Boolean(!fromMarketplace && isPublished && a.id)
    const canDelete = Boolean(!fromMarketplace && !isPublished && a.id)
    return (
      <div key={key} className={cn('rounded-lg border border-border/60 bg-card px-4 py-3 flex items-start justify-between gap-3')}>
        <div className={cn('min-w-0 flex-1')} aria-label={label.primary}>
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
                <HoverProfilePopover
                  trigger={
                    detailsHref ? (
                      <Link href={detailsHref} className={cn('block max-w-full truncate text-sm font-medium text-foreground hover:underline underline-offset-2')}>
                        {label.primary}
                      </Link>
                    ) : (
                      <span className={cn('block max-w-full truncate text-sm font-medium text-foreground')}>{label.primary}</span>
                    )
                  }
                  content={agentHoverCard}
                  side="right"
                />
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
        </div>

        <div className="flex items-center gap-1 self-center">
          {chatHref ? (
            <Button asChild size="sm" variant="ghost" className="h-8 text-muted-foreground hover:bg-accent/80 hover:text-foreground">
              <Link href={chatHref} className="inline-flex items-center gap-1.5">
                <Icon name="message-square" className="h-4 w-4" />
                Chat
              </Link>
            </Button>
          ) : null}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 text-muted-foreground hover:bg-accent/80 hover:text-foreground"
                aria-label="More options"
              >
                <Icon name="dots-vertical" className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {canKickAgent ? (
                <DropdownMenuItem
                  onClick={() => setConfirmAction({ kind: 'kickAgent', agentId: a.id, label: label.primary })}
                  className="flex items-center gap-2 cursor-pointer hover:bg-destructive/10 focus:bg-destructive/10 text-destructive focus:text-destructive"
                >
                  <Icon name="x-circle" className="h-4 w-4" />
                  Kick
                </DropdownMenuItem>
              ) : canUnpublish ? (
                <DropdownMenuItem
                  onClick={() => setConfirmAction({ kind: 'unpublishAgent', agentId: a.id, label: label.primary })}
                  className="flex items-center gap-2 cursor-pointer hover:bg-destructive/10 focus:bg-destructive/10 text-destructive focus:text-destructive"
                >
                  <Icon name="globe" className="h-4 w-4" />
                  Unpublish
                </DropdownMenuItem>
              ) : canDelete ? (
                <DropdownMenuItem
                  onClick={() => setConfirmAction({ kind: 'deleteAgent', agentId: a.id, label: label.primary })}
                  className="flex items-center gap-2 cursor-pointer hover:bg-destructive/10 focus:bg-destructive/10 text-destructive focus:text-destructive"
                >
                  <Icon name="trash" className="h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem disabled className="text-muted-foreground">
                  No actions
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    )
  }

  const isLoading = Boolean(humansQuery.isLoading || agentsQuery.isLoading)
  const humansCount = humans.length
  const invitesCount = invites.length
  const agentsCount = agents.length
  const totalCount = humansCount + agentsCount

  const canLoadMoreHumans = Boolean(humansQuery.hasNextPage)
  const canLoadMoreAgents = Boolean(agentsQuery.hasNextPage)
  const isLoadingMoreHumans = Boolean(humansQuery.isFetchingNextPage)
  const isLoadingMoreAgents = Boolean(agentsQuery.isFetchingNextPage)

  const canInviteUsers = Boolean(starship?.id && (isInstanceAdmin === true || (user?.id && starship?.ownerId && String(starship.ownerId) === String(user.id))))

  const isFilterValue = (value: string): value is Filter => value === 'all' || value === 'humans' || value === 'agents'
  const openInviteFlow = () => setInviteOpen(true)

  const renderMemberCardSkeleton = (key: string) => {
    return (
      <div key={key} className={cn('rounded-lg border border-border/60 bg-card px-4 py-3 flex items-start justify-between gap-3')}>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <div className="relative mt-0.5 h-10 w-10 flex-shrink-0">
              <Skeleton className="h-10 w-10 rounded-full" />
              {/* Presence dot placeholder to keep spacing stable */}
              <Skeleton className="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-40 max-w-[70%]" />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                <Skeleton className="h-3 w-14" />
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

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
          <div className="pt-4 pb-8">
            <Tabs
              value={filter}
              onValueChange={value => {
                if (isFilterValue(value)) setFilter(value)
              }}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex justify-start">
                  <TabsList className="w-full sm:w-auto flex-nowrap justify-start gap-1 overflow-x-auto custom-scrollbar">
                    <TabsTrigger value="all">All</TabsTrigger>
                    <TabsTrigger value="humans">Humans</TabsTrigger>
                    <TabsTrigger value="agents">Agents</TabsTrigger>
                  </TabsList>
                </div>
                <div className="w-full sm:w-64">
                  <div className="relative">
                    <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4 z-10 pointer-events-none" />
                    <Input
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      placeholder="Search members"
                      className="pl-9 h-9 py-1.5 text-[13px] rounded-2xl border-border/60 bg-card shadow-sm"
                      aria-label="Search members"
                    />
                  </div>
                </div>
              </div>
            </Tabs>
          </div>

          {isLoading ? (
            <div className="space-y-10">
              {filter !== 'agents' ? (
                <div>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex items-baseline gap-3">
                      <h3 className="text-lg font-semibold leading-tight text-foreground">Humans</h3>
                      <Skeleton className="h-4 w-8" />
                    </div>
                    {slug && canInviteUsers ? (
                      <Button type="button" size="sm" variant="ghost" className="h-8 text-primary hover:text-primary" onClick={openInviteFlow}>
                        <Icon name="user-plus" iconOverride={{ type: 'phosphor', component: 'UserPlus' }} className="h-4 w-4 mr-1.5" />
                        Invite user
                      </Button>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    {Array.from({ length: SKELETON_CARD_COUNT }, (_, i) => renderMemberCardSkeleton(`human-skel-${i}`))}
                  </div>
                </div>
              ) : null}

              {filter !== 'humans' ? (
                <div>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex items-baseline gap-3">
                      <h3 className="text-lg font-semibold leading-tight text-foreground">Agents</h3>
                      <Skeleton className="h-4 w-8" />
                    </div>
                    <Button asChild size="sm" variant="ghost" className="h-8 text-primary hover:text-primary">
                      <Link href="/marketplace">
                        <Icon name="store" iconOverride={{ type: 'phosphor', component: 'Storefront' }} className="h-4 w-4 mr-1.5" />
                        Explore agents
                      </Link>
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {Array.from({ length: SKELETON_CARD_COUNT }, (_, i) => renderMemberCardSkeleton(`agent-skel-${i}`))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : filteredHumans.length === 0 && filteredInvites.length === 0 && filteredAgents.length === 0 ? (
            <div className="text-sm text-muted-foreground">No members found.</div>
          ) : (
            <div className="space-y-10">
              {filteredHumans.length > 0 || filteredInvites.length > 0 ? (
                <div>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex items-baseline gap-3">
                      <h3 className="text-lg font-semibold leading-tight text-foreground">Humans</h3>
                      <span className="text-sm text-muted-foreground tabular-nums">{humansCount + invitesCount}</span>
                    </div>
                    {slug && canInviteUsers ? (
                      <Button type="button" size="sm" variant="ghost" className="h-8 text-primary hover:text-primary" onClick={openInviteFlow}>
                        <Icon name="user-plus" iconOverride={{ type: 'phosphor', component: 'UserPlus' }} className="h-4 w-4 mr-1.5" />
                        Invite user
                      </Button>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    {filteredHumans.map(renderHumanRow)}
                    {filteredInvites.map(renderInviteRow)}
                  </div>
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

      <Dialog
        open={inviteOpen}
        onOpenChange={open => {
          setInviteOpen(open)
          if (!open) setLastInviteUrl(null)
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Invite collaborator</DialogTitle>
            <DialogDescription>Send an invite link to a teammate.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="teammate@example.com"
                disabled={createInvite.isPending}
              />
            </div>
            {lastInviteUrl ? (
              <div className="max-w-full overflow-hidden rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-3 text-sm">
                <div className="flex items-start gap-2">
                  <Icon name="check-circle" className="h-4 w-4 text-emerald-700 dark:text-emerald-400 mt-0.5" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="font-medium text-emerald-800 dark:text-emerald-300">
                      We have sent them an invite. You can also use this invite link:
                    </p>
                    <div className="min-w-0 flex flex-col gap-2 sm:flex-row sm:items-center">
                      <code className="block min-w-0 flex-1 break-all rounded-md border border-border/60 bg-card/60 px-2 py-1 text-[12px]">
                        {lastInviteUrl}
                      </code>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-8"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(lastInviteUrl)
                          } catch {
                            // ignore
                          }
                        }}
                      >
                        Copy
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="ghost" onClick={() => setInviteOpen(false)} disabled={createInvite.isPending}>
              Close
            </Button>
            <Button
              type="button"
              disabled={!canInviteUsers || !starshipIdStr || !inviteEmail.trim() || createInvite.isPending}
              onClick={async () => {
                if (!starshipIdStr) return
                const email = inviteEmail.trim()
                if (!email) return
                const res = await createInvite.mutateAsync({ email })
                setLastInviteUrl(res.inviteUrl || null)
                queryClient.invalidateQueries({ queryKey: STARSHIP_MEMBERS_QUERY_KEYS.byStarship(starshipIdStr) })
              }}
            >
              {createInvite.isPending ? 'Sending…' : 'Send invite'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmAction !== null}
        onOpenChange={open => {
          if (!open) setConfirmAction(null)
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="text-destructive">
              {confirmAction?.kind === 'kickHuman'
                ? 'Kick member'
                : confirmAction?.kind === 'kickAgent'
                  ? 'Kick agent'
                  : confirmAction?.kind === 'revokeInvite'
                    ? 'Revoke invitation'
                  : confirmAction?.kind === 'deleteAgent'
                    ? 'Delete agent'
                    : confirmAction?.kind === 'unpublishAgent'
                      ? 'Unpublish agent'
                      : 'Confirm'}
            </DialogTitle>
            <DialogDescription>
              {confirmAction?.kind === 'kickHuman'
                ? 'This will remove this member’s access to the starship immediately.'
                : confirmAction?.kind === 'kickAgent'
                  ? 'This will remove the agent from this starship.'
                  : confirmAction?.kind === 'revokeInvite'
                    ? 'This will revoke the invite so it can no longer be used.'
                  : confirmAction?.kind === 'deleteAgent'
                    ? 'This will permanently delete the agent. You can optionally also delete any tools that become unassigned.'
                    : confirmAction?.kind === 'unpublishAgent'
                      ? 'This will remove the agent from the Marketplace (it will stay deployed in your starship).'
                      : ''}
            </DialogDescription>
          </DialogHeader>

          {confirmAction ? (
            <div className="p-3 rounded-lg border border-destructive/20 bg-destructive/10 text-sm">
              <div className="flex items-start gap-2">
                <Icon name="alert-triangle" className="h-4 w-4 text-destructive mt-0.5" />
                <div className="min-w-0">
                  <p className="font-medium text-destructive">You’re about to:</p>
                  <p className="text-destructive/80 break-words">
                    {confirmAction.kind === 'kickHuman'
                      ? `Kick ${confirmAction.label}`
                      : confirmAction.kind === 'kickAgent'
                        ? `Kick ${confirmAction.label}`
                        : confirmAction.kind === 'revokeInvite'
                          ? `Revoke invitation for ${confirmAction.label}`
                        : confirmAction.kind === 'deleteAgent'
                          ? `Delete ${confirmAction.label}`
                          : `Unpublish ${confirmAction.label}`}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {confirmAction?.kind === 'deleteAgent' ? (
            <DialogFooter className="gap-2 sm:gap-2 sm:flex-row">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirmAction(null)}
                disabled={removeMember.isPending || deleteAgent.isPending || deleteAgentWithUnusedTools.isPending || unpublishAgent.isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="outline"
                className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={deleteAgent.isPending || deleteAgentWithUnusedTools.isPending}
                onClick={async () => {
                  const action = confirmAction
                  if (!action || action.kind !== 'deleteAgent') return
                  try {
                    await deleteAgent.mutateAsync(action.agentId)
                  } finally {
                    setConfirmAction(null)
                  }
                }}
              >
                {deleteAgent.isPending ? 'Deleting…' : 'Delete agent'}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={deleteAgent.isPending || deleteAgentWithUnusedTools.isPending}
                onClick={async () => {
                  const action = confirmAction
                  if (!action || action.kind !== 'deleteAgent') return
                  try {
                    await deleteAgentWithUnusedTools.mutateAsync(action.agentId)
                  } finally {
                    setConfirmAction(null)
                  }
                }}
              >
                {deleteAgentWithUnusedTools.isPending ? 'Deleting…' : 'Delete + unused tools'}
              </Button>
            </DialogFooter>
          ) : (
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirmAction(null)}
                disabled={removeMember.isPending || revokeInvite.isPending || deleteAgent.isPending || deleteAgentWithUnusedTools.isPending || unpublishAgent.isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={removeMember.isPending || revokeInvite.isPending || deleteAgent.isPending || deleteAgentWithUnusedTools.isPending || unpublishAgent.isPending}
                onClick={async () => {
                  const action = confirmAction
                  if (!action) return
                  try {
                    if (action.kind === 'kickHuman') {
                      await removeMember.mutateAsync(action.userId)
                    } else if (action.kind === 'kickAgent') {
                      await deleteAgent.mutateAsync(action.agentId)
                    } else if (action.kind === 'revokeInvite') {
                      await revokeInvite.mutateAsync(action.email)
                    } else if (action.kind === 'unpublishAgent') {
                      await unpublishAgent.mutateAsync(action.agentId)
                    }
                  } finally {
                    setConfirmAction(null)
                  }
                }}
              >
                {confirmAction?.kind === 'kickHuman'
                  ? removeMember.isPending
                    ? 'Kicking…'
                    : 'Kick'
                  : confirmAction?.kind === 'kickAgent'
                    ? deleteAgent.isPending
                      ? 'Kicking…'
                      : 'Kick'
                    : confirmAction?.kind === 'revokeInvite'
                      ? revokeInvite.isPending
                        ? 'Revoking…'
                        : 'Revoke'
                      : unpublishAgent.isPending
                        ? 'Unpublishing…'
                        : 'Unpublish'}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

