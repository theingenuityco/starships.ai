'use client'

import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import AgentAvatar from '@/components/animated/AgentAvatar'
import type { Agent } from '@/lib/api'
import { useMessageAttachments } from '@/hooks/useFileUpload'
import { formatAgentDisplayName } from '@/lib/agentDisplay'
import { useMemo } from 'react'

interface ConversationAgentCardProps {
  agent: Agent
  isSelected: boolean
  onClick: () => void
  starshipId?: string
}

export function ConversationAgentCard({ agent, isSelected, onClick, starshipId }: ConversationAgentCardProps) {
  const description = (agent as any)?.description as string | undefined
  const avatarAttachmentId = (agent as any)?.avatarAttachmentId as string | undefined
  const ids = useMemo(() => (avatarAttachmentId ? [avatarAttachmentId] : []), [avatarAttachmentId])
  const { data: attachments = [] } = useMessageAttachments(ids, starshipId)
  const avatarUrl = attachments?.[0]?.previewUrl

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex w-full items-start gap-3 rounded-xl border bg-card/95 p-3 text-left transition-all duration-150',
        'hover:bg-primary/5 hover:border-primary/40',
        isSelected && 'border-primary/70 bg-primary/8 shadow-sm'
      )}
      aria-pressed={isSelected}
    >
      <Avatar className={cn('h-9 w-9 flex-shrink-0 ring-1 ring-border/40 bg-muted flex items-center justify-center', isSelected && 'ring-primary/70 bg-primary/10')}>
        <AgentAvatar seed={agent.name} imageUrl={avatarUrl} size={32} rounded />
      </Avatar>

      <div className="flex-1 min-w-0 space-y-1">
        <p className={cn('truncate text-sm font-medium text-foreground', isSelected && 'text-primary', 'group-hover:text-primary')}>{formatAgentDisplayName(agent)}</p>

        {description && <p className="line-clamp-2 text-xs text-muted-foreground group-hover:text-foreground/80">{description}</p>}
      </div>
    </button>
  )
}
