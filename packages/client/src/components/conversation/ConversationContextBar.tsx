'use client'

import type { MessageModel } from '@starships/protocol'
import { cn } from '@/lib/utils'
import { useMemo } from 'react'
import { Coins, ArrowDown, ArrowUp } from 'lucide-react'

interface ConversationContextBarProps {
  messages: ReadonlyArray<MessageModel>
  className?: string
  /** Combined token quota (In+Out) to visualize progress against */
  budgetTokens?: number
}

export function ConversationContextBar({ messages, className, budgetTokens = 400_000 }: ConversationContextBarProps) {
  // Aggregate usage
  const totals = useMemo(() => {
    let prompt = 0
    let completion = 0
    let total = 0
    let cost = 0

    for (const m of messages) {
      if (m.role !== 'assistant') continue
      const u = (m as any)?.usage
      if (!u) continue

      const p = Number(u.promptTokens ?? 0)
      const c = Number(u.completionTokens ?? 0)
      const t = Number(u.totalTokens ?? p + c)

      // Cost in USD (mandatory, provided by server as usage.cost)
      const costVal = Number((u as any).cost) || 0

      prompt += p
      completion += c
      total += t
      cost += Number(costVal) || 0
    }

    return { prompt, completion, total, cost }
  }, [messages])

  // Derived metrics
  const pct = Math.max(0, Math.min(100, budgetTokens > 0 ? (totals.total / budgetTokens) * 100 : 0))
  const pctIn = totals.total > 0 ? (totals.prompt / totals.total) * 100 : 0
  const pctOut = totals.total > 0 ? (totals.completion / totals.total) * 100 : 0
  const costPerK = totals.total > 0 ? totals.cost / (totals.total / 1000) : 0 // Cost per 1k tokens

  // Formatters
  const formatTokens = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 })
  const formatUSD6 = (v: number) => {
    if (!(typeof v === 'number') || !Number.isFinite(v)) return '$0.000000'
    if (v > 0 && v < 1e-6) return `$${v.toFixed(9)}`
    return `$${v.toFixed(6)}`
  }
  const formatPerK = (v: number) => (v > 0 && v < 1e-6 ? `$${v.toFixed(9)}/1k` : `$${v.toFixed(6)}/1k`)

  return (
    <div className={cn('sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60', className)}>
      <div className="max-w-4xl mx-auto px-4 py-3">
        {/* Header row: combined usage and cost */}
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
          <div className="font-medium text-foreground">Usage</div>
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Cost pill */}
            <div className="flex items-center gap-1.5 rounded-full bg-muted/60 px-2.5 py-1 text-[11px] border border-border/50">
              <Coins className="w-3 h-3 text-amber-500" />
              <span className="text-muted-foreground">Cost</span>
              <span className="font-medium text-foreground">{formatUSD6(totals.cost)}</span>
            </div>
          </div>
        </div>

        {/* Token Quota */}
        <div className="rounded-lg border border-border/60 bg-gradient-to-b from-muted/50 to-background/40 p-3">
          <div className="flex items-center justify-between text-[11px] mb-2">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Token:</span>
              <span className="text-foreground font-medium">
                {formatTokens(totals.total)} / {formatTokens(budgetTokens)} tokens used
              </span>
            </div>
            <div className="hidden sm:flex items-center gap-3">
              <div className="flex items-center gap-1">
                <ArrowDown className="w-3 h-3 text-sky-500" aria-label="In" />
                <span className="text-foreground font-medium">{formatTokens(totals.prompt)}</span>
              </div>
              <div className="flex items-center gap-1">
                <ArrowUp className="w-3 h-3 text-violet-500" aria-label="Out" />
                <span className="text-foreground font-medium">{formatTokens(totals.completion)}</span>
              </div>
            </div>
          </div>

          {/* Segmented progress with composition inside the quota width */}
          <div className="w-full h-3 rounded-md bg-muted/70 border border-border/60 overflow-hidden relative">
            {/* Composition container, scaled to quota usage width */}
            <div className="h-full flex transition-all duration-500" style={{ width: `${pct}%` }} aria-label="quota-usage">
              <div className="h-full bg-sky-500/80" style={{ width: `${pctIn}%` }} aria-label="prompt-share" />
              <div className="h-full bg-violet-500/80" style={{ width: `${pctOut}%` }} aria-label="completion-share" />
            </div>

            {/* Thin overlay grid for visual depth */}
            <div className="absolute inset-0 opacity-[0.08] pointer-events-none bg-[linear-gradient(to_right,currentColor_1px,transparent_1px)] [background-size:16px_100%]" />
          </div>
        </div>
      </div>
    </div>
  )
}
