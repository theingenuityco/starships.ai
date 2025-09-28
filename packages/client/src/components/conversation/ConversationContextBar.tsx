'use client'

import type { MessageModel } from '@starships/protocol'
import { cn } from '@/lib/utils'
import { useMemo } from 'react'
import { Coins } from 'lucide-react'

interface ConversationContextBarProps {
  messages: ReadonlyArray<MessageModel>
  className?: string
  /** Combined token quota (In+Out) to visualize progress against */
  budgetTokens?: number
}

/**
 * Starship Fuel Tank + Odometer (compact, single-row)
 * - Ultra-compact sticky bar (~44-48px tall)
 * - Fuel capsule shows REMAINING tokens (decreases as you use tokens)
 * - Odometer shows tokens used in cockpit-style digit cells
 * - Minimal KPI: Cost
 */
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
      const costVal = Number((u as any).cost) || 0

      prompt += p
      completion += c
      total += t
      cost += costVal
    }

    return { prompt, completion, total, cost }
  }, [messages])

  // Derived metrics
  const remaining = Math.max(0, budgetTokens - totals.total)
  const fuelPct = Math.max(0, Math.min(100, budgetTokens > 0 ? (remaining / budgetTokens) * 100 : 0)) // remaining fuel percent
  const usedPct = Math.max(0, Math.min(100, budgetTokens > 0 ? (totals.total / budgetTokens) * 100 : 0))

  // Odometer digits for total tokens used (compact)
  const odometerDigits = padDigits(totals.total, 6)

  // Formatters
  const formatTokens = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 })
  const formatUSD6 = (v: number) => {
    if (!(typeof v === 'number') || !Number.isFinite(v)) return '$0.000000'
    if (v > 0 && v < 1e-6) return `$${v.toFixed(9)}`
    return `$${v.toFixed(6)}`
  }

  return (
    <div className={cn('sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60', className)}>
      <div className="max-w-5xl mx-auto px-3 py-2">
        {/* Single compact row */}
        <div className="flex items-center justify-between gap-3">
          {/* Left: Fuel capsule + labels */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="shrink-0 text-[11px] text-muted-foreground">Fuel</div>
            {/* Fuel Capsule (remaining) */}
            <div
              className="relative h-3 w-44 sm:w-56 md:w-72 rounded-full border border-primary/30 bg-background/40 overflow-hidden shrink-0"
              aria-label="fuel-remaining"
              title={`Remaining: ${formatTokens(remaining)} of ${formatTokens(budgetTokens)} (${fuelPct.toFixed(0)}%)`}
            >
              {/* Liquid fill (remaining) */}
              <div className="h-full transition-all duration-500 ease-out bg-gradient-to-r from-emerald-400/90 via-emerald-500/90 to-emerald-600/90" style={{ width: `${fuelPct}%` }} />
              {/* Gloss */}
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.15),transparent_30%)]" />
              {/* Subtle ticks */}
              <div className="pointer-events-none absolute inset-0 opacity-[0.08] bg-[repeating-linear-gradient(to_right,currentColor_1px,transparent_1px,transparent_10px)]" />
            </div>
            {/* Fuel percent + small used/limit hint (truncate on narrow screens) */}
            <div className="truncate text-[11px] text-muted-foreground">
              <span className="text-foreground font-medium">{fuelPct.toFixed(0)}%</span> left
              <span className="hidden sm:inline"> · used {usedPct.toFixed(0)}%</span>
            </div>
          </div>

          {/* Middle: Odometer (tokens used) */}
          <div className="hidden sm:flex items-center gap-2 min-w-[180px]">
            <div className="text-[11px] text-muted-foreground">ODO</div>
            <div className="flex gap-1">
              {odometerDigits.map((d, i) => (
                <div
                  key={i}
                  className={cn(
                    'relative w-7 h-8 md:w-8 md:h-9 rounded-md border border-border/60 bg-gradient-to-b from-background/60 to-background/30',
                    'shadow-[inset_0_1px_1px_rgba(255,255,255,0.08),inset_0_-1px_1px_rgba(0,0,0,0.25)] grid place-items-center'
                  )}
                  aria-label={`odometer-${i}`}
                >
                  <div className="absolute top-0 inset-x-0 h-0.5 bg-white/10" />
                  <div className="absolute bottom-0 inset-x-0 h-0.5 bg-black/20" />
                  <span className="font-mono tabular-nums text-sm md:text-base tracking-wider text-foreground">{d}</span>
                </div>
              ))}
            </div>
            {/* Tiny caption on medium+ screens */}
            <div className="hidden md:block text-[10px] text-muted-foreground">tokens used</div>
          </div>

          {/* Right: Cost pill */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-full bg-muted/60 px-2.5 py-1 text-[11px] border border-border/50">
              <Coins className="w-3 h-3 text-amber-500" />
              <span className="text-muted-foreground">Cost</span>
              <span className="font-medium text-foreground">{formatUSD6(totals.cost)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function padDigits(n: number, size: number): string[] {
  const s = Math.max(0, Math.floor(n)).toString()
  const pad = '0'.repeat(Math.max(0, size - s.length)) + s
  return pad.split('')
}
