'use client'

import Icon from '@/components/primitives/Icon'

import { useCreateChannel, useStarshipChannels, useStarshipDirectMessages, type DirectMessageListItem } from '@/hooks/useConversations'
import { cn } from '@/lib/utils'
import type { AgentModel, ChannelModel, ConversationModel } from '@starships/protocol'
import { formatDistanceToNow } from 'date-fns'

import { useParams, useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
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
import { useMessageAttachments } from '@/hooks/useFileUpload'
import { formatAgentDisplayName } from '@/lib/agentDisplay'
import { useStarshipAgents } from '@/hooks/useAgents'
import { useStarshipMembersAndInvites, type StarshipMemberListItem } from '@/hooks/useStarshipMembers'
import { useAuthContext } from '@/providers/auth-provider'

interface ConversationListProps {
  starshipId: string
  onConversationDelete?: (conversationId: string) => void
  onConversationSelect?: (conversationId: string) => void
  compact?: boolean
}

function DirectMessageAvatar({ starshipId, agent }: { starshipId: string; agent: AgentModel | null }) {
  const avatarAttachmentIds = useMemo(() => {
    const id = agent?.avatarAttachmentId
    return typeof id === 'string' && id.trim().length > 0 ? [id] : []
  }, [agent?.avatarAttachmentId])
  const { data: avatarAttachments = [] } = useMessageAttachments(avatarAttachmentIds, starshipId)
  const previewUrl = avatarAttachments?.[0]?.previewUrl

  return (
    <Avatar className="h-5 w-5 rounded-full ring-1 ring-border/40">
      <AgentAvatar seed={agent?.name || 'DM'} imageUrl={previewUrl} size={20} rounded />
    </Avatar>
  )
}

function HumanAvatar({ user }: { user: StarshipMemberListItem }) {
  const fallback = (user.displayName || user.email || '?').trim().slice(0, 1).toUpperCase()
  return (
    <Avatar className="h-5 w-5 rounded-full ring-1 ring-border/40">
      {user.avatar ? <AvatarImage src={user.avatar} alt={user.displayName || user.email || 'User'} referrerPolicy="no-referrer" crossOrigin="anonymous" className="object-cover" /> : null}
      <AvatarFallback className="rounded-full bg-primary/10 text-primary text-[10px] font-semibold">{fallback}</AvatarFallback>
    </Avatar>
  )
}

type DmTarget = { kind: 'agent'; key: string; label: string; agent: AgentModel } | { kind: 'user'; key: string; label: string; user: StarshipMemberListItem }

export function ConversationList({ starshipId, onConversationDelete, onConversationSelect, compact = false }: ConversationListProps) {
  const router = useRouter()
  const params = useParams()
  const slug = params.slug as string
  // Get conversationId directly from params - no prop needed
  const currentConversationId = params.conversationId as string | undefined

  const { data: channelsData, isLoading: channelsLoading } = useStarshipChannels(starshipId, true)
  const { data: directMessagesData, isLoading: directMessagesLoading } = useStarshipDirectMessages(starshipId, true)
  const { data: agentsData, isLoading: agentsLoading, error: agentsError } = useStarshipAgents(starshipId, true)
  const { data: membersData, isLoading: membersLoading, error: membersError } = useStarshipMembersAndInvites(starshipId, true)
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

  const renderCompactDmTarget = (t: DmTarget) => {
    const label = t.label
    const isBusy = directMessagesLoading
    const isActive = false

    return (
      <div
        key={t.key}
        className={cn(
          'group relative rounded-lg flex items-center border w-full h-8 cursor-pointer text-sm px-2',
          isActive ? 'text-primary bg-primary/10 border-transparent' : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-muted',
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
          {t.kind === 'agent' ? <DirectMessageAvatar starshipId={starshipId} agent={t.agent} /> : <HumanAvatar user={t.user} />}
        </div>
        <span className={cn('whitespace-nowrap pointer-events-none font-medium truncate min-w-0 flex-1 ml-1.5', isActive && 'text-primary')}>{label}</span>
      </div>
    )
  }

  const handleConversationClick = (conversationId: string) => {
    router.push(`/ship/${slug}/conversations/${conversationId}`)
    onConversationSelect?.(conversationId)
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

  const openDraftDm = (args: { dmType: 'user_agent' | 'user_user'; agentId?: string; peerUserId?: string; peerLabel?: string; peerAvatar?: string }) => {
    const sp = new URLSearchParams()
    sp.set('dm', 'draft')
    sp.set('dmType', args.dmType)
    if (args.agentId) sp.set('agentId', args.agentId)
    if (args.peerUserId) sp.set('peerUserId', args.peerUserId)
    if (args.peerLabel) sp.set('peerLabel', args.peerLabel)
    if (args.peerAvatar) sp.set('peerAvatar', args.peerAvatar)
    router.push(`/ship/${slug}/dm?${sp.toString()}`)
  }

  const handleDmTargetClick = async (t: DmTarget) => {
    // Prevent race conditions: if DMs haven't loaded yet, we don't know whether a DM exists.
    // Clicking during this window can open draft views and later create duplicate DMs.
    if (directMessagesLoading) return

    // If an existing DM conversation exists, open it immediately (shows history).
    // Otherwise, open a draft DM view (no conversation yet) and create it on first send.
    if (t.kind === 'agent') {
      const existing = existingDmConversationIdByAgentId.get(String(t.agent.id))
      if (existing) {
        handleConversationClick(existing)
        return
      }
      openDraftDm({ dmType: 'user_agent', agentId: String(t.agent.id) })
      return
    }

    const peerId = String(t.user.userId)
    const existing = existingDmConversationIdByPeerUserId.get(peerId)
    if (existing) {
      handleConversationClick(existing)
      return
    }
    const peerLabel = (t.user.displayName || t.user.email || 'User').trim()
    const peerAvatar = typeof (t.user as any)?.avatar === 'string' ? String((t.user as any).avatar) : ''
    openDraftDm({ dmType: 'user_user', peerUserId: peerId, peerLabel, peerAvatar: peerAvatar || undefined })
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
              if (created?.conversationId) {
                handleConversationClick(String(created.conversationId))
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
          {/* Channels */}
          <div className={cn('flex flex-col min-h-0', isChannelsExpanded ? 'flex-1' : 'flex-none')}>
            <div className="w-full flex items-center justify-between h-8">
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
              <div id="sidebar-channels-list" className="min-h-0 flex-1 overflow-y-auto pr-1">
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
                      const isActive = ch.conversationId === currentConversationId
                      const label = ch.name || ch.slug
                      return (
                        <div key={ch.conversationId}>
                          <div
                            className={cn(
                              'group relative rounded-lg flex items-center border w-full h-8 cursor-pointer text-sm px-2',
                              isActive ? 'text-primary bg-primary/10 border-transparent' : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-muted'
                            )}
                            style={{
                              justifyContent: 'flex-start',
                              transition: 'background-color 0.15s ease',
                              cursor: 'pointer',
                              minHeight: '32px',
                            }}
                            onClick={() => handleConversationClick(ch.conversationId)}
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
                              <Icon name="hash" className={cn('h-4 w-4', isActive ? 'text-primary' : 'text-muted-foreground')} />
                            </div>
                            <span className={cn('whitespace-nowrap pointer-events-none font-medium truncate min-w-0 flex-1 ml-1.5', isActive && 'text-primary')}>{label}</span>
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

          <div className="h-2" />

          {/* Direct messages */}
          <div className={cn('flex flex-col min-h-0', isDirectMessagesExpanded ? 'flex-1' : 'flex-none')}>
            <div className="w-full flex items-center justify-between h-8">
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
              <div id="sidebar-direct-messages-list" className="min-h-0 flex-1 overflow-y-auto pr-1">
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
                  const isActive = ch.conversationId === currentConversationId
                  const label = ch.name || ch.slug
                  return (
                    <div key={ch.conversationId}>
                      <div
                        className={cn('group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all', 'hover:bg-muted/50', isActive && 'bg-muted/70 shadow-sm')}
                        onClick={() => handleConversationClick(ch.conversationId)}
                      >
                        <Icon name="hash" className={cn('h-4 w-4', isActive ? 'text-primary' : 'text-muted-foreground')} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className={cn('text-sm font-medium truncate', isActive && 'text-primary')}>{label}</p>
                            <span className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(ch.updatedAt || ch.createdAt), { addSuffix: false })}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">{ch.isPrivate && <span className="text-[10px] text-muted-foreground">Private</span>}</div>
                        </div>
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
                  return (
                    <div
                      key={t.key}
                      className={cn('group flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all', 'hover:bg-muted/50', isBusy && 'opacity-70 pointer-events-none')}
                      onClick={() => handleDmTargetClick(t)}
                    >
                      {t.kind === 'agent' ? <DirectMessageAvatar starshipId={starshipId} agent={t.agent} /> : <HumanAvatar user={t.user} />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1 gap-2">
                          <p className={cn('text-sm font-medium truncate')}>{label}</p>
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
