'use client'

import React from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MessageSquare, Sparkles, Clock } from 'lucide-react'
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
    <Card
      className={cn(
        'frosted-glass-card shadow-frosted-lg hover:shadow-frosted-lg border-2 !border-primary/30 hover:!border-primary/70 group relative overflow-hidden transition-all duration-300',
        className
      )}
    >
      {/* Frosted glass gradient with visible tint that expands on hover */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-transparent to-transparent opacity-30 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

      {/* Sparkle decoration */}
      <div className="absolute top-2 right-2 opacity-30 group-hover:opacity-60 transition-opacity duration-300">
        <Sparkles className="h-6 w-6 text-primary animate-pulse" />
      </div>

      <CardHeader className="relative z-10 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-primary">
          <MessageSquare className="h-4 w-4" />
          {hasConversations ? 'Recent Conversation' : 'Start Conversations'}
        </CardTitle>
      </CardHeader>

      <CardContent className="relative z-10 pt-0">
        {hasConversations ? (
          <>
            <div className="text-base font-semibold mb-1 line-clamp-1">{recentConversation.title || 'Untitled'}</div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-4">
              <Clock className="h-3 w-3" />
              {formatTimeAgo(recentConversation.updatedAt)}
            </div>
            <Button asChild size="sm" className="w-full">
              <Link href={`/ship/${starshipSlug}/conversations/${recentConversation.id}`}>
                <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                Continue Chat
              </Link>
            </Button>
          </>
        ) : (
          <>
            <div className="text-2xl font-bold mb-1">—</div>
            <div className="text-xs text-muted-foreground mb-4">Deploy agents to start chatting</div>
            <Button asChild size="sm" className="w-full">
              <Link href={`/ship/${starshipSlug}/conversations`}>
                <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                Get Started
              </Link>
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
