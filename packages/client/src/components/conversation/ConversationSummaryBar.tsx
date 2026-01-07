'use client'

import AgentAvatar from '@/components/animated/AgentAvatar'
import { Avatar } from '@/components/ui/avatar'
import { useStarshipConversations, useConversationAgents } from '@/hooks/useConversations'
import { useMessageAttachments } from '@/hooks/useFileUpload'
import { formatAgentDisplayName } from '@/lib/agentDisplay'
import { motion } from 'motion/react'
import { useMemo, useEffect, useRef } from 'react'

interface ConversationSummaryBarProps {
  conversationId: string | null
  starshipId: string
}

interface ConversationAgent {
  id?: string
  name: string
  role?: string
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

  // Use a key based on conversationId to ensure smooth remount animations
  // This helps coordinate the animation when transitioning from starter page
  const animationKey = useMemo(() => conversationId || 'none', [conversationId])

  // Track if this is the initial mount to prevent animation on page reload
  const isInitialMountRef = useRef(true)
  useEffect(() => {
    // Mark initial mount as complete after a short delay
    const timer = setTimeout(() => {
      isInitialMountRef.current = false
    }, 100)
    return () => clearTimeout(timer)
  }, [])

  // Reserve space even when loading to prevent layout shift
  if (!conversationId || !currentConversation) {
    return (
      <div className="sticky top-0 z-10 bg-gradient-to-b from-background via-background to-background/95 backdrop-blur-md" style={{ minHeight: '72px' }}>
        <div className="px-4 py-3.5">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
                <div className="h-6 w-48 bg-muted/30 rounded animate-pulse" />
                <div className="h-4 w-32 bg-muted/20 rounded" />
              </div>
            </div>
          </div>
        </div>
      </div>
    )
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
      key={animationKey}
      initial={isInitialMountRef.current ? { opacity: 1, y: 0 } : { opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        isInitialMountRef.current
          ? { duration: 0 }
          : {
              duration: 0.5,
              delay: 0.1,
              ease: [0.25, 0.46, 0.45, 0.94],
            }
      }
      className="sticky top-0 z-10 bg-gradient-to-b from-background via-background to-background/95 backdrop-blur-md"
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
                      <div key={agent.id ?? agent.slug ?? agent.name} className="inline-flex items-center gap-1.5 max-w-[14rem]" title={formatAgentDisplayName(agent)}>
                        <Avatar className="h-4 w-4 ring-1 ring-border/40">
                          <AgentAvatar seed={agent.name} imageUrl={avatarUrlById.get((agent as any).avatarAttachmentId)} size={16} />
                        </Avatar>
                        <span className="truncate font-medium leading-none">{formatAgentDisplayName(agent)}</span>
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
