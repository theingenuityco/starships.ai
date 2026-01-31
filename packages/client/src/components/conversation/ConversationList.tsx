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
import { Avatar } from '../ui/avatar'
import AgentAvatar from '@/components/animated/AgentAvatar'
import { useMessageAttachments } from '@/hooks/useFileUpload'
import { formatAgentDisplayName } from '@/lib/agentDisplay'

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
    <Avatar className="h-5 w-5 ring-1 ring-border/40">
      <AgentAvatar seed={agent?.name || 'DM'} imageUrl={previewUrl} size={20} rounded />
    </Avatar>
  )
}

export function ConversationList({ starshipId, onConversationDelete, onConversationSelect, compact = false }: ConversationListProps) {
  const router = useRouter()
  const params = useParams()
  const slug = params.slug as string
  // Get conversationId directly from params - no prop needed
  const currentConversationId = params.conversationId as string | undefined

  const { data: dmData, isLoading: dmsLoading, error: dmsError } = useStarshipDirectMessages(starshipId, true)
  const { data: channelsData, isLoading: channelsLoading } = useStarshipChannels(starshipId, true)
  const createChannel = useCreateChannel()
  const [searchQuery, setSearchQuery] = useState('')
  const [isCreateChannelOpen, setIsCreateChannelOpen] = useState(false)
  const [newChannelSlug, setNewChannelSlug] = useState('')
  const [newChannelName, setNewChannelName] = useState('')
  const [newChannelPrivate, setNewChannelPrivate] = useState(false)
  const channels = (channelsData?.channels || []) as ChannelModel[]

  const directMessages = (dmData?.directMessages || []) as DirectMessageListItem[]
  const filteredDirectMessages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const base = directMessages.filter(it => Boolean(it?.dm?.conversationId))
    if (!q) return base
    return base.filter(it => {
      const agentName = it.agent ? formatAgentDisplayName(it.agent) : ''
      const title = it.conversation?.title || ''
      return agentName.toLowerCase().includes(q) || title.toLowerCase().includes(q)
    })
  }, [directMessages, searchQuery])

  const renderCompactDirectMessage = (it: DirectMessageListItem) => {
    const conversationId = String(it.dm.conversationId)
    const isActive = conversationId === currentConversationId
    const label = it.agent ? formatAgentDisplayName(it.agent) : it.conversation?.title || `DM ${conversationId.slice(0, 8)}`

    return (
      <div
        key={conversationId}
        className={cn(
          'group flex items-center gap-2 py-2 pl-2 pr-1.5 rounded-lg transition-colors text-xs relative border cursor-pointer',
          isActive ? 'text-primary bg-primary/10 border-transparent' : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-muted'
        )}
        onClick={() => handleConversationClick(conversationId)}
      >
        <DirectMessageAvatar starshipId={starshipId} agent={it.agent} />
        <div className="flex-1 min-w-0">
          <p className={cn('text-[12px] font-medium truncate leading-tight', isActive && 'text-primary')}>{label}</p>
        </div>
        {onConversationDelete && (
          <div className="flex-shrink-0" onClick={e => e.stopPropagation()}>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={e => {
                    e.preventDefault()
                    e.stopPropagation()
                  }}
                  onMouseDown={e => {
                    e.preventDefault()
                    e.stopPropagation()
                  }}
                  type="button"
                >
                  <Icon name="dots-vertical" className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40" side="left" sideOffset={8}>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={e => {
                    e.preventDefault()
                    e.stopPropagation()
                    onConversationDelete(conversationId)
                  }}
                >
                  <Icon name="trash" className="mr-2 h-3 w-3" />
                  <span className="text-xs">Delete</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
    )
  }

  const handleConversationClick = (conversationId: string) => {
    router.push(`/ship/${slug}/conversations/${conversationId}`)
    onConversationSelect?.(conversationId)
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
            <Input id="channel-name" placeholder="General" value={newChannelName} onChange={e => setNewChannelName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="channel-slug">Slug</Label>
            <Input id="channel-slug" placeholder="general" value={newChannelSlug} onChange={e => setNewChannelSlug(e.target.value)} />
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
    if (dmsLoading) {
      return (
        <div className="space-y-1">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-8 w-full rounded-lg" />
          ))}
        </div>
      )
    }

    if (dmsError) {
      return (
        <div className="flex flex-col items-center justify-center py-8 px-2">
          <p className="text-muted-foreground text-xs text-center">Failed to load direct messages</p>
        </div>
      )
    }

    return (
      <>
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-medium text-muted-foreground">Channels</span>
            <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setIsCreateChannelOpen(true)}>
              <Icon name="plus" className="h-3 w-3 mr-1" />
              New
            </Button>
          </div>

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
                const label = ch.slug ? `#${ch.slug}` : ch.name
                return (
                  <div key={ch.conversationId}>
                    <div
                      className={cn(
                        'group flex items-center gap-2 py-2 pl-2 pr-1.5 rounded-lg transition-colors text-xs relative border cursor-pointer',
                        isActive ? 'text-primary bg-primary/10 border-transparent' : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-muted'
                      )}
                      onClick={() => handleConversationClick(ch.conversationId)}
                    >
                      <span className={cn('font-mono text-[12px]', isActive ? 'text-primary' : 'text-muted-foreground')}>#</span>
                      <div className="flex-1 min-w-0">
                        <div className={cn('text-[12px] font-medium truncate leading-tight', isActive && 'text-primary')}>{label}</div>
                        {ch.isPrivate && <div className="text-[11px] text-muted-foreground">Private</div>}
                      </div>
                    </div>

                    {/* Forum channels render threads in the main panel (no nested sidebar list). */}
                  </div>
                )
              })}
            </div>
          )}

          <div className="pt-1">
            {filteredDirectMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 px-2">
                <Icon name="message-square" className="w-8 h-8 text-muted-foreground/30 mb-2" />
                <p className="text-muted-foreground text-xs text-center">No direct messages yet</p>
              </div>
            ) : (
              <>{filteredDirectMessages.map(it => renderCompactDirectMessage(it))}</>
            )}
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
          <h2 className="text-base font-semibold">Messages</h2>
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
                  const label = ch.slug ? `#${ch.slug}` : ch.name
                  return (
                    <div key={ch.conversationId}>
                      <div
                        className={cn('group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all', 'hover:bg-muted/50', isActive && 'bg-muted/70 shadow-sm')}
                        onClick={() => handleConversationClick(ch.conversationId)}
                      >
                        <span className={cn('text-xs font-mono', isActive ? 'text-primary' : 'text-muted-foreground')}>#</span>
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
            {dmsLoading ? (
              <div className="space-y-1 px-2">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-8 w-full rounded-lg" />
                ))}
              </div>
            ) : filteredDirectMessages.length === 0 ? (
              <div className="px-2 py-6 text-center text-xs text-muted-foreground">No direct messages yet</div>
            ) : (
              <div className="space-y-1">
                {filteredDirectMessages.map(it => {
                  const conversationId = String(it.dm.conversationId)
                  const isActive = conversationId === currentConversationId
                  const label = it.agent ? formatAgentDisplayName(it.agent) : it.conversation?.title || `DM ${conversationId.slice(0, 8)}`
                  const updatedAt = it.conversation?.updatedAt || it.conversation?.createdAt || it.dm.updatedAt || it.dm.createdAt
                  return (
                    <div
                      key={conversationId}
                      className={cn('group flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all', 'hover:bg-muted/50', isActive && 'bg-muted/70 shadow-sm')}
                      onClick={() => handleConversationClick(conversationId)}
                    >
                      <DirectMessageAvatar starshipId={starshipId} agent={it.agent} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1 gap-2">
                          <p className={cn('text-sm font-medium truncate', isActive && 'text-primary')}>{label}</p>
                          {updatedAt && (
                            <span className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(updatedAt), {
                                addSuffix: false,
                              })}
                            </span>
                          )}
                        </div>
                      </div>
                      {onConversationDelete && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Icon name="dots-vertical" className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={e => {
                                e.stopPropagation()
                                onConversationDelete(conversationId)
                              }}
                            >
                              <Icon name="trash" className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
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
          <span>{filteredDirectMessages.length} direct messages</span>
        </div>
      </div>
      {createChannelDialog}
    </div>
  )
}
