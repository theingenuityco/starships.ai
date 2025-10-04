'use client'

import { cn } from '@/lib/utils'
import { Coins, ArrowDown, ArrowUp } from 'lucide-react'
import { useConversationUsageTotals } from '@/hooks/useUsage'

interface ConversationContextBarProps {
  conversationId: string | null
  className?: string
  /** Combined token quota (In+Out) to visualize progress against */
  budgetTokens?: number
}

export function ConversationContextBar({ conversationId, className, budgetTokens = 400_000 }: ConversationContextBarProps) {
  const { data: totalsData } = useConversationUsageTotals(conversationId)

  const prompt = Number(totalsData?.promptTokens ?? 0)
  const completion = Number(totalsData?.completionTokens ?? 0)
  const total = Number(totalsData?.totalTokens ?? 0)
  const cost = Number(totalsData?.cost ?? 0)

  // Derived metrics
  const pct = Math.max(0, Math.min(100, budgetTokens > 0 ? (total / budgetTokens) * 100 : 0))
  const pctIn = total > 0 ? (prompt / total) * 100 : 0
  const pctOut = total > 0 ? (completion / total) * 100 : 0

  // Formatters
  const formatUSD2 = (v: number) => {
    if (!(typeof v === 'number') || !Number.isFinite(v)) return '$0.00'
    return `$${v.toFixed(2)}`
  }
  const formatCompactTokens = (n: number) => new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n)
  const formatPercent = (p: number) => {
    const clamped = Math.max(0, Math.min(100, p))
    const digits = clamped >= 10 ? 0 : 1
    return `${clamped.toFixed(digits)}%`
  }

  return (
    <div className={cn('sticky top-0 z-10 border-b border-border/30 bg-background/30 backdrop-blur-sm supports-[backdrop-filter]:bg-background/20', className)}>
      <div className="max-w-4xl mx-auto px-4 py-3">
        {/* Header row: combined usage and cost */}
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
          <div className="font-medium text-foreground">Usage</div>
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Cost pill */}
            <div className="flex items-center gap-1.5 rounded-full bg-muted/60 px-2.5 py-1 text-[11px] border border-border/50">
              <Coins className="w-3 h-3 text-amber-500" />
              <span className="text-muted-foreground">Cost</span>
              <span className="font-medium text-foreground">{formatUSD2(cost)}</span>
            </div>
          </div>
        </div>

        {/* Token Quota */}
        <div className="rounded-lg border border-border/60 bg-gradient-to-b from-muted/50 to-background/40 p-3">
          <div className="flex items-center justify-between text-[11px] mb-2">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Token:</span>
              <span className="text-foreground font-medium" title={`${formatCompactTokens(total)} / ${formatCompactTokens(budgetTokens)} tokens used`}>
                {formatCompactTokens(total)} / {formatCompactTokens(budgetTokens)} tokens used ({formatPercent(pct)})
              </span>
            </div>
            <div className="hidden sm:flex items-center gap-3">
              <div className="flex items-center gap-1">
                <ArrowDown className="w-3 h-3 text-sky-500" aria-label="In" />
                <span className="text-foreground font-medium">{formatCompactTokens(prompt)}</span>
              </div>
              <div className="flex items-center gap-1">
                <ArrowUp className="w-3 h-3 text-violet-500" aria-label="Out" />
                <span className="text-foreground font-medium">{formatCompactTokens(completion)}</span>
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
