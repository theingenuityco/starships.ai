'use client'

import { useStarshipConversations } from '@/hooks/useConversations'
import { cn } from '@/lib/utils'
import type { ConversationModel } from '@starships/protocol'
import { formatDistanceToNow } from 'date-fns'
import { Archive, MessageSquare, MoreVertical, Trash2 } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '../ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../ui/dropdown-menu'
import { ScrollArea } from '../ui/scroll-area'
import { Skeleton } from '../ui/skeleton'

interface ConversationListProps {
  starshipId: string
  onConversationDelete?: (conversationId: string) => void
  onConversationArchive?: (conversationId: string) => void
  onConversationSelect?: (conversationId: string) => void
}

export function ConversationList({ starshipId, onConversationDelete, onConversationArchive, onConversationSelect }: ConversationListProps) {
  const router = useRouter()
  const params = useParams()
  const slug = params.slug as string
  // Get conversationId directly from params - no prop needed
  const currentConversationId = params.conversationId as string | undefined

  // Override default query options to prevent refetching on route changes
  const { data, isLoading, error } = useStarshipConversations(starshipId, true)
  const [searchQuery, setSearchQuery] = useState('')

  // Filter conversations based on search
  const filteredConversations =
    data?.conversations?.filter(conv => {
      if (!searchQuery) return true
      const metadata = conv.metadata as any
      const title = metadata?.title || `Conversation ${conv.id.slice(0, 8)}`
      return title.toLowerCase().includes(searchQuery.toLowerCase())
    }) || []

  // Group conversations by date
  const groupedConversations = filteredConversations.reduce(
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

  const handleConversationClick = (conversationId: string) => {
    router.push(`/ship/${slug}/conversations/${conversationId}`)
    onConversationSelect?.(conversationId)
  }

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold mb-3">Conversations</h2>
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-4">
        <p className="text-muted-foreground text-sm">Failed to load conversations</p>
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
              <MessageSquare className="w-12 h-12 text-muted-foreground/30 mb-3" />
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
                        const metadata = conversation.metadata as any
                        const title = metadata?.title || `Conversation ${conversation.id.slice(0, 8)}`
                        const preview = metadata?.lastMessage || 'No messages yet'
                        const isActive = conversation.id === currentConversationId

                        return (
                          <div
                            key={conversation.id}
                            className={cn('group flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all', 'hover:bg-muted/50', isActive && 'bg-muted/70 shadow-sm')}
                            onClick={() => handleConversationClick(conversation.id)}
                          >
                            {/* Conversation Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1">
                                <p className={cn('text-sm font-medium truncate', isActive && 'text-primary')}>{title}</p>
                                <span className="text-xs text-muted-foreground">
                                  {formatDistanceToNow(new Date(conversation.lastActivityAt || conversation.createdAt), {
                                    addSuffix: false,
                                  })}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground truncate">{preview}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs text-muted-foreground">{conversation.messageCount || 0} messages</span>
                                {conversation.status === 'archived' && <span className="text-xs bg-muted px-1.5 py-0.5 rounded">Archived</span>}
                              </div>
                            </div>

                            {/* Actions Menu */}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem
                                  onClick={e => {
                                    e.stopPropagation()
                                    onConversationArchive?.(conversation.id)
                                  }}
                                >
                                  <Archive className="mr-2 h-4 w-4" />
                                  Archive
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={e => {
                                    e.stopPropagation()
                                    onConversationDelete?.(conversation.id)
                                  }}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
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
