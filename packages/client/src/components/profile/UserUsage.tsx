'use client'

import React from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { useUserUsageViewModel } from '@/hooks/useUserUsageViewModel'
import UsageKpiCards from './UsageKpiCards'
import UsageDetailsHeader from './UsageDetailsHeader'
import UsageTable from './UsageTable'
import UsagePagination from './UsagePagination'

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
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Usage Overview</h3>
          <p className="text-sm text-muted-foreground">Aggregated across all your starships</p>
        </div>
      </div>

      <UsageKpiCards
        isLoading={isLoading}
        totalCost={totalCost}
        totalTokens={totalTokens}
        promptTokens={promptTokens}
        completionTokens={completionTokens}
        totalRequests={totalRequests}
        avgTokensPerRequest={avgTokensPerRequest}
        avgCostPerRequest={avgCostPerRequest}
        numberCompact={numberCompact}
        numberGroup={numberGroup}
        usd={usd}
      />

      <Card className="shadow-sm border-border/50 bg-background/80">
        <CardHeader>
          <UsageDetailsHeader
            isDaily={isDaily}
            modeDayModel={modeDayModel}
            onToggle={v => {
              setModeDayModel(!!v)
              setPage(1)
            }}
          />
        </CardHeader>
        <CardContent>
          <UsageTable
            isDaily={isDaily}
            loadingList={loadingList}
            rows={rows as any[]}
            numberGroup={numberGroup}
            usd={usd}
            formatDay={formatDay}
            total={total}
          />
          <UsagePagination page={page} setPage={setPage} pagination={pagination} hasPrev={hasPrev} hasNext={hasNext} />
        </CardContent>
      </Card>
    </div>
  )
}

export default UserUsage
