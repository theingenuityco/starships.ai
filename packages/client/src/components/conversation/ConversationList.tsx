'use client'

import Icon from '@/components/primitives/Icon'

import { useCreateChannel, useStarshipChannels, useStarshipDirectMessages, type DirectMessageListItem } from '@/hooks/useConversations'
import { useNotificationsStream, useUnreadByConversationIds } from '@/hooks/useNotifications'
import { cn } from '@/lib/utils'
import type { AgentModel, ChannelModel, ConversationModel } from '@starships/protocol'
import { formatDistanceToNow } from 'date-fns'

import { useParams, useRouter } from 'next/navigation'
import { useMemo, useState, type RefObject } from 'react'
import { useStarshipUIStore } from '@/store/starship-ui-store'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '../ui/scroll-area'
import { Skeleton } from '../ui/skeleton'
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar'
import AgentAvatar from '@/components/animated/AgentAvatar'
import { PresenceIndicator } from '@/components/ui/PresenceIndicator'
import { useMessageAttachments } from '@/hooks/useFileUpload'
import { formatAgentDisplayName } from '@/lib/agentDisplay'
import { useStarshipAgents } from '@/hooks/useAgents'
import { useStarshipMembersAndInvites, type StarshipMemberListItem } from '@/hooks/useStarshipMembers'
import { useStarshipPresence } from '@/hooks/useStarshipPresence'
import { useAuthContext } from '@/providers/auth-provider'

interface ConversationListProps {
  starshipId: string
  /** Starship slug to use for navigation when not on a /ship/:slug route (e.g. /marketplace). */
  starshipSlug?: string
  onConversationDelete?: (conversationId: string) => void
  onConversationSelect?: (conversationId: string) => void
  compact?: boolean
  onboardingChannelsAnchorRef?: RefObject<HTMLDivElement | null>
  onboardingDirectMessagesAnchorRef?: RefObject<HTMLDivElement | null>
  onboardingHighlight?: 'channels' | 'directMessages' | null
}

function DirectMessageAvatar({ starshipId, agent, busy }: { starshipId: string; agent: AgentModel | null; busy?: boolean }) {
  const avatarAttachmentIds = useMemo(() => {
    const id = agent?.avatarAttachmentId
    return typeof id === 'string' && id.trim().length > 0 ? [id] : []
  }, [agent?.avatarAttachmentId])
  const { data: avatarAttachments = [] } = useMessageAttachments(avatarAttachmentIds, starshipId)
  const previewUrl = avatarAttachments?.[0]?.previewUrl

  return (
    <div className="relative">
      <Avatar className="h-5 w-5 rounded-full ring-1 ring-border/40">
        <AgentAvatar seed={agent?.name || 'DM'} imageUrl={previewUrl} size={20} rounded />
      </Avatar>
      <PresenceIndicator kind={busy ? 'busy' : 'online'} active={true} size="xs" />
    </div>
  )
}

function HumanAvatar({ user, online }: { user: StarshipMemberListItem; online?: boolean }) {
  const fallback = (user.displayName || user.email || '?').trim().slice(0, 1).toUpperCase()
  const hasPresence = typeof online === 'boolean'
  return (
    <div className="relative">
      <Avatar className="h-5 w-5 rounded-full ring-1 ring-border/40">
        {user.avatar ? <AvatarImage src={user.avatar} alt={user.displayName || user.email || 'User'} referrerPolicy="no-referrer" crossOrigin="anonymous" className="object-cover" /> : null}
        <AvatarFallback className="rounded-full bg-primary/10 text-primary text-[10px] font-semibold">{fallback}</AvatarFallback>
      </Avatar>
      {hasPresence ? <PresenceIndicator kind={online ? 'online' : 'offline'} active={true} size="xs" /> : null}
    </div>
  )
}

type DmTarget = { kind: 'agent'; key: string; label: string; agent: AgentModel } | { kind: 'user'; key: string; label: string; user: StarshipMemberListItem }

