'use client'

import Icon from '@/components/primitives/Icon'

import { useCreateChannel, useDeleteChannel, useStarshipChannels, useStarshipDirectMessages, useUpdateChannel, type DirectMessageListItem } from '@/hooks/useConversations'
import { useNotificationsStream, useUnreadByConversationIds } from '@/hooks/useNotifications'
import { cn } from '@/lib/utils'
import type { AgentModel, ChannelModel, ConversationModel } from '@starships/protocol'
import { formatDistanceToNow } from 'date-fns'

import { useParams, useRouter } from 'next/navigation'
import { memo, useMemo, useState } from 'react'
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
import { useAuth } from '@/hooks/useAuth'
import { useStarship } from '@/hooks/useStarships'

interface ConversationListProps {
  starshipId: string
  /** Starship slug to use for navigation when not on a /ship/:slug route (e.g. /marketplace). */
  starshipSlug?: string
  onConversationDelete?: (conversationId: string) => void
  onConversationSelect?: (conversationId: string) => void
  compact?: boolean
}

const CHANNEL_NAME_MAX = 100
const CHANNEL_SLUG_MAX = 100

function toChannelSlug(input: string): string {
  const s = String(input || '')
    .trim()
    .toLowerCase()
  if (!s) return ''

  // Keep it simple and deterministic:
  // - spaces/periods -> hyphen
  // - underscores -> hyphen
  // - keep [a-z0-9-]
  // - collapse multiple hyphens
  // - trim hyphens at edges
  const normalized = s
    .replace(/[\s._]+/g, '-')
    .replace(/[^a-z0-9-]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')

  if (normalized.length <= CHANNEL_SLUG_MAX) return normalized
  // Ensure truncation doesn't end on '-'
  return normalized
    .slice(0, CHANNEL_SLUG_MAX)
    .replace(/-+$/g, '')
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
      <Avatar className="h-3.5 w-3.5 rounded-full ring-1 ring-border/40">
        <AgentAvatar seed={agent?.name || 'DM'} imageUrl={previewUrl} size={14} rounded />
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
      <Avatar className="h-3.5 w-3.5 rounded-full ring-1 ring-border/40">
        {user.avatar ? <AvatarImage src={user.avatar} alt={user.displayName || user.email || 'User'} referrerPolicy="no-referrer" className="object-cover" /> : null}
        <AvatarFallback className="rounded-full bg-primary/10 text-primary text-[9px] font-semibold">{fallback}</AvatarFallback>
      </Avatar>
      {hasPresence ? <PresenceIndicator kind={online ? 'online' : 'offline'} active={true} size="xs" /> : null}
    </div>
  )
}

type DmTarget = { kind: 'agent'; key: string; label: string; agent: AgentModel } | { kind: 'user'; key: string; label: string; user: StarshipMemberListItem }

