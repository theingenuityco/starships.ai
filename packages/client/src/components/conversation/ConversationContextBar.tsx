'use client'

import type { MessageModel } from '@starships/protocol'
import { cn } from '@/lib/utils'
import { useMemo } from 'react'

interface ConversationContextBarProps {
  messages: ReadonlyArray<MessageModel>
  className?: string
  /** Default combined token budget (In+Out) to visualize progress against */
  budgetTokens?: number
}

export function ConversationContextBar({ messages, className, budgetTokens = 400_000 }: ConversationContextBarProps) {
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

  const pct = Math.max(0, Math.min(100, budgetTokens > 0 ? (totals.total / budgetTokens) * 100 : 0))

  const formatTokens = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 })
  const formatUSD6 = (v: number) => {
    if (!(typeof v === 'number') || !Number.isFinite(v)) return '$0.000000'
    if (v > 0 && v < 1e-6) return `$${v.toFixed(9)}`
    return `$${v.toFixed(6)}`
  }

  return (
    <div className={cn('sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60', className)}>
      <div className="max-w-4xl mx-auto px-4 py-3">
        {/* Header row: combined usage and cost */}
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
          <div className="font-medium text-foreground">Usage</div>
          <div className="flex items-center gap-4">
            <div>
              In: <span className="text-foreground font-medium">{formatTokens(totals.prompt)}</span>
            </div>
            <div>
              Out: <span className="text-foreground font-medium">{formatTokens(totals.completion)}</span>
            </div>
            <div>
              Total: <span className="text-foreground font-medium">{formatTokens(totals.total)}</span>
            </div>
            <div>
              Cost: <span className="text-foreground font-medium">{formatUSD6(totals.cost)}</span>
            </div>
          </div>
        </div>

        {/* Combined budget progress bar */}
        <div className="w-full h-2.5 rounded bg-muted overflow-hidden">
          <div className="h-full bg-primary" style={{ width: `${pct}%` }} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} role="progressbar" />
        </div>

        {/* Caption: totals against budget */}
        <div className="mt-1 text-[11px] text-muted-foreground">
          {formatTokens(totals.total)} of {formatTokens(budgetTokens)} tokens used (combined In+Out)
        </div>
      </div>
    </div>
  )
}