export function ConversationList({
  starshipId,
  starshipSlug,
  onConversationDelete,
  onConversationSelect,
  compact = false,
  onboardingChannelsAnchorRef,
  onboardingDirectMessagesAnchorRef,
  onboardingHighlight = null,
}: ConversationListProps) {
  const router = useRouter()
  const params = useParams()
  const slugFromParams = typeof (params as any)?.slug === 'string' ? String((params as any).slug) : ''
  const slug = (typeof starshipSlug === 'string' && starshipSlug.trim().length > 0 ? starshipSlug.trim() : slugFromParams) || ''
  // Current selection can come from either /conversations/:conversationId (DMs) or /channels/:channelSlug (channels).
  const currentConversationId = params.conversationId as string | undefined
  const currentChannelSlug = params.channelSlug as string | undefined
  const currentDmPeer = (params as any)?.peer as string | undefined
  const pendingConversationId = useStarshipUIStore(s => s.pendingConversationId)

  const { data: channelsData, isLoading: channelsLoading } = useStarshipChannels(starshipId, true)
  const { data: directMessagesData, isLoading: directMessagesLoading } = useStarshipDirectMessages(starshipId, true)
  const activeConversationIdForNotifications = useMemo(() => {
    // 1) /ship/:slug/conversations/:conversationId
    const byRoute = typeof currentConversationId === 'string' ? String(currentConversationId).trim() : ''
    if (byRoute) return byRoute

    // 2) /ship/:slug/channels/:channelSlug
    const chSlug = typeof currentChannelSlug === 'string' ? String(currentChannelSlug).trim().toLowerCase() : ''
    if (chSlug) {
      const chans = (channelsData as any)?.channels
      if (Array.isArray(chans)) {
        const match =
          chans.find(
            (c: any) =>
              String(c?.slug || '')
                .trim()
                .toLowerCase() === chSlug
          ) ?? null
        const cid = typeof match?.conversationId === 'string' ? String(match.conversationId).trim() : ''
        if (cid) return cid
      }
    }

    // 3) /ship/:slug/dm/:peer (conversationId is not in the route; ship layout uses pendingConversationId)
    const pending = typeof pendingConversationId === 'string' ? String(pendingConversationId).trim() : ''
    return pending || null
  }, [channelsData, currentChannelSlug, currentConversationId, pendingConversationId])

  const { unread: notifUnread } = useNotificationsStream(starshipId, true, { activeConversationId: activeConversationIdForNotifications })
  const { data: agentsData, isLoading: agentsLoading, error: agentsError } = useStarshipAgents(starshipId, true)
  const { data: membersData, isLoading: membersLoading, error: membersError } = useStarshipMembersAndInvites(starshipId, true)
  const { isUserOnline } = useStarshipPresence(starshipId, true)
  const busyAgentIds = useMemo(() => {
    const set = new Set<string>()
    const list = (directMessagesData?.directMessages || []) as DirectMessageListItem[]
    for (const item of list) {
      const dm: any = (item as any)?.dm
      if (!dm || dm.dmType !== 'user_agent') continue
      const agentId = typeof dm.agentId === 'string' ? String(dm.agentId) : ''
      if (!agentId) continue
      const conv: any = (item as any)?.conversation
      const busy = !!(conv?.state && typeof conv.state === 'object' && (conv.state as any).turnActive === true)
      if (busy) set.add(agentId)
    }
    return set
  }, [directMessagesData?.directMessages])

  // Slack-style unread state for channel/DM list items
  const conversationIdsForUnread = useMemo(() => {
    const ids: string[] = []
    const chans = (channelsData as any)?.channels
    if (Array.isArray(chans)) {
      for (const c of chans) {
        const cid = typeof c?.conversationId === 'string' ? String(c.conversationId) : ''
        if (cid) ids.push(cid)
      }
    }
    const dms = (directMessagesData?.directMessages || []) as DirectMessageListItem[]
    for (const item of dms) {
      const dm: any = (item as any)?.dm
      const cid = typeof dm?.conversationId === 'string' ? String(dm.conversationId) : ''
      if (cid) ids.push(cid)
    }
    return Array.from(new Set(ids))
  }, [channelsData, directMessagesData?.directMessages])
  const { data: unreadMapData } = useUnreadByConversationIds(starshipId, conversationIdsForUnread, true)
  const unreadByConversationId = (unreadMapData as any)?.unreadByConversationId as Record<string, { hasUnread: boolean }> | undefined

  const createChannel = useCreateChannel()
  const { userId: authUserId } = useAuthContext()
  const [searchQuery, setSearchQuery] = useState('')
  const [isCreateChannelOpen, setIsCreateChannelOpen] = useState(false)
  const [isChannelsExpanded, setIsChannelsExpanded] = useState(true)
  const [isDirectMessagesExpanded, setIsDirectMessagesExpanded] = useState(true)
  const [newChannelSlug, setNewChannelSlug] = useState('')
  const [newChannelName, setNewChannelName] = useState('')
  const [newChannelPrivate, setNewChannelPrivate] = useState(false)
  const channels = (channelsData?.channels || []) as ChannelModel[]

  const dmTargets = useMemo<DmTarget[]>(() => {
    const q = searchQuery.trim().toLowerCase()
    const agents = Array.isArray(agentsData) ? (agentsData as AgentModel[]) : []
    const members = (membersData?.members || []) as StarshipMemberListItem[]

    const agentTargets: DmTarget[] = agents.map(a => ({
      kind: 'agent',
      key: `agent:${a.id}`,
      label: formatAgentDisplayName(a),
      agent: a,
    }))

    const memberTargets: DmTarget[] = members
      .filter(m => String(m.userId) !== String(authUserId || ''))
      .map(m => ({
        kind: 'user',
        key: `user:${m.userId}`,
        label: m.displayName || m.email || 'User',
        user: m,
      }))

    const all = [...agentTargets, ...memberTargets]
    const filtered = q
      ? all.filter(t => {
          const label = (t.label || '').toLowerCase()
          const extra = t.kind === 'user' ? (t.user.email || '').toLowerCase() : (t.agent.slug || '').toLowerCase()
          return label.includes(q) || extra.includes(q)
        })
      : all

    // Stable ordering: agents first, then humans; alpha within group
    return filtered.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'agent' ? -1 : 1
      return a.label.localeCompare(b.label)
    })
  }, [agentsData, membersData?.members, authUserId, searchQuery])

  const dmPeerKeyForTarget = (t: DmTarget): string => {
    if (t.kind === 'agent') {
      const slug = String(t.agent.slug || '').trim()
      if (slug) return slug
      const id = String(t.agent.id || '').trim()
      return id ? `a:${id}` : 'a:unknown'
    }
    const uid = String(t.user.userId || '').trim()
    return `u-${uid}`
  }

  const dmHrefForTarget = (t: DmTarget): string | null => {
    if (!slug) return null
    const peerKey = dmPeerKeyForTarget(t)
    return `/ship/${slug}/dm/${encodeURIComponent(peerKey)}`
  }

  const renderCompactDmTarget = (t: DmTarget) => {
    const label = t.label
    const isBusy = directMessagesLoading
    const targetPeerKey = dmPeerKeyForTarget(t)
    const isActive =
      (typeof currentDmPeer === 'string' && currentDmPeer.trim().length > 0 && currentDmPeer.trim().toLowerCase() === targetPeerKey.toLowerCase()) ||
      (t.kind === 'agent'
        ? !!currentConversationId && existingDmConversationIdByAgentId.get(t.agent.id) === currentConversationId
        : !!currentConversationId && existingDmConversationIdByPeerUserId.get(t.user.userId) === currentConversationId)

    const conversationId = t.kind === 'agent' ? String(existingDmConversationIdByAgentId.get(String(t.agent.id)) || '') : String(existingDmConversationIdByPeerUserId.get(String(t.user.userId)) || '')
    const isOpenConversation = Boolean(conversationId && activeConversationIdForNotifications && conversationId === activeConversationIdForNotifications)
    // UX requirement: don't show an unread badge/highlight for the conversation the user is already viewing.
    const hasUnread = Boolean(!isOpenConversation && conversationId && unreadByConversationId?.[conversationId]?.hasUnread)
    const dmCount = Number(!isOpenConversation && conversationId ? (notifUnread?.dmUnreadByConversationId?.[conversationId] ?? 0) : 0) || 0

    return (
      <div
        key={t.key}
        className={cn(
          'group relative rounded-lg flex items-center border w-full h-8 cursor-pointer text-sm px-2',
          isActive
            ? 'text-primary bg-primary/10 border-transparent'
            : hasUnread
              ? 'text-foreground border-transparent hover:bg-muted'
              : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-muted',
          isBusy && 'opacity-70 pointer-events-none'
        )}
        style={{
          justifyContent: 'flex-start',
          transition: 'background-color 0.15s ease',
          cursor: 'pointer',
          minHeight: '32px',
        }}
        onClick={() => handleDmTargetClick(t)}
      >
        <div
          className="flex-shrink-0"
          style={{
            width: '1.25rem',
            height: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: 0,
            pointerEvents: 'none',
          }}
        >
          {t.kind === 'agent' ? <DirectMessageAvatar starshipId={starshipId} agent={t.agent} /> : <HumanAvatar user={t.user} online={isUserOnline(String(t.user.userId))} />}
        </div>
        <span
          className={cn(
            'whitespace-nowrap pointer-events-none truncate min-w-0 flex-1 ml-1.5',
            isActive ? 'text-primary font-medium' : hasUnread ? 'text-foreground font-bold' : 'text-muted-foreground font-medium'
          )}
        >
          {label}
        </span>
        {dmCount > 0 ? (
          <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-red-500/90 dark:bg-red-400/90 text-white text-[10px] leading-none font-semibold">
            {dmCount > 99 ? '99+' : String(dmCount)}
          </span>
        ) : null}
      </div>
    )
  }

  const handleChannelClick = (channelSlug: string) => {
    if (!slug) return
    router.push(`/ship/${slug}/channels/${encodeURIComponent(channelSlug)}`)
    onConversationSelect?.(channelSlug)
  }

  const existingDmConversationIdByAgentId = useMemo(() => {
    const list = (directMessagesData?.directMessages || []) as DirectMessageListItem[]
    const map = new Map<string, string>()
    for (const item of list) {
      const dm: any = (item as any)?.dm
      if (!dm || dm.dmType !== 'user_agent') continue
      const agentId = typeof dm.agentId === 'string' ? String(dm.agentId) : ''
      const cid = typeof dm.conversationId === 'string' ? String(dm.conversationId) : ''
      if (agentId && cid) map.set(agentId, cid)
    }
    return map
  }, [directMessagesData?.directMessages])

  const existingDmConversationIdByPeerUserId = useMemo(() => {
    const list = (directMessagesData?.directMessages || []) as DirectMessageListItem[]
    const map = new Map<string, string>()
    for (const item of list) {
      const dm: any = (item as any)?.dm
      if (!dm || dm.dmType !== 'user_user') continue
      const peer: any = (item as any)?.peerUser
      const peerId = typeof peer?.id === 'string' ? String(peer.id) : ''
      const cid = typeof dm.conversationId === 'string' ? String(dm.conversationId) : ''
      if (peerId && cid) map.set(peerId, cid)
    }
    return map
  }, [directMessagesData?.directMessages])

  const handleDmTargetClick = async (t: DmTarget) => {
    // Prevent race conditions: if DMs haven't loaded yet, we don't know whether a DM exists.
    // Clicking during this window can open draft views and later create duplicate DMs.
    if (directMessagesLoading) return
    const href = dmHrefForTarget(t)
    if (!href) return
    router.push(href)

    // Keep the parent callback behavior for consumers that care about "selection",
    // even though canonical navigation is now by peer key (not conversationId).
    const existingConversationId =
      t.kind === 'agent' ? String(existingDmConversationIdByAgentId.get(String(t.agent.id)) || '') : String(existingDmConversationIdByPeerUserId.get(String(t.user.userId)) || '')
    if (existingConversationId) onConversationSelect?.(existingConversationId)
  }

  const createChannelDialog = (
    <Dialog open={isCreateChannelOpen} onOpenChange={setIsCreateChannelOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create channel</DialogTitle>
          <DialogDescription>Create a conversation-backed channel for this starship.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="channel-name">Name</Label>
            <Input id="channel-name" placeholder="Lobby" value={newChannelName} onChange={e => setNewChannelName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="channel-slug">Slug</Label>
            <Input id="channel-slug" placeholder="lobby" value={newChannelSlug} onChange={e => setNewChannelSlug(e.target.value)} />
            <p className="text-xs text-muted-foreground">Lowercase letters, numbers, - or _</p>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <Label htmlFor="channel-private">Private</Label>
              <p className="text-xs text-muted-foreground">Only explicitly added members can read/write.</p>
            </div>
            <Switch id="channel-private" checked={newChannelPrivate} onCheckedChange={setNewChannelPrivate} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={() => setIsCreateChannelOpen(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!newChannelName.trim() || !newChannelSlug.trim() || createChannel.isPending}
            onClick={async () => {
              const slug = newChannelSlug.trim().toLowerCase()
              const name = newChannelName.trim()
              const created = await createChannel.mutateAsync({ starshipId, slug, name, isPrivate: newChannelPrivate })
              setIsCreateChannelOpen(false)
              setNewChannelSlug('')
              setNewChannelName('')
              setNewChannelPrivate(false)
              // Canonical: navigate by channel slug (not conversationId).
              if (created?.conversationId) {
                handleChannelClick(slug)
              }
            }}
          >
            {createChannel.isPending ? 'Creating…' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  // Compact mode - inline display without header/search
  if (compact) {
    if (agentsLoading || membersLoading) {
      return (
        <div className="space-y-1">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-8 w-full rounded-lg" />
          ))}
        </div>
      )
    }

    if (agentsError || membersError) {
      return (
        <div className="flex flex-col items-center justify-center py-8 px-2">
          <p className="text-muted-foreground text-xs text-center">Failed to load direct message targets</p>
        </div>
      )
    }

    return (
      <>
        <div className="flex flex-col h-full min-h-0">
          {/* Channels - content-sized so Direct messages starts right below */}
          <div
            className={cn(
              'flex flex-col flex-none min-h-0 rounded-lg',
              onboardingHighlight === 'channels' && 'bg-primary/10 ring-2 ring-primary shadow-[0_0_0_2px_hsl(var(--primary)/0.2),0_6px_18px_hsl(var(--primary)/0.25)]'
            )}
          >
            <div ref={onboardingChannelsAnchorRef} data-onboarding-anchor="channels" className="w-full flex items-center justify-between h-8 pr-2">
              <button
                type="button"
                className={cn('flex-1 min-w-0 h-8 flex items-center rounded-lg border border-transparent text-muted-foreground px-2', 'hover:text-foreground hover:bg-muted/40 transition-colors')}
                style={{ justifyContent: 'flex-start' }}
                onClick={() => setIsChannelsExpanded(v => !v)}
                aria-expanded={isChannelsExpanded}
                aria-controls="sidebar-channels-list"
              >
                <div
                  className="flex-shrink-0"
                  style={{
                    width: '1.25rem',
                    height: '1.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: 0,
                    marginRight: '0.25rem',
                  }}
                >
                  <Icon name={isChannelsExpanded ? 'chevron-down' : 'chevron-right'} className="w-4 h-4" />
                </div>
                <span className="text-[11px] font-semibold uppercase tracking-wide">Channels</span>
              </button>

              <button
                type="button"
                onClick={() => setIsCreateChannelOpen(true)}
                className="inline-flex items-center justify-center w-6 h-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                aria-label="Create channel"
              >
                <Icon name="plus" className="w-4 h-4" />
              </button>
            </div>

            {isChannelsExpanded ? (
              <div id="sidebar-channels-list" className="flex-none overflow-y-auto pr-1 max-h-[40vh]">
                {channelsLoading ? (
                  <div className="space-y-1">
                    {[1, 2].map(i => (
                      <Skeleton key={i} className="h-8 w-full rounded-lg" />
                    ))}
                  </div>
                ) : channels.length === 0 ? (
                  <div className="px-2 py-3 text-xs text-muted-foreground">No channels yet</div>
                ) : (
                  <div className="space-y-1">
                    {channels.map(ch => {
                      const isActive = currentChannelSlug
                        ? String(ch.slug || '')
                            .trim()
                            .toLowerCase() ===
                          String(currentChannelSlug || '')
                            .trim()
                            .toLowerCase()
                        : ch.conversationId === currentConversationId
                      const label = ch.name || ch.slug
                      const cid = String(ch.conversationId || '')
                      const hasUnread = Boolean(unreadByConversationId?.[cid]?.hasUnread)
                      const mentionCount = Number(notifUnread?.mentionUnreadByConversationId?.[cid] ?? 0) || 0
                      return (
                        <div key={ch.conversationId}>
                          <div
                            className={cn(
                              'group relative rounded-lg flex items-center border w-full h-8 cursor-pointer text-sm px-2',
                              isActive
                                ? 'text-primary bg-primary/10 border-transparent'
                                : hasUnread
                                  ? 'text-foreground border-transparent hover:bg-muted'
                                  : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-muted'
                            )}
                            style={{
                              justifyContent: 'flex-start',
                              transition: 'background-color 0.15s ease',
                              cursor: 'pointer',
                              minHeight: '32px',
                            }}
                            onClick={() => handleChannelClick(String(ch.slug))}
                          >
                            <div
                              className="flex-shrink-0"
                              style={{
                                width: '1.25rem',
                                height: '1.25rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                margin: 0,
                                pointerEvents: 'none',
                              }}
                            >
                              <Icon
                                name="hash"
                                weight={isActive ? 'regular' : hasUnread || mentionCount > 0 ? 'bold' : 'regular'}
                                className={cn('h-4 w-4', isActive ? 'text-primary' : hasUnread || mentionCount > 0 ? 'text-foreground' : 'text-muted-foreground')}
                              />
                            </div>
                            <span
                              className={cn(
                                'whitespace-nowrap pointer-events-none truncate min-w-0 flex-1 ml-1.5',
                                isActive ? 'text-primary font-medium' : hasUnread || mentionCount > 0 ? 'text-foreground font-bold' : 'font-medium'
                              )}
                            >
                              {label}
                            </span>
                            {mentionCount > 0 ? (
                              <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-red-500/90 dark:bg-red-400/90 text-white text-[10px] leading-none font-semibold">
                                {mentionCount > 99 ? '99+' : String(mentionCount)}
                              </span>
                            ) : null}
                          </div>

                          {/* Forum channels render threads in the main panel (no nested sidebar list). */}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <div className="my-3 border-t border-border/60" />

          {/* Direct messages - takes remaining space below Channels */}
          <div
            className={cn(
              'flex flex-col min-h-0 rounded-lg flex-1',
              onboardingHighlight === 'directMessages' && 'bg-primary/10 ring-2 ring-primary shadow-[0_0_0_2px_hsl(var(--primary)/0.2),0_6px_18px_hsl(var(--primary)/0.25)]'
            )}
          >
            <div ref={onboardingDirectMessagesAnchorRef} data-onboarding-anchor="direct-messages" className="w-full flex items-center justify-between h-8 pr-2">
              <button
                type="button"
                className={cn('flex-1 min-w-0 h-8 flex items-center rounded-lg border border-transparent text-muted-foreground px-2', 'hover:text-foreground hover:bg-muted/40 transition-colors')}
                style={{ justifyContent: 'flex-start' }}
                onClick={() => setIsDirectMessagesExpanded(v => !v)}
                aria-expanded={isDirectMessagesExpanded}
                aria-controls="sidebar-direct-messages-list"
              >
                <div
                  className="flex-shrink-0"
                  style={{
                    width: '1.25rem',
                    height: '1.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: 0,
                    marginRight: '0.25rem',
                  }}
                >
                  <Icon name={isDirectMessagesExpanded ? 'chevron-down' : 'chevron-right'} className="w-4 h-4" />
                </div>
                <span className="text-[11px] font-semibold uppercase tracking-wide">Direct messages</span>
              </button>
              {/* spacer to align with Channels "+" column */}
              <div className="w-6 h-6" />
            </div>

            {isDirectMessagesExpanded ? (
              <div id="sidebar-direct-messages-list" className="min-h-0 flex-1 overflow-y-auto pr-1 flex flex-col">
                {dmTargets.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-6 px-2">
                    <Icon name="message-square" className="w-8 h-8 text-muted-foreground/30 mb-2" />
                    <p className="text-muted-foreground text-xs text-center">No one to message yet</p>
                  </div>
                ) : (
                  <div className="space-y-1">{dmTargets.map(t => renderCompactDmTarget(t))}</div>
                )}
              </div>
            ) : null}
          </div>
        </div>
        {createChannelDialog}
      </>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h2 className="text-sm font-semibold">Messages</h2>
          <Button type="button" size="sm" variant="secondary" className="h-8" onClick={() => setIsCreateChannelOpen(true)} disabled={createChannel.isPending}>
            <Icon name="plus" className="h-4 w-4 mr-1" />
            New channel
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full px-2 py-1.5 text-xs frosted-glass-light rounded-lg focus:outline-none focus:border-primary/50 transition-colors"
          />
        </div>
      </div>

      {/* Conversations List */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {/* Channels */}
          <div className="mb-4">
            <div className="px-2 mb-2 flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Channels</p>
              <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setIsCreateChannelOpen(true)} disabled={createChannel.isPending}>
                <Icon name="plus" className="h-3 w-3 mr-1" />
                Create
              </Button>
            </div>
            {channelsLoading ? (
              <div className="space-y-1 px-2">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-8 w-full rounded-lg" />
                ))}
              </div>
            ) : channels.length === 0 ? (
              <div className="px-2 py-6 text-center text-xs text-muted-foreground">No channels yet</div>
            ) : (
              <div className="space-y-1">
                {channels.map(ch => {
                  const isActive = currentChannelSlug
                    ? String(ch.slug || '')
                        .trim()
                        .toLowerCase() ===
                      String(currentChannelSlug || '')
                        .trim()
                        .toLowerCase()
                    : ch.conversationId === currentConversationId
                  const label = ch.name || ch.slug
                  const cid = String(ch.conversationId || '')
                  const hasUnread = Boolean(unreadByConversationId?.[cid]?.hasUnread)
                  const mentionCount = Number(notifUnread?.mentionUnreadByConversationId?.[cid] ?? 0) || 0
                  return (
                    <div key={ch.conversationId}>
                      <div
                        className={cn('group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all', 'hover:bg-muted/50', isActive && 'bg-muted/70 shadow-sm')}
                        onClick={() => handleChannelClick(String(ch.slug))}
                      >
                        <Icon
                          name="hash"
                          weight={isActive ? 'regular' : hasUnread || mentionCount > 0 ? 'bold' : 'regular'}
                          className={cn('h-4 w-4', isActive ? 'text-primary' : hasUnread || mentionCount > 0 ? 'text-foreground' : 'text-muted-foreground')}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p
                              className={cn(
                                'text-sm truncate',
                                isActive ? 'text-primary font-medium' : hasUnread || mentionCount > 0 ? 'text-foreground font-bold' : 'text-muted-foreground font-medium'
                              )}
                            >
                              {label}
                            </p>
                            <span className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(ch.updatedAt || ch.createdAt), { addSuffix: false })}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">{ch.isPrivate && <span className="text-[10px] text-muted-foreground">Private</span>}</div>
                        </div>
                        {mentionCount > 0 ? (
                          <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-red-500/90 dark:bg-red-400/90 text-white text-[10px] leading-none font-semibold">
                            {mentionCount > 99 ? '99+' : String(mentionCount)}
                          </span>
                        ) : null}
                      </div>

                      {/* Forum channels render threads in the main panel (no nested sidebar list). */}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="my-3 border-t border-border/60" />

          <div className="mb-4">
            <div className="px-2 mb-2 flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Direct messages</p>
            </div>
            {agentsLoading || membersLoading || directMessagesLoading ? (
              <div className="space-y-1 px-2">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-8 w-full rounded-lg" />
                ))}
              </div>
            ) : agentsError || membersError ? (
              <div className="px-2 py-6 text-center text-xs text-muted-foreground">Failed to load direct message targets</div>
            ) : dmTargets.length === 0 ? (
              <div className="px-2 py-6 text-center text-xs text-muted-foreground">No one to message yet</div>
            ) : (
              <div className="space-y-1">
                {dmTargets.map(t => {
                  const isBusy = directMessagesLoading
                  const label = t.label
                  const isActive =
                    (typeof currentDmPeer === 'string' && currentDmPeer.trim().length > 0 && currentDmPeer.trim().toLowerCase() === dmPeerKeyForTarget(t).toLowerCase()) ||
                    (t.kind === 'agent'
                      ? !!currentConversationId && existingDmConversationIdByAgentId.get(t.agent.id) === currentConversationId
                      : !!currentConversationId && existingDmConversationIdByPeerUserId.get(t.user.userId) === currentConversationId)
                  const conversationId = t.kind === 'agent' ? String(existingDmConversationIdByAgentId.get(t.agent.id) || '') : String(existingDmConversationIdByPeerUserId.get(t.user.userId) || '')
                  const hasUnread = Boolean(conversationId && unreadByConversationId?.[conversationId]?.hasUnread)
                  const dmCount = Number(conversationId ? (notifUnread?.dmUnreadByConversationId?.[conversationId] ?? 0) : 0) || 0
                  return (
                    <div
                      key={t.key}
                      className={cn(
                        'group flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all',
                        'hover:bg-muted/50',
                        isActive && 'bg-primary/10 text-primary',
                        !isActive && hasUnread && 'text-foreground',
                        isBusy && 'opacity-70 pointer-events-none'
                      )}
                      onClick={() => handleDmTargetClick(t)}
                    >
                      {t.kind === 'agent' ? (
                        <DirectMessageAvatar starshipId={starshipId} agent={t.agent} busy={busyAgentIds.has(String(t.agent.id))} />
                      ) : (
                        <HumanAvatar user={t.user} online={isUserOnline(String(t.user.userId))} />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1 gap-2">
                          <p className={cn('text-sm truncate', isActive ? 'text-primary font-medium' : hasUnread ? 'text-foreground font-bold' : 'text-muted-foreground font-medium')}>{label}</p>
                          {dmCount > 0 ? (
                            <span className="inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-red-500/90 dark:bg-red-400/90 text-white text-[10px] leading-none font-semibold">
                              {dmCount > 99 ? '99+' : String(dmCount)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>

      {/* Footer Stats */}
      <div className="p-4 border-t frosted-glass-light">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{dmTargets.length} people</span>
        </div>
      </div>
      {createChannelDialog}
    </div>
  )
}
