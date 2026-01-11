'use client'

import AgentAvatar from '@/components/animated/AgentAvatar'
import Icon from '@/components/primitives/Icon'
import { Avatar } from '@/components/ui/avatar'
import { useConversationAgents, useConversationDetail } from '@/hooks/useConversations'
import { useMessageAttachments } from '@/hooks/useFileUpload'
import { useConversationUsageTotals } from '@/hooks/useUsage'
import { formatAgentDisplayName } from '@/lib/agentDisplay'
import { useModelContextLength } from '@/hooks/useLlmModels'
import { cn } from '@/lib/utils'
import { motion } from 'motion/react'
import { useMemo, useEffect, useRef } from 'react'

interface ConversationSummaryBarProps {
  conversationId: string | null
  starshipId: string
  /** Optional override for the active model id (e.g. selected agent model). */
  modelId?: string | null
  /** Optional override for the max token budget (used as denominator). */
  maxTokens?: number | null
}

interface ConversationAgent {
  id?: string
  name: string
  role?: string
  slug?: string
  model?: string
  avatarAttachmentId?: string
}

export function ConversationSummaryBar({ conversationId, starshipId, modelId, maxTokens }: ConversationSummaryBarProps) {
  // Fetch conversation detail directly (avoids pagination gaps in starship conversation lists)
  const { data: currentConversation, isLoading: isLoadingConversation } = useConversationDetail(conversationId)

  // Derive agents for this conversation (same source as the left navigation list)
  const { data: convAgents = [], isLoading: isLoadingAgents } = useConversationAgents(conversationId)
  const agents = useMemo(() => (Array.isArray(convAgents) ? (convAgents as ConversationAgent[]) : []), [convAgents])
  const maxToShow = 4
  const visibleAgents = agents.slice(0, maxToShow)
  const remaining = agents.length - visibleAgents.length

  const avatarAttachmentIds = useMemo(() => {
    return visibleAgents.map(a => (a as any).avatarAttachmentId as string | undefined).filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
  }, [visibleAgents])
  const hasAvatarIds = avatarAttachmentIds.length > 0
  const { data: avatarAttachments = [], isLoading: isLoadingAvatars } = useMessageAttachments(avatarAttachmentIds, starshipId)
  const avatarUrlById = useMemo(() => new Map(avatarAttachments.map(a => [a.id, a.previewUrl] as const)), [avatarAttachments])

  // Token indicator: utilization (server totals) vs max (model context window)
  const { data: totalsData } = useConversationUsageTotals(conversationId)
  const totalTokens = Number(totalsData?.totalTokens ?? 0)
  const totalCost = Number(totalsData?.cost ?? 0)
  const primaryModelId = useMemo(() => {
    const override = typeof modelId === 'string' && modelId.trim().length > 0 ? modelId.trim() : null
    if (override) return override
    const m = agents?.[0]?.model
    return typeof m === 'string' && m.trim().length > 0 ? m.trim() : null
  }, [agents, modelId])
  const { contextLength: maxContextTokens } = useModelContextLength(primaryModelId)
  const fallbackMaxTokens = useMemo(() => {
    const a0: any = agents?.[0]
    const raw = a0?.maxTokens ?? a0?.state?.maxTokens
    const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
    return Number.isFinite(n) && n > 0 ? n : null
  }, [agents])

  // Only render actual header when all data is ready to prevent layout shifts
  // If there are no avatars to load, don't wait for avatar loading
  const isDataReady = !isLoadingConversation && !isLoadingAgents && (hasAvatarIds ? !isLoadingAvatars : true) && !!currentConversation

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
  // Show placeholder if: no conversationId, no currentConversation, or data is still loading
  if (!conversationId || !isDataReady) {
    return (
      <div className="sticky top-0 z-10 bg-gradient-to-b from-background via-background to-background/95 backdrop-blur-md">
        <div className="px-4 py-3.5">
          <div className="max-w-4xl">
            <div className="flex items-center justify-between gap-4">
              {/* Title and metadata (stacked) - exact structural match */}
              <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
                {/* Title - exact match */}
                <h3 className="text-xl font-semibold text-foreground truncate tracking-tight leading-tight">
                  <span className="opacity-50">Loading...</span>
                </h3>
                {/* Agents + updated row - exact structural match with same classes */}
                <div className="flex flex-wrap items-center gap-2 text-xs leading-none text-muted-foreground">
                  {/* Agent placeholder - matches exact structure */}
                  <div className="inline-flex items-center gap-1.5 max-w-[14rem]">
                    <Avatar className="h-4 w-4 ring-1 ring-border/40">
                      <div className="h-4 w-4 rounded-full bg-muted/30 animate-pulse" />
                    </Avatar>
                    <span className="truncate font-medium leading-none opacity-50">Loading...</span>
                  </div>
                  {/* Separator and updated text - exact match */}
                  <span className="inline-flex items-center gap-2 whitespace-nowrap">
                    <span aria-hidden="true" className="h-3 w-px bg-border/60" />
                    <span className="font-medium leading-none opacity-50">Updated just now</span>
                  </span>
                  {/* Token indicator placeholder (reserved space) */}
                  <span className="inline-flex items-center gap-2 whitespace-nowrap">
                    <span aria-hidden="true" className="h-3 w-px bg-border/60" />
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/30 px-2 py-1 border border-border/40">
                      <div className="h-3 w-3 rounded bg-muted/40 animate-pulse" />
                      <span className="opacity-50 font-medium tabular-nums">—/—</span>
                    </span>
                  </span>
                  {/* Cost placeholder (reserved space) */}
                  <span className="inline-flex items-center gap-2 whitespace-nowrap">
                    <span aria-hidden="true" className="h-3 w-px bg-border/60" />
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/30 px-2 py-1 border border-border/40">
                      <div className="h-3 w-3 rounded bg-muted/40 animate-pulse" />
                      <span className="opacity-50 font-medium tabular-nums">$—</span>
                    </span>
                  </span>
                </div>
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

  const formatCompactTokens = (n: number) => new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n)
  const ctx = typeof maxContextTokens === 'number' && Number.isFinite(maxContextTokens) && maxContextTokens > 0 ? maxContextTokens : null
  const overrideMax = typeof maxTokens === 'number' && Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : null
  const max = ctx ?? overrideMax ?? fallbackMaxTokens
  const pct = max ? Math.max(0, Math.min(100, (totalTokens / max) * 100)) : null
  const isOver = Boolean(max && totalTokens > max)

  const formatUSD2 = (v: number) => {
    if (!(typeof v === 'number') || !Number.isFinite(v)) return '$0.00'
    return `$${v.toFixed(2)}`
  }

  const CostPill = () => (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 border text-[11px] bg-muted/60 border-border/50 text-muted-foreground" title={`${formatUSD2(totalCost)} spent`}>
      <Icon name="coins" className="h-3 w-3 text-amber-500" />
      <span className="font-semibold tabular-nums text-foreground">{formatUSD2(totalCost)}</span>
    </span>
  )

  const TokensPill = () => (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-1 border text-[11px]',
        isOver ? 'bg-destructive/10 border-destructive/30 text-destructive' : 'bg-muted/60 border-border/50 text-muted-foreground'
      )}
      title={max ? `${totalTokens.toLocaleString()}/${max.toLocaleString()} tokens` : `${totalTokens.toLocaleString()} tokens`}
    >
      <Icon name="sparkles" className={cn('h-3 w-3', isOver ? 'text-destructive' : 'text-primary')} />
      <span className={cn('font-semibold tabular-nums', isOver ? 'text-destructive' : 'text-foreground')}>
        {formatCompactTokens(totalTokens)}/{max ? formatCompactTokens(max) : '—'}
      </span>
      {max ? (
        <span className="ml-1 inline-flex items-center">
          <span className="w-14 h-1.5 rounded-full bg-border/50 overflow-hidden">
            <span className={cn('block h-full', isOver ? 'bg-destructive' : 'bg-primary')} style={{ width: `${pct ?? 0}%` }} />
          </span>
        </span>
      ) : null}
    </span>
  )

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
        <div className="max-w-4xl">
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

                    {/* Tokens: utilized vs max (always render) */}
                    <span className="inline-flex items-center gap-2 whitespace-nowrap">
                      <span aria-hidden="true" className="h-3 w-px bg-border/60" />
                      <TokensPill />
                    </span>

                    {/* Cost burn */}
                    <span className="inline-flex items-center gap-2 whitespace-nowrap">
                      <span aria-hidden="true" className="h-3 w-px bg-border/60" />
                      <CostPill />
                    </span>
                  </>
                ) : (
                  <>
                    <span className="font-medium leading-none">Updated {formatDate(updatedAt)}</span>
                    <span className="inline-flex items-center gap-2 whitespace-nowrap">
                      <span aria-hidden="true" className="h-3 w-px bg-border/60" />
                      <TokensPill />
                    </span>
                    <span className="inline-flex items-center gap-2 whitespace-nowrap">
                      <span aria-hidden="true" className="h-3 w-px bg-border/60" />
                      <CostPill />
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
