'use client'

import React from 'react'
import { Coins, Activity, Cpu, ArrowDown, ArrowUp, Receipt } from 'lucide-react'
import MetricCard from './MetricCard'

export interface UsageKpiCardsProps {
  isLoading: boolean
  totalCost: number
  totalTokens: number
  promptTokens: number
  completionTokens: number
  totalRequests: number
  avgTokensPerRequest: number
  avgCostPerRequest: number
  numberCompact: (n: number) => string
  numberGroup: (n: number) => string
  usd: (n: number) => string
}

export function UsageKpiCards(props: UsageKpiCardsProps): React.JSX.Element {
  const {
    isLoading,
    totalCost,
    totalTokens,
    promptTokens,
    completionTokens,
    totalRequests,
    avgTokensPerRequest,
    avgCostPerRequest,
    numberCompact,
    numberGroup,
    usd,
  } = props

  return (
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
  )
}

export default UsageKpiCards
