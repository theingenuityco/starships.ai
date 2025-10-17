'use client'

import Icon from '@/components/primitives/Icon'

import React from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

import { cn } from '@/lib/utils'

export interface ConversationActivityCardProps {
  starshipSlug: string
  recentConversation?: {
    id: string
    title?: string | null
    updatedAt?: string
  } | null
  conversationCount: number
  className?: string
}

export function ConversationActivityCard({ starshipSlug, recentConversation, conversationCount, className }: ConversationActivityCardProps): React.JSX.Element {
  const hasConversations = conversationCount > 0 && recentConversation

  const formatTimeAgo = (dateString?: string) => {
    if (!dateString) return 'Recently'

    const date = new Date(dateString)
    const now = new Date()
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

    if (diffInSeconds < 60) return 'Just now'
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`
    return `${Math.floor(diffInSeconds / 86400)}d ago`
  }

  return (
    <Card className={cn('frosted-glass-card shadow-frosted-lg flex flex-col', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Icon name="message-square" className="h-4 w-4" />
          {hasConversations ? 'Recent Conversation' : 'Start Conversations'}
        </CardTitle>
      </CardHeader>

      <CardContent className="pt-0 flex-1 flex flex-col">
        {hasConversations ? (
          <>
            <div className="text-base font-semibold mb-1 line-clamp-1">{recentConversation.title || 'Untitled'}</div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-4">
              <Icon name="clock" className="h-3 w-3" />
              {formatTimeAgo(recentConversation.updatedAt)}
            </div>
            <Button asChild size="sm" className="w-full">
              <Link href={`/ship/${starshipSlug}/conversations/${recentConversation.id}`}>
                <Icon name="message-square" className="h-3.5 w-3.5 mr-1.5" />
                Continue Chat
              </Link>
            </Button>
          </>
        ) : (
          <div className="flex flex-col h-full">
            <div className="flex-1 flex flex-col items-center text-center">
              <Icon name="help-circle" className="h-6 w-6 text-muted-foreground mb-2" />
              <div className="text-sm font-medium text-muted-foreground">No conversations yet</div>
              <div className="text-xs text-muted-foreground mb-4">Start a conversation with your agents to see recent activity</div>
            </div>
            <Button asChild size="sm" className="w-full">
              <Link href={`/ship/${starshipSlug}/conversations`}>
                <Icon name="message-square" className="h-3.5 w-3.5 mr-1.5" />
                Start a Conversation
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
