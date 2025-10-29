'use client'

import { useStarshipUIStore } from '@/store/starship-ui-store'
import { useStarshipConversations } from '@/hooks/useConversations'
import { useConversationUsageTotals } from '@/hooks/useUsage'
import { cn } from '@/lib/utils'
import Icon from '@/components/primitives/Icon'
import { motion } from 'motion/react'

interface ConversationSummaryBarProps {
  conversationId: string | null
  starshipId: string
}

export function ConversationSummaryBar({ conversationId, starshipId }: ConversationSummaryBarProps) {
  // Fetch all conversations to get the current one's details
  const { data: starshipConversationsData } = useStarshipConversations(starshipId || '', true)
  const currentConversation = starshipConversationsData?.conversations?.find(c => c.id === conversationId)

  // Fetch conversation usage/cost data with refetch capability
  const { data: usageData } = useConversationUsageTotals(conversationId)

  if (!conversationId || !currentConversation) {
    return null
  }

  const title = currentConversation?.title || `Conversation ${String(conversationId).slice(0, 8)}`
  const updatedAt = new Date(currentConversation?.updatedAt || currentConversation?.createdAt || '')
  const createdAt = new Date(currentConversation?.createdAt || '')

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

  // Calculate stats
  const totalCost = usageData?.cost || 0

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="sticky top-0 z-10 bg-gradient-to-b from-background via-background to-background/95 border-b border-border/50 backdrop-blur-md shadow-sm"
    >
      <div className="px-4 py-3.5">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between gap-4">
            {/* Column 1: Icon (vertically centered) */}
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex-shrink-0">
              <Icon name="message-square" className="w-5 h-5 text-primary" />
            </div>

            {/* Column 2: Title and metadata (stacked) */}
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
              {/* Title */}
              <h3 className="text-base font-semibold text-foreground truncate tracking-tight leading-tight">{title}</h3>

              {/* Metadata row */}
              <div className="flex items-center gap-3 text-xs leading-none">
                {/* Last updated */}
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Icon name="clock" className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="font-medium leading-none">Updated {formatDate(updatedAt)}</span>
                </div>

                {/* Divider */}
                <div className="h-3.5 w-px bg-border/60" />

                {/* Created date */}
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Icon name="calendar" className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="leading-none">Created {formatDate(createdAt)}</span>
                </div>
              </div>
            </div>

            {/* Right: Stats badges */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <motion.div
                key={`cost-${totalCost}`}
                initial={{ scale: 0.95, opacity: 0.8 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-semibold',
                  totalCost > 0.01 ? 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                )}
              >
                <Icon name="coins" className="w-3.5 h-3.5" />
                <span className="text-xs">${totalCost.toFixed(2)}</span>
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
