'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowUpRight, ArrowDownLeft, Receipt, Gift } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import useCreditTransactions from '@/hooks/useCreditTransactions'

interface CreditTransactionHistoryProps {
  limit?: number
}

export function CreditTransactionHistory({ limit = 10 }: CreditTransactionHistoryProps): React.JSX.Element {
  const { userId } = useAuth()
  const { data, isLoading, error } = useCreditTransactions(userId, { limit })

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'purchase':
        return <ArrowDownLeft className="h-4 w-4 text-green-600" />
      case 'usage':
        return <ArrowUpRight className="h-4 w-4 text-red-600" />
      case 'refund':
        return <Receipt className="h-4 w-4 text-blue-600" />
      case 'promo':
        return <Gift className="h-4 w-4 text-purple-600" />
      default:
        return <ArrowUpRight className="h-4 w-4 text-gray-600" />
    }
  }

  const getTransactionBadgeVariant = (type: string) => {
    switch (type) {
      case 'purchase':
        return 'default'
      case 'usage':
        return 'secondary'
      case 'refund':
        return 'outline'
      case 'promo':
        return 'secondary'
      default:
        return 'outline'
    }
  }

  const formatAmount = (amount: number, type: string) => {
    const formatted = Math.abs(amount).toFixed(2)
    const sign = amount > 0 ? '+' : '-'
    return `${sign}$${formatted}`
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (isLoading) {
    return (
      <Card className="shadow-sm border-border/50 bg-background/80">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Transaction History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="animate-pulse flex items-center space-x-3">
                <div className="h-8 w-8 bg-muted rounded-full"></div>
                <div className="flex-1">
                  <div className="h-4 bg-muted rounded mb-1"></div>
                  <div className="h-3 bg-muted rounded w-2/3"></div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="shadow-sm border-border/50 bg-background/80">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Transaction History</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Unable to load transactions</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="shadow-sm border-border/50 bg-background/80">
      <CardHeader>
        <CardTitle className="text-sm font-medium">Transaction History</CardTitle>
      </CardHeader>
      <CardContent>
        {data && data.records && data.records.length > 0 ? (
          <div className="space-y-3">
            {data.records.map((transaction: any) => (
              <div key={transaction.id} className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {getTransactionIcon(transaction.type)}
                  <div>
                    <div className="text-sm font-medium">{formatAmount(transaction.amount, transaction.type)}</div>
                    <div className="text-xs text-muted-foreground">{formatDate(transaction.createdAt)}</div>
                  </div>
                </div>
                <Badge variant={getTransactionBadgeVariant(transaction.type)} className="text-xs">
                  {transaction.type}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">No transactions yet</p>
        )}
      </CardContent>
    </Card>
  )
}

export default CreditTransactionHistory