export const ConversationList = memo(function ConversationList({
  starshipId,
  starshipSlug,
  onConversationDelete,
  onConversationSelect,
  compact = false,
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
  const updateChannel = useUpdateChannel()
  const deleteChannel = useDeleteChannel()
  const { userId: authUserId } = useAuthContext()
  const { user, isInstanceAdmin } = useAuth()
  const { data: starship } = useStarship(starshipId, true)
  const canManageChannels = Boolean(user?.id && starship?.ownerId && (isInstanceAdmin === true || String(starship.ownerId) === String(user.id)))
  const [searchQuery, setSearchQuery] = useState('')
  const [isCreateChannelOpen, setIsCreateChannelOpen] = useState(false)
  const [isChannelsExpanded, setIsChannelsExpanded] = useState(true)
  const [isDirectMessagesExpanded, setIsDirectMessagesExpanded] = useState(true)
  const [newChannelName, setNewChannelName] = useState('')
  const [newChannelPrivate, setNewChannelPrivate] = useState(false)
  const [editChannel, setEditChannel] = useState<ChannelModel | null>(null)
  const [editChannelName, setEditChannelName] = useState('')
  const [editChannelPrivate, setEditChannelPrivate] = useState(false)
  const [editChannelTopic, setEditChannelTopic] = useState('')
  const [deleteChannelTarget, setDeleteChannelTarget] = useState<ChannelModel | null>(null)
  const autogeneratedChannelSlug = useMemo(() => toChannelSlug(newChannelName), [newChannelName])
  const newChannelNameLength = newChannelName.length
  const isChannelNameEmpty = newChannelName.trim().length === 0
  const isChannelNameTrimmed = newChannelName === newChannelName.trim()
  const isChannelNameTooLong = newChannelNameLength > CHANNEL_NAME_MAX
  const isChannelSlugEmpty = autogeneratedChannelSlug.length === 0
  const canCreateChannel =
    !createChannel.isPending && !isChannelNameEmpty && isChannelNameTrimmed && !isChannelNameTooLong && !isChannelSlugEmpty
  const channels = (channelsData?.channels || []) as ChannelModel[]
  const channelsForDisplay = useMemo(() => {
    // Navigation UX: the default channel should always be first.
    // Server-side default is `#lobby` (see ensureDefaultChannelForStarship).
    const DEFAULT_CHANNEL_SLUG = 'lobby'
    const normalize = (s: unknown): string =>
      String(s ?? '')
        .trim()
        .toLowerCase()

    const defaultIndex = channels.findIndex(ch => normalize((ch as any)?.slug) === DEFAULT_CHANNEL_SLUG)
    if (defaultIndex <= 0) return channels

    const defaultChannel = channels[defaultIndex]
    return [defaultChannel, ...channels.slice(0, defaultIndex), ...channels.slice(defaultIndex + 1)]
  }, [channels])

  const openEditChannel = (ch: ChannelModel) => {
    setEditChannel(ch)
    setEditChannelName(String(ch.name || ''))
    setEditChannelPrivate(Boolean((ch as any).isPrivate))
    setEditChannelTopic(typeof (ch as any).topic === 'string' ? String((ch as any).topic) : '')
  }

  const closeEditChannel = () => {
    setEditChannel(null)
    setEditChannelName('')
    setEditChannelPrivate(false)
    setEditChannelTopic('')
  }

  const openDeleteChannel = (ch: ChannelModel) => {
    setDeleteChannelTarget(ch)
  }

  const closeDeleteChannel = () => {
    setDeleteChannelTarget(null)
  }

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

    // Stable ordering: humans first, then agents; alpha within group
    return filtered.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'user' ? -1 : 1
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
    const reactionCount = Number(!isOpenConversation && conversationId ? ((notifUnread as any)?.reactionUnreadByConversationId?.[conversationId] ?? 0) : 0) || 0
    const notifCount = dmCount + reactionCount
    const hasNotifBadge = notifCount > 0

    return (
      <div
        key={t.key}
        className={cn(
          'group relative rounded-lg flex items-center border w-full h-7 cursor-pointer text-[12.5px] px-1',
          isActive
            ? 'text-primary bg-primary/10 border-transparent'
            : hasUnread || hasNotifBadge
              ? 'text-foreground border-transparent hover:bg-muted'
              : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-muted',
          isBusy && 'opacity-70 pointer-events-none'
        )}
        style={{
          justifyContent: 'flex-start',
          transition: 'background-color 0.15s ease',
          cursor: 'pointer',
          minHeight: '28px',
        }}
        onClick={() => handleDmTargetClick(t)}
      >
        <div
          className="flex-shrink-0"
          style={{
            width: '1rem',
            height: '1rem',
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
            'whitespace-nowrap pointer-events-none truncate min-w-0 flex-1 ml-1',
            // Color is controlled by the row container (matches `NavigationItem`); keep only weight here.
            isActive ? 'font-medium' : hasUnread || hasNotifBadge ? 'font-bold' : 'font-medium'
          )}
        >
          {label}
        </span>
        {notifCount > 0 ? (
          <span className="ml-1 inline-flex items-center justify-center min-w-[14px] h-[14px] px-1 rounded-full bg-red-500/90 dark:bg-red-400/90 text-white text-[9px] leading-none font-semibold">
            {notifCount > 99 ? '99+' : String(notifCount)}
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
            <Input
              id="channel-name"
              placeholder="Example"
              value={newChannelName}
              onChange={e => setNewChannelName(String(e.target.value || ''))}
            />
            <div className="flex items-center justify-between gap-2">
              <p className={cn('text-xs', isChannelNameTooLong ? 'text-destructive' : 'text-muted-foreground')}>
                {newChannelNameLength}/{CHANNEL_NAME_MAX}
              </p>
              {!isChannelNameTrimmed ? <p className="text-xs text-destructive">Name must not have leading/trailing whitespace.</p> : null}
              {isChannelNameTooLong ? <p className="text-xs text-destructive">Name must be {CHANNEL_NAME_MAX} characters or fewer.</p> : null}
              {!isChannelNameEmpty && isChannelSlugEmpty ? <p className="text-xs text-destructive">Name must include at least one letter or number.</p> : null}
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="channel-slug">Slug</Label>
            <Input
              id="channel-slug"
              placeholder="-"
              value={newChannelNameLength > CHANNEL_NAME_MAX ? '-' : autogeneratedChannelSlug || '-'}
              readOnly
              disabled
            />
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
            disabled={!canCreateChannel}
            onClick={async () => {
              const slug = autogeneratedChannelSlug
              const name = newChannelName
              const created = await createChannel.mutateAsync({ starshipId, slug, name, isPrivate: newChannelPrivate })
              setIsCreateChannelOpen(false)
              setNewChannelName('')
              setNewChannelPrivate(false)
              // Canonical: navigate by channel slug (not conversationId).
              if (created?.conversationId) {
                const createdSlug = String((created as any)?.channel?.slug || slug).trim()
                handleChannelClick(createdSlug)
              }
            }}
          >
            {createChannel.isPending ? 'Creating…' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  const editChannelNameLength = editChannelName.length
  const isEditChannelNameEmpty = editChannelName.trim().length === 0
  const isEditChannelNameTrimmed = editChannelName === editChannelName.trim()
  const isEditChannelNameTooLong = editChannelNameLength > CHANNEL_NAME_MAX
  const canSaveChannelEdit =
    Boolean(editChannel?.conversationId) && !updateChannel.isPending && !isEditChannelNameEmpty && isEditChannelNameTrimmed && !isEditChannelNameTooLong

  const editChannelDialog = (
    <Dialog
      open={Boolean(editChannel)}
      onOpenChange={open => {
        if (!open) closeEditChannel()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit channel</DialogTitle>
          <DialogDescription>Update this channel’s settings.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="edit-channel-name">Name</Label>
            <Input
              id="edit-channel-name"
              placeholder="Example"
              value={editChannelName}
              onChange={e => setEditChannelName(String(e.target.value || ''))}
            />
            <div className="flex items-center justify-between gap-2">
              <p className={cn('text-xs', isEditChannelNameTooLong ? 'text-destructive' : 'text-muted-foreground')}>
                {editChannelNameLength}/{CHANNEL_NAME_MAX}
              </p>
              {!isEditChannelNameTrimmed ? <p className="text-xs text-destructive">Name must not have leading/trailing whitespace.</p> : null}
              {isEditChannelNameTooLong ? <p className="text-xs text-destructive">Name must be {CHANNEL_NAME_MAX} characters or fewer.</p> : null}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="edit-channel-slug">Slug</Label>
            <Input id="edit-channel-slug" value={String(editChannel?.slug || '')} readOnly disabled />
          </div>

          <div className="space-y-1">
            <Label htmlFor="edit-channel-topic">Topic (optional)</Label>
            <Input
              id="edit-channel-topic"
              placeholder="What’s this channel for?"
              value={editChannelTopic}
              onChange={e => setEditChannelTopic(String(e.target.value || ''))}
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <Label htmlFor="edit-channel-private">Private</Label>
              <p className="text-xs text-muted-foreground">Only explicitly added members can read/write.</p>
            </div>
            <Switch id="edit-channel-private" checked={editChannelPrivate} onCheckedChange={setEditChannelPrivate} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={closeEditChannel} disabled={updateChannel.isPending}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canSaveChannelEdit}
            onClick={async () => {
              if (!editChannel?.conversationId) return
              await updateChannel.mutateAsync({
                starshipId,
                channelId: String(editChannel.conversationId),
                name: editChannelName,
                isPrivate: editChannelPrivate,
                topic: editChannelTopic.trim().length > 0 ? editChannelTopic : null,
              })
              closeEditChannel()
            }}
          >
            {updateChannel.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  const deleteChannelDialog = (
    <Dialog
      open={Boolean(deleteChannelTarget)}
      onOpenChange={open => {
        if (!open) closeDeleteChannel()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete channel</DialogTitle>
          <DialogDescription>This will permanently delete the channel and its conversation history.</DialogDescription>
        </DialogHeader>

        <div className="text-sm">
          <p className="text-foreground">
            Delete <span className="font-semibold">#{String(deleteChannelTarget?.slug || '').trim() || 'channel'}</span>?
          </p>
          <p className="text-xs text-muted-foreground mt-2">This can’t be undone.</p>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={closeDeleteChannel} disabled={deleteChannel.isPending}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!deleteChannelTarget?.conversationId || deleteChannel.isPending}
            onClick={async () => {
              const target = deleteChannelTarget
              if (!target?.conversationId) return
              // Prevent deleting the default channel from the UI (server/DB also enforce this).
              const slugLower = String(target.slug || '').trim().toLowerCase()
              if (slugLower === 'lobby') {
                closeDeleteChannel()
                return
              }
              await deleteChannel.mutateAsync({ starshipId, channelId: String(target.conversationId) })
              closeDeleteChannel()

              // If the user is currently viewing this channel, route away to a safe default.
              const viewing = typeof currentChannelSlug === 'string' && currentChannelSlug.trim().toLowerCase() === slugLower
              if (viewing && slug) {
                router.push(`/ship/${encodeURIComponent(slug)}`)
              }
            }}
          >
            {deleteChannel.isPending ? 'Deleting…' : 'Delete'}
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

    // Sidebar layout rule:
    // - Channels + Direct messages should each grow naturally with content.
    // - Each section should STOP growing once it reaches 50% of the available sidebar height.
    // - If a section doesn't have enough content to reach 50%, it should NOT stretch.
    // - When content exceeds 50%, the section should scroll internally.

    return (
      <>
        <div
          className="flex flex-col h-full min-h-0"
          // Reserve space for the divider gap so 50% + 50% doesn't overflow.
          style={{ ['--sidebar-half-h' as any]: 'calc((100% - 1.75rem) / 2)' }}
        >
          {/* Channels - content-sized so Direct messages starts right below */}
          <div className="flex flex-col flex-none min-h-0 rounded-lg overflow-hidden" style={{ maxHeight: 'var(--sidebar-half-h)' }}>
            <div className="w-full flex items-center justify-between h-6 pr-2">
              <button
                type="button"
                className={cn('flex-1 min-w-0 h-6 flex items-center rounded-lg border border-transparent text-muted-foreground px-1', 'hover:text-foreground hover:bg-muted/40 transition-colors')}
                style={{ justifyContent: 'flex-start' }}
                onClick={() => setIsChannelsExpanded(v => !v)}
                aria-expanded={isChannelsExpanded}
                aria-controls="sidebar-channels-list"
              >
                <div
                  className="flex-shrink-0"
                  style={{
                    width: '1rem',
                    height: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: 0,
                    marginRight: '0.25rem',
                  }}
                >
                  <Icon name={isChannelsExpanded ? 'chevron-down' : 'chevron-right'} className="w-3 h-3" />
                </div>
                <span className="text-[11px] font-semibold uppercase tracking-wide">Channels</span>
              </button>

              <button
                type="button"
                onClick={() => setIsCreateChannelOpen(true)}
                className="inline-flex items-center justify-center w-5 h-5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                aria-label="Create channel"
              >
                <Icon name="plus" className="w-3 h-3" />
              </button>
            </div>

            {isChannelsExpanded ? (
              <div id="sidebar-channels-list" className="flex-1 min-h-0 overflow-y-auto pr-1">
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
                    {channelsForDisplay.map(ch => {
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
                      const reactionCount = Number((notifUnread as any)?.reactionUnreadByConversationId?.[cid] ?? 0) || 0
                      const notifCount = mentionCount + reactionCount
                      const hasNotifBadge = notifCount > 0
                      const isDefaultChannel = String(ch.slug || '')
                        .trim()
                        .toLowerCase() === 'lobby'
                      return (
                        <div key={ch.conversationId}>
                          <div
                            className={cn(
                              'group relative rounded-lg flex items-center border w-full h-7 cursor-pointer text-[12.5px] px-1',
                              isActive
                                ? 'text-primary bg-primary/10 border-transparent'
                                : hasUnread || hasNotifBadge
                                  ? 'text-foreground border-transparent hover:bg-muted'
                                  : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-muted'
                            )}
                            style={{
                              justifyContent: 'flex-start',
                              transition: 'background-color 0.15s ease',
                              cursor: 'pointer',
                              minHeight: '28px',
                            }}
                            onClick={() => handleChannelClick(String(ch.slug))}
                          >
                            <div
                              className="flex-shrink-0 relative"
                              style={{
                                width: '1rem',
                                height: '1rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                margin: 0,
                                pointerEvents: 'none',
                              }}
                            >
                              <Icon
                                name="hash"
                                weight={isActive ? 'regular' : hasUnread || hasNotifBadge ? 'bold' : 'regular'}
                                className={cn('h-3 w-3', isActive ? 'text-primary' : hasUnread || hasNotifBadge ? 'text-foreground' : 'text-muted-foreground')}
                              />
                              {ch.isPrivate ? (
                                <span
                                  className={cn(
                                    'absolute bottom-0.5 right-0.5 inline-flex h-2 w-2 items-center justify-center rounded-[2px] transition-colors',
                                    // Match the row background so the icon reads cleanly over the hash.
                                    // For active rows, keep `bg-card` so the container doesn't visually disappear into the active row bg.
                                    isActive ? 'bg-card group-hover:bg-card' : 'bg-card group-hover:bg-muted',
                                    // Keep visible but not louder than unread/active styling.
                                    isActive ? 'text-primary/80' : hasUnread || hasNotifBadge ? 'text-foreground/70' : 'text-muted-foreground'
                                  )}
                                  title="Private channel"
                                  aria-label="Private channel"
                                >
                                  <Icon name="lock" weight="fill" className="h-2 w-2" />
                                </span>
                              ) : null}
                            </div>
                            <div
                              className={cn(
                                'whitespace-nowrap pointer-events-none min-w-0 flex-1 ml-1 flex items-center gap-1',
                                isActive ? 'text-primary font-medium' : hasUnread || hasNotifBadge ? 'text-foreground font-bold' : 'font-medium'
                              )}
                            >
                              <span className="truncate min-w-0">{label}</span>
                            </div>
                            <div className="ml-1 flex items-center justify-end gap-1">
                              {notifCount > 0 ? (
                                <span className="inline-flex items-center justify-center min-w-[14px] h-[14px] px-1 rounded-full bg-red-500/90 dark:bg-red-400/90 text-white text-[9px] leading-none font-semibold">
                                  {notifCount > 99 ? '99+' : String(notifCount)}
                                </span>
                              ) : null}
                              {canManageChannels ? (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button
                                      type="button"
                                      className={cn(
                                        // When hidden, don't reserve space so the badge can sit at the far right.
                                        // On hover (or when the menu is open), show the action button in the rightmost column.
                                        'hidden group-hover:inline-flex data-[state=open]:inline-flex focus-visible:inline-flex',
                                        'items-center justify-center w-6 h-6 rounded-md',
                                        // Offset the list's scroll padding (`pr-1`) so ⋮ aligns with the header "+" column.
                                        '-mr-1 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors'
                                      )}
                                      aria-label="Channel actions"
                                      onClick={e => {
                                        e.preventDefault()
                                        e.stopPropagation()
                                      }}
                                    >
                                      <Icon name="dots-vertical" className="w-3.5 h-3.5" />
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent
                                    align="end"
                                    side="right"
                                    sideOffset={8}
                                    onClick={e => {
                                      // Prevent row navigation when interacting with the menu.
                                      e.stopPropagation()
                                    }}
                                  >
                                    <DropdownMenuItem
                                      className="cursor-pointer"
                                      onSelect={e => {
                                        // IMPORTANT:
                                        // Do NOT call preventDefault() here; Radix uses it to keep the menu open.
                                        e.stopPropagation()
                                        openEditChannel(ch)
                                      }}
                                    >
                                      <Icon name="edit" className="h-4 w-4" />
                                      Edit
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      disabled={isDefaultChannel}
                                      className="cursor-pointer text-destructive focus:text-destructive"
                                      onSelect={e => {
                                        e.stopPropagation()
                                        if (isDefaultChannel) return
                                        openDeleteChannel(ch)
                                      }}
                                    >
                                      <Icon name="trash" className="h-4 w-4" />
                                      Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              ) : null}
                            </div>
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

          {/* Separator between Channels and Direct messages (keep this in navigation). */}
          <div className="my-1.5 mx-1 border-t border-border/60" role="separator" aria-hidden />

          {/* Direct messages - content-sized; capped at 50% height like Channels */}
          <div className="flex flex-col flex-none min-h-0 rounded-lg overflow-hidden" style={{ maxHeight: 'var(--sidebar-half-h)' }}>
            <div className="w-full flex items-center justify-between h-6 pr-2">
              <button
                type="button"
                className={cn('flex-1 min-w-0 h-6 flex items-center rounded-lg border border-transparent text-muted-foreground px-1', 'hover:text-foreground hover:bg-muted/40 transition-colors')}
                style={{ justifyContent: 'flex-start' }}
                onClick={() => setIsDirectMessagesExpanded(v => !v)}
                aria-expanded={isDirectMessagesExpanded}
                aria-controls="sidebar-direct-messages-list"
              >
                <div
                  className="flex-shrink-0"
                  style={{
                    width: '1rem',
                    height: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: 0,
                    marginRight: '0.25rem',
                  }}
                >
                  <Icon name={isDirectMessagesExpanded ? 'chevron-down' : 'chevron-right'} className="w-3 h-3" />
                </div>
                <span className="text-[11px] font-semibold uppercase tracking-wide">Direct messages</span>
              </button>
              {/* spacer to align with Channels "+" column */}
              <div className="w-5 h-5" />
            </div>

            {isDirectMessagesExpanded ? (
              <div id="sidebar-direct-messages-list" className="flex-1 min-h-0 overflow-y-auto pr-1">
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
        {editChannelDialog}
        {deleteChannelDialog}
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
                {channelsForDisplay.map(ch => {
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
                  const reactionCount = Number((notifUnread as any)?.reactionUnreadByConversationId?.[cid] ?? 0) || 0
                  const notifCount = mentionCount + reactionCount
                  const hasNotifBadge = notifCount > 0
                  return (
                    <div key={ch.conversationId}>
                      <div
                        className={cn('group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all', 'hover:bg-muted/50', isActive && 'bg-muted/70 shadow-sm')}
                        onClick={() => handleChannelClick(String(ch.slug))}
                      >
                        <span className="relative inline-flex items-center justify-center h-4 w-4 flex-shrink-0">
                          <Icon
                            name="hash"
                            weight={isActive ? 'regular' : hasUnread || hasNotifBadge ? 'bold' : 'regular'}
                            className={cn('h-4 w-4', isActive ? 'text-primary' : hasUnread || hasNotifBadge ? 'text-foreground' : 'text-muted-foreground')}
                          />
                          {ch.isPrivate ? (
                            <span
                              className={cn(
                                'absolute bottom-0.5 right-0.5 inline-flex h-2 w-2 items-center justify-center rounded-[2px] transition-colors',
                                // Match the row background so the icon reads cleanly over the hash.
                                // For active rows, keep `bg-card` so the container doesn't visually disappear into the active row bg.
                                isActive ? 'bg-card group-hover:bg-card' : 'bg-card group-hover:bg-muted/50',
                                isActive ? 'text-primary/80' : hasUnread || hasNotifBadge ? 'text-foreground/70' : 'text-muted-foreground'
                              )}
                              title="Private channel"
                              aria-label="Private channel"
                            >
                              <Icon name="lock" weight="fill" className="h-2 w-2" />
                            </span>
                          ) : null}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1 min-w-0 flex-1">
                              <p
                                className={cn(
                                  'text-sm truncate min-w-0',
                                  isActive ? 'text-primary font-medium' : hasUnread || hasNotifBadge ? 'text-foreground font-bold' : 'text-muted-foreground font-medium'
                                )}
                              >
                                {label}
                              </p>
                            </div>
                            <span className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(ch.updatedAt || ch.createdAt), { addSuffix: false })}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5" />
                        </div>
                        {notifCount > 0 ? (
                          <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-red-500/90 dark:bg-red-400/90 text-white text-[10px] leading-none font-semibold">
                            {notifCount > 99 ? '99+' : String(notifCount)}
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
                  const reactionCount = Number(conversationId ? ((notifUnread as any)?.reactionUnreadByConversationId?.[conversationId] ?? 0) : 0) || 0
                  const notifCount = dmCount + reactionCount
                  return (
                    <div
                      key={t.key}
                      className={cn(
                        // Match channel row styling (spacing, hover, active background)
                        'group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all',
                        'hover:bg-muted/50',
                        isActive && 'bg-muted/70 shadow-sm',
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
                        <div className="flex items-center justify-between gap-2">
                          <p
                            className={cn(
                              'text-sm truncate',
                              // Match channel label styling
                              isActive ? 'text-primary font-medium' : hasUnread || notifCount > 0 ? 'text-foreground font-bold' : 'text-muted-foreground font-medium'
                            )}
                          >
                            {label}
                          </p>
                          <div className="flex items-center gap-1">
                            {notifCount > 0 ? (
                              <span className="inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-red-500/90 dark:bg-red-400/90 text-white text-[10px] leading-none font-semibold">
                                {notifCount > 99 ? '99+' : String(notifCount)}
                              </span>
                            ) : null}
                          </div>
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
      <div className="p-4 frosted-glass-light">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{dmTargets.length} people</span>
        </div>
      </div>
      {createChannelDialog}
      {editChannelDialog}
      {deleteChannelDialog}
    </div>
  )
})
