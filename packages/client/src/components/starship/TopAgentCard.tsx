'use client'

import Icon from '@/components/primitives/Icon'

import React from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import AgentAvatar from '@/components/animated/AgentAvatar'
import { cn } from '@/lib/utils'
import { useConversationAgents } from '@/hooks/useConversations'
import { useMessageAttachments } from '@/hooks/useFileUpload'
import { useMemo } from 'react'

type TopAgentCardProps = {
  starshipSlug: string
  recentConversationId?: string | null
  className?: string
}

export function TopAgentCard({ starshipSlug, recentConversationId, className }: TopAgentCardProps): React.JSX.Element {
  const { data: convAgents = [] } = useConversationAgents(recentConversationId || null)
  const topAgent = Array.isArray(convAgents) && convAgents.length > 0 ? convAgents[0] : null
  const avatarAttachmentId = (topAgent as any)?.avatarAttachmentId as string | undefined
  const ids = useMemo(() => (avatarAttachmentId ? [avatarAttachmentId] : []), [avatarAttachmentId])
  const { data: avatarAttachments = [] } = useMessageAttachments(ids, topAgent?.starshipId)
  const avatarUrl = avatarAttachments?.[0]?.previewUrl

  return (
    <Card className={cn('frosted-glass-card shadow-frosted-lg flex flex-col h-full', className)}>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Icon name="head-circuit" className="h-4 w-4" />
          Top Agent
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 flex-1 flex flex-col justify-between gap-4">
        {topAgent ? (
          <>
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10 ring-1 ring-border/40">
                <AgentAvatar seed={topAgent.name} imageUrl={avatarUrl} size={40} />
              </Avatar>
              <div className="min-w-0">
                <div className="text-lg font-semibold leading-tight truncate">{topAgent.name}</div>
                {topAgent.model && (
                  <div className="mt-1">
                    <Badge variant="secondary" className="text-[10px]">
                      {topAgent.model}
                    </Badge>
                  </div>
                )}
              </div>
            </div>
            <Button asChild size="sm" variant="outline" className="w-full border-primary text-primary hover:bg-primary/5">
              <Link href={`/ship/${starshipSlug}/conversations${topAgent.slug ? `?agent=${topAgent.slug}` : ''}`}>
                <Icon name="message-square" className="h-3.5 w-3.5 mr-1.5" />
                Message Agent
              </Link>
            </Button>
          </>
        ) : (
          <div className="flex flex-col h-full">
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <Icon name="help-circle" className="h-6 w-6 text-muted-foreground mb-2" />
              <div className="text-sm font-medium text-muted-foreground">No top agent yet</div>
              <div className="text-xs text-muted-foreground mb-4">Chat with agents and your most active one will appear here</div>
            </div>
            <Button asChild size="sm" variant="outline" className="w-full border-primary text-primary hover:bg-primary/5">
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
