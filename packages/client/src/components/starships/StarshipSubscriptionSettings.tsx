'use client'
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CreditCard, AlertTriangle, XCircle } from 'lucide-react'
import { starshipAPI } from '@/lib/api'

interface StarshipSubscriptionSettingsProps {
  starship: {
    id: string
    name: string
    plan: 'scout' | 'cruiser' | 'draught'
    status: 'active' | 'restricted' | 'disabled'
    subscriptionId?: string
  }
}

export function StarshipSubscriptionSettings({ starship }: StarshipSubscriptionSettingsProps) {
  const [loading, setLoading] = useState(false)

  const handleManageSubscription = async () => {
    setLoading(true)
    try {
      const response = await starshipAPI.createBillingPortal(starship.id)
      if (response.url) {
        window.location.href = response.url
      }
    } catch (error) {
      console.error('Failed to open billing portal:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'active':
        return 'default'
      case 'restricted':
        return 'destructive'
      case 'disabled':
        return 'secondary'
      default:
        return 'default'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'text-green-600'
      case 'restricted':
        return 'text-orange-600'
      case 'disabled':
        return 'text-red-600'
      default:
        return 'text-gray-600'
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Subscription</span>
          <Badge variant={getStatusVariant(starship.status)} className={getStatusColor(starship.status)}>
            {starship.status}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm text-muted-foreground">Plan</p>
          <p className="font-semibold capitalize">{starship.plan} Starship</p>
        </div>

        {starship.status === 'restricted' && (
          <Card className="border-orange-200 bg-orange-50">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <AlertTriangle className="h-5 w-5 text-orange-600" />
                <div className="flex-1">
                  <p className="text-sm text-orange-800">Payment issue detected. Some features may be limited.</p>
                </div>
                <Button size="sm" variant="outline" onClick={handleManageSubscription} disabled={loading}>
                  Update payment
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {starship.status === 'disabled' && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <XCircle className="h-5 w-5 text-red-600" />
                <div className="flex-1">
                  <p className="text-sm text-red-800">Subscription cancelled. Reactivate to continue using this starship.</p>
                </div>
                <Button size="sm" variant="outline" onClick={handleManageSubscription} disabled={loading}>
                  Reactivate
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {starship.plan !== 'scout' && (
          <Button onClick={handleManageSubscription} disabled={loading} className="w-full" variant="outline">
            <CreditCard className="w-4 h-4 mr-2" />
            {loading ? 'Loading...' : 'Manage Subscription'}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
