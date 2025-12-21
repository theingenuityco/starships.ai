'use client'

import Icon from '@/components/primitives/Icon'

import { useStarshipConversations, useConversationAgents } from '@/hooks/useConversations'
import { cn } from '@/lib/utils'
import type { ConversationModel } from '@starships/protocol'
import { formatDistanceToNow } from 'date-fns'

import { useParams, useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { Button } from '../ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu'
import { ScrollArea } from '../ui/scroll-area'
import { Skeleton } from '../ui/skeleton'
import { Avatar } from '../ui/avatar'
import AgentAvatar from '@/components/animated/AgentAvatar'
import { useMessageAttachments } from '@/hooks/useFileUpload'

interface ConversationListProps {
  starshipId: string
  onConversationDelete?: (conversationId: string) => void
  onConversationSelect?: (conversationId: string) => void
  compact?: boolean
}

interface ConversationAgent {
  id?: string
  name: string
  slug?: string
  model?: string
  avatarAttachmentId?: string
}

function CompactConversationAgents({ conversationId, starshipId }: { conversationId: string; starshipId: string }) {
  const { data: convAgents = [] } = useConversationAgents(conversationId || null)

  const agents = Array.isArray(convAgents) ? (convAgents as ConversationAgent[]) : []
  const maxToShow = 2
  const visibleAgents = agents.slice(0, maxToShow)
  const remaining = agents.length - visibleAgents.length

  const avatarAttachmentIds = useMemo(() => {
    const ids = visibleAgents.map(a => (a as any).avatarAttachmentId as string | undefined).filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    return ids
  }, [visibleAgents])
  const { data: avatarAttachments = [] } = useMessageAttachments(avatarAttachmentIds, starshipId)
  const avatarUrlById = useMemo(() => new Map(avatarAttachments.map(a => [a.id, a.previewUrl] as const)), [avatarAttachments])

  if (!agents.length) return null

  return (
    <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground group-hover:text-foreground">
      {visibleAgents.map(agent => (
        <div key={agent.id ?? agent.slug ?? agent.name} className="flex items-center gap-1 max-w-[6rem]">
          <Avatar className="h-3.5 w-3.5 ring-1 ring-border/40">
            <AgentAvatar seed={agent.name} imageUrl={avatarUrlById.get((agent as any).avatarAttachmentId)} size={14} />
          </Avatar>
          <span className="truncate">{agent.name}</span>
        </div>
      ))}
      {remaining > 0 && <span className="text-[10px] text-muted-foreground/70 group-hover:text-foreground/80">+{remaining}</span>}
    </div>
  )
}

export function ConversationList({ starshipId, onConversationDelete, onConversationSelect, compact = false }: ConversationListProps) {
  const router = useRouter()
  const params = useParams()
  const slug = params.slug as string
  // Get conversationId directly from params - no prop needed
  const currentConversationId = params.conversationId as string | undefined

  // Override default query options to prevent refetching on route changes
  const { data, isLoading, error } = useStarshipConversations(starshipId, true)
  const [searchQuery, setSearchQuery] = useState('')

  // Filter conversations based on search and status
  const filteredConversations =
    data?.conversations?.filter(conv => {
      // Exclude archived conversations from the UI
      if (conv.status === 'archived') return false
      if (!searchQuery) return true
      const title = conv.title || `Conversation ${conv.id.slice(0, 8)}`
      return title.toLowerCase().includes(searchQuery.toLowerCase())
    }) || []

  // Build parent/child tree: root conversations and their children
  const roots: ConversationModel[] = []
  const childrenByParent: Record<string, ConversationModel[]> = {}

  for (const conv of filteredConversations) {
    const parentId = (conv as any).parentConversationId as string | undefined
    if (parentId) {
      if (!childrenByParent[parentId]) {
        childrenByParent[parentId] = []
      }
      childrenByParent[parentId].push(conv)
    } else {
      roots.push(conv)
    }
  }

  // Group root conversations by date for full view
  const groupedConversations = roots.reduce(
    (groups, conv) => {
      const date = new Date(conv.createdAt)
      const today = new Date()
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)
      const lastWeek = new Date(today)
      lastWeek.setDate(lastWeek.getDate() - 7)

      let groupKey = 'Older'
      if (date.toDateString() === today.toDateString()) {
        groupKey = 'Today'
      } else if (date.toDateString() === yesterday.toDateString()) {
        groupKey = 'Yesterday'
      } else if (date > lastWeek) {
        groupKey = 'This Week'
      }

      if (!groups[groupKey]) {
        groups[groupKey] = []
      }
      groups[groupKey].push(conv)
      return groups
    },
    {} as Record<string, ConversationModel[]>
  )

  // Helper render function for compact list (flat, but with visual indentation for children)
  const renderCompactConversation = (conversation: ConversationModel, isChild: boolean) => {
    const title = conversation.title || `Conversation ${conversation.id.slice(0, 8)}`
    const isActive = conversation.id === currentConversationId

    return (
      <div
        key={conversation.id}
        className={cn(
          'group flex items-center gap-1.5 py-1.5 pl-2 pr-1.5 rounded-lg transition-colors text-xs relative border cursor-pointer',
          isActive ? 'text-primary bg-primary/10 border-transparent' : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-muted'
        )}
        style={isChild ? { paddingLeft: '1.5rem' } : undefined}
      >
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleConversationClick(conversation.id)}>
          <p className={cn('text-[12px] font-medium truncate leading-tight', isActive && 'text-primary')}>{title}</p>
          <CompactConversationAgents conversationId={conversation.id} starshipId={starshipId} />
        </div>
        {/* Delete button - appears on hover */}
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
                    onConversationDelete(conversation.id)
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

  // Compact mode - inline display without header/search
  if (compact) {
    if (isLoading) {
      return (
        <div className="space-y-1">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-8 w-full rounded-lg" />
          ))}
        </div>
      )
    }

    if (error) {
      return (
        <div className="flex flex-col items-center justify-center py-8 px-2">
          <p className="text-muted-foreground text-xs text-center">Failed to load conversations</p>
        </div>
      )
    }

    return (
      <div className="space-y-0">
        {filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 px-2">
            <Icon name="message-square" className="w-8 h-8 text-muted-foreground/30 mb-2" />
            <p className="text-muted-foreground text-xs text-center">No conversations yet</p>
          </div>
        ) : (
          <>
            {roots.map(root => (
              <div key={root.id}>
                {renderCompactConversation(root, false)}
                {(childrenByParent[root.id] || []).map(child => renderCompactConversation(child, true))}
              </div>
            ))}
          </>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b">
        <h2 className="text-base font-semibold mb-2">Conversations</h2>

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
          {Object.keys(groupedConversations).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4">
              <Icon name="message-square" className="w-12 h-12 text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground text-sm text-center">No conversations yet</p>
              <p className="text-muted-foreground/70 text-xs text-center mt-1">Start a new conversation to get started</p>
            </div>
          ) : (
            <div className="space-y-4">
              {['Today', 'Yesterday', 'This Week', 'Older'].map(groupKey => {
                const conversations = groupedConversations[groupKey]
                if (!conversations || conversations.length === 0) return null

                return (
                  <div key={groupKey}>
                    <p className="text-xs font-medium text-muted-foreground px-2 mb-2">{groupKey}</p>
                    <div className="space-y-1">
                      {conversations.map((conversation: ConversationModel) => {
                        const title = conversation.title || `Conversation ${conversation.id.slice(0, 8)}`
                        const isActive = conversation.id === currentConversationId

                        const children = childrenByParent[conversation.id] || []

                        return (
                          <div key={conversation.id}>
                            <div
                              className={cn('group flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all', 'hover:bg-muted/50', isActive && 'bg-muted/70 shadow-sm')}
                              onClick={() => handleConversationClick(conversation.id)}
                            >
                              {/* Conversation Info */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-1">
                                  <p className={cn('text-sm font-medium truncate', isActive && 'text-primary')}>{title}</p>
                                  <span className="text-xs text-muted-foreground">
                                    {formatDistanceToNow(new Date(conversation.updatedAt || conversation.createdAt), {
                                      addSuffix: false,
                                    })}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 mt-1">{conversation.status === 'archived' && <span className="text-xs bg-muted px-1.5 py-0.5 rounded">Archived</span>}</div>
                              </div>

                              {/* Actions Menu */}
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
                                        onConversationDelete(conversation.id)
                                      }}
                                    >
                                      <Icon name="trash" className="mr-2 h-4 w-4" />
                                      Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </div>

                            {/* Child conversations */}
                            {children.length > 0 && (
                              <div className="mt-1 space-y-1 pl-6 border-l border-dashed border-border/60">
                                {children.map(child => {
                                  const childTitle = child.title || `Conversation ${child.id.slice(0, 8)}`
                                  const childActive = child.id === currentConversationId
                                  return (
                                    <div
                                      key={child.id}
                                      className={cn('group flex items-center gap-2 p-2 rounded-lg cursor-pointer text-xs transition-all', 'hover:bg-muted/40', childActive && 'bg-muted/70 shadow-sm')}
                                      onClick={() => handleConversationClick(child.id)}
                                    >
                                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground/80">Child</span>
                                      <span className={cn('truncate flex-1', childActive && 'text-primary font-medium')}>{childTitle}</span>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Footer Stats */}
      <div className="p-4 border-t frosted-glass-light">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{filteredConversations.length} conversations</span>
          <span>{filteredConversations.filter(c => c.status === 'active').length} active</span>
        </div>
      </div>
    </div>
  )
}
