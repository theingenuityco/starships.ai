'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CreditCard, Plus } from 'lucide-react'
import { useCreditBalance } from '@/hooks/useCreditBalance'

interface CreditBalanceCardProps {
  onTopupClick: () => void
}

export function CreditBalanceCard({ onTopupClick }: CreditBalanceCardProps): React.JSX.Element {
  const { data: balance, isLoading, error } = useCreditBalance()

  if (isLoading) {
    return (
      <Card className="shadow-sm border-border/50 bg-background/80">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Credit Balance</CardTitle>
          <CreditCard className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="animate-pulse">
            <div className="h-8 bg-muted rounded mb-2"></div>
            <div className="h-4 bg-muted rounded w-2/3"></div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="shadow-sm border-border/50 bg-background/80">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Credit Balance</CardTitle>
          <CreditCard className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Unable to load balance</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="shadow-sm border-border/50 bg-background/80">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Credit Balance</CardTitle>
        <CreditCard className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">${balance.toFixed(2)}</div>
        <p className="text-xs text-muted-foreground">Available credits</p>
        <Button onClick={onTopupClick} size="sm" className="mt-3 w-full" variant="outline">
          <Plus className="h-4 w-4 mr-2" />
          Top Up Credits
        </Button>
      </CardContent>
    </Card>
  )
}

export default CreditBalanceCard
