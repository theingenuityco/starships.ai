'use client'

import React from 'react'
import { Coins, Activity, Cpu, ArrowDown, ArrowUp, Receipt } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { useUserUsageViewModel } from '@/hooks/useUserUsageViewModel'
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

export function UserUsage(): React.JSX.Element {
  const {
    isLoading,
    totalCost,
    totalTokens,
    promptTokens,
    completionTokens,
    totalRequests,
    avgTokensPerRequest,
    avgCostPerRequest,
    modeDayModel,
    setModeDayModel,
    page,
    setPage,
    isDaily,
    rows,
    loadingList,
    pagination,
    total,
    hasNext,
    hasPrev,
    numberCompact,
    numberGroup,
    usd,
    formatDay,
  } = useUserUsageViewModel()

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

      {/* Usage details table */}
      <Card className="shadow-sm border-border/50 bg-background/80">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Usage Details</CardTitle>
              <CardDescription>{isDaily ? 'Aggregated by Day' : 'Aggregated by Day and Model'}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Day</span>
              <Switch
                checked={modeDayModel}
                onCheckedChange={v => {
                  setModeDayModel(!!v)
                  setPage(1)
                }}
              />
              <span className="text-xs text-muted-foreground">Day + Model</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center mb-3">
            <div className="ml-auto text-sm text-muted-foreground">Total rows: {numberGroup(total)}</div>
          </div>

          <ScrollArea className="w-full">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b border-border/50">
                    <th className="py-2 pr-3 text-left font-medium">Day</th>
                    {!isDaily && <th className="py-2 pr-3 text-left font-medium">Model</th>}
                    <th className="py-2 pr-3 text-right font-medium">Requests</th>
                    <th className="py-2 pr-3 text-right font-medium">Input</th>
                    <th className="py-2 pr-3 text-right font-medium">Output</th>
                    <th className="py-2 pr-3 text-right font-medium">Total</th>
                    <th className="py-2 pr-3 text-right font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingList && (
                    <tr>
                      <td className="py-3 text-muted-foreground" colSpan={isDaily ? 6 : 7}>
                        Loading…
                      </td>
                    </tr>
                  )}
                  {!loadingList && rows.length === 0 && (
                    <tr>
                      <td className="py-3 text-muted-foreground" colSpan={isDaily ? 6 : 7}>
                        No usage records
                      </td>
                    </tr>
                  )}
                  {!loadingList &&
                    rows.map((r: any, idx: number) => (
                      <tr key={`${isDaily ? r.day : r.day + '-' + (r.model || 'nomodel')}-${idx}`} className="border-b border-border/30">
                        <td className="py-2 pr-3">{formatDay(r.day)}</td>
                        {!isDaily && <td className="py-2 pr-3 font-mono">{r.model ?? '—'}</td>}
                        <td className="py-2 pr-3 text-right">{numberGroup(Number(r.requestCount ?? 0))}</td>
                        <td className="py-2 pr-3 text-right">{numberGroup(Number(r.totals?.promptTokens ?? 0))}</td>
                        <td className="py-2 pr-3 text-right">{numberGroup(Number(r.totals?.completionTokens ?? 0))}</td>
                        <td className="py-2 pr-3 text-right">{numberGroup(Number(r.totals?.totalTokens ?? 0))}</td>
                        <td className="py-2 pr-3 text-right">{usd(Number(r.totals?.cost ?? 0))}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </ScrollArea>

          <div className="flex items-center justify-between mt-4">
            <Button variant="outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={!hasPrev}>
              Previous
            </Button>
            <div className="text-sm text-muted-foreground">
              Page {pagination?.page ?? page} of {pagination ? Math.max(1, Math.ceil(pagination.total / pagination.limit)) : '—'}
            </div>
            <Button variant="outline" onClick={() => setPage(p => p + 1)} disabled={!hasNext}>
              Next
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default UserUsage
