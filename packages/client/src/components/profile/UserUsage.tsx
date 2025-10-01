'use client'

import React from 'react'
import { Coins, Activity, Cpu, Rocket, ArrowDown, ArrowUp, Receipt } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useAuth } from '@/hooks/useAuth'
import { useUserUsageTotals } from '@/hooks/useUsage'
import { cn } from '@/lib/utils'

interface MetricCardProps {
  title: string
  value: string
  icon: React.ReactNode
  description?: React.ReactNode
  className?: string
}

function MetricCard({ title, value, icon, description, className }: MetricCardProps): React.JSX.Element {
  return (
    <Card className={cn('shadow-sm border-border/50 bg-background/80', className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tracking-tight">{value}</div>
        {description ? <div className="text-xs text-muted-foreground mt-1">{description}</div> : null}
      </CardContent>
    </Card>
  )
}

const numberCompact = (n: number): string => new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n)

const numberGroup = (n: number): string => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n)

const usd = (n: number): string => `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`

export function UserUsage(): React.JSX.Element {
  const { user } = useAuth()
  const userId = user?.id ?? null

  const { data: totals, isLoading: loadingTotals } = useUserUsageTotals(userId)

  const totalTokens = Number(totals?.totals.total_tokens ?? 0)
  const promptTokens = Number(totals?.totals.prompt_tokens ?? 0)
  const completionTokens = Number(totals?.totals.completion_tokens ?? 0)
  const totalCost = Number(totals?.totals.cost ?? 0)
  const totalRequests = Number(totals?.requestCount ?? 0)

  // Derived
  const avgTokensPerRequest = totalRequests > 0 ? Math.round(totalTokens / totalRequests) : 0
  const avgCostPerRequest = totalRequests > 0 ? totalCost / totalRequests : 0

  const isLoading = loadingTotals

  return (
    <div className="space-y-6">
      {/* Summary header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Usage Overview</h3>
          <p className="text-sm text-muted-foreground">Aggregated across all your starships</p>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Total Cost" value={isLoading ? '—' : usd(totalCost)} description="Provider-reported charges" icon={<Coins className="h-5 w-5 text-amber-500" />} />
        <MetricCard
          title="Total Tokens"
          value={isLoading ? '—' : numberGroup(totalTokens)}
          description={
            isLoading ? undefined : (
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <ArrowDown className="w-3 h-3 text-sky-500" />
                  {numberCompact(promptTokens)}
                </span>
                <span className="flex items-center gap-1">
                  <ArrowUp className="w-3 h-3 text-violet-500" />
                  {numberCompact(completionTokens)}
                </span>
              </div>
            )
          }
          icon={<Activity className="h-5 w-5 text-sky-500" />}
        />
        <MetricCard
          title="Total Requests"
          value={isLoading ? '—' : numberGroup(totalRequests)}
          description={isLoading ? undefined : `Avg ${numberGroup(avgTokensPerRequest)} tokens / request`}
          icon={<Cpu className="h-5 w-5 text-violet-500" />}
        />
        <MetricCard title="Avg Cost / Request" value={isLoading ? '—' : usd(avgCostPerRequest)} description="Average cost per request" icon={<Receipt className="h-5 w-5 text-primary" />} />
      </div>
    </div>
  )
}

export default UserUsage
