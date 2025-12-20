'use client'

import AgentAvatar from '@/components/animated/AgentAvatar'
import { Avatar } from '@/components/ui/avatar'
import { useStarshipConversations, useConversationAgents } from '@/hooks/useConversations'
import { useMessageAttachments } from '@/hooks/useFileUpload'
import { motion } from 'motion/react'
import { useMemo } from 'react'

interface ConversationSummaryBarProps {
  conversationId: string | null
  starshipId: string
}

interface ConversationAgent {
  id?: string
  name: string
  slug?: string
  model?: string
  avatarAttachmentId?: string
}

export function ConversationSummaryBar({ conversationId, starshipId }: ConversationSummaryBarProps) {
  // Fetch all conversations to get the current one's details
  const { data: starshipConversationsData } = useStarshipConversations(starshipId || '', true)
  const currentConversation = starshipConversationsData?.conversations?.find(c => c.id === conversationId)

  // Derive agents for this conversation (same source as the left navigation list)
  const { data: convAgents = [] } = useConversationAgents(conversationId)
  const agents = useMemo(() => (Array.isArray(convAgents) ? (convAgents as ConversationAgent[]) : []), [convAgents])
  const maxToShow = 4
  const visibleAgents = agents.slice(0, maxToShow)
  const remaining = agents.length - visibleAgents.length

  const avatarAttachmentIds = useMemo(() => {
    return visibleAgents.map(a => (a as any).avatarAttachmentId as string | undefined).filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
  }, [visibleAgents])
  const { data: avatarAttachments = [] } = useMessageAttachments(avatarAttachmentIds, starshipId)
  const avatarUrlById = useMemo(() => new Map(avatarAttachments.map(a => [a.id, a.previewUrl] as const)), [avatarAttachments])

  if (!conversationId || !currentConversation) {
    return null
  }

  const title = currentConversation?.title || `Conversation ${String(conversationId).slice(0, 8)}`
  const updatedAt = new Date(currentConversation?.updatedAt || currentConversation?.createdAt || '')

  // Format dates
  const formatDate = (date: Date) => {
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="sticky top-0 z-10 bg-gradient-to-b from-background via-background to-background/95 backdrop-blur-md shadow-sm"
    >
      <div className="px-4 py-3.5">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between gap-4">
            {/* Title and metadata (stacked) */}
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
              {/* Title */}
              <h3 className="text-xl font-semibold text-foreground truncate tracking-tight leading-tight">{title}</h3>

              {/* Agents + updated row */}
              <div className="flex flex-wrap items-center gap-2 text-xs leading-none text-muted-foreground">
                {agents.length > 0 ? (
                  <>
                    {visibleAgents.map(agent => (
                      <div key={agent.id ?? agent.slug ?? agent.name} className="inline-flex items-center gap-1.5 max-w-[14rem]" title={agent.name}>
                        <Avatar className="h-4 w-4 ring-1 ring-border/40">
                          <AgentAvatar seed={agent.name} imageUrl={avatarUrlById.get((agent as any).avatarAttachmentId)} size={16} />
                        </Avatar>
                        <span className="truncate font-medium leading-none">{agent.name}</span>
                      </div>
                    ))}
                    {remaining > 0 ? <span className="text-muted-foreground/70">+{remaining}</span> : null}

                    <span className="inline-flex items-center gap-2 whitespace-nowrap">
                      <span aria-hidden="true" className="h-3 w-px bg-border/60" />
                      <span className="font-medium leading-none">Updated {formatDate(updatedAt)}</span>
                    </span>
                  </>
                ) : (
                  <span className="font-medium leading-none">Updated {formatDate(updatedAt)}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
