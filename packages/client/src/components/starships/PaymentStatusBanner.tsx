'use client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertTriangle, XCircle } from 'lucide-react'
import { starshipAPI } from '@/lib/api'

interface PaymentStatusBannerProps {
  starship: {
    id: string
    name: string
    status: 'active' | 'restricted' | 'disabled' | 'pending_payment'
    plan: 'scout' | 'cruiser' | 'draught'
  }
}

export function PaymentStatusBanner({ starship }: PaymentStatusBannerProps) {
  const handleManageSubscription = async () => {
    try {
      const response = await starshipAPI.createBillingPortal(starship.id)
      if (response.url) {
        window.location.href = response.url
      }
    } catch (error) {
      console.error('Failed to open billing portal:', error)
    }
  }

  const handleRetryPayment = async () => {
    try {
      const response = await starshipAPI.retryPayment(starship.id)
      if (response.checkoutUrl) {
        window.location.href = response.checkoutUrl
      }
    } catch (error) {
      console.error('Failed to retry payment:', error)
    }
  }

  if (starship.status === 'active' || starship.plan === 'scout') {
    return null
  }

  if (starship.status === 'pending_payment') {
    return (
      <Card className="mb-4 border-yellow-200 bg-yellow-50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              <span className="text-sm text-yellow-800">
                Payment required to activate {starship.name}
              </span>
            </div>
            <Button size="sm" variant="outline" onClick={handleRetryPayment}>
              Complete Payment
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (starship.status === 'restricted') {
    return (
      <Card className="mb-4 border-orange-200 bg-orange-50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
              <span className="text-sm text-orange-800">
                Payment issue detected for {starship.name}
              </span>
            </div>
            <Button size="sm" variant="outline" onClick={handleManageSubscription}>
              Update Payment
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (starship.status === 'disabled') {
    return (
      <Card className="mb-4 border-red-200 bg-red-50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <XCircle className="h-5 w-5 text-red-600" />
              <div>
                <span className="text-sm text-red-800">Subscription ended for {starship.name}</span>
                <p className="text-xs text-red-600 mt-1">
                  Create a new starship to start a new subscription
                </p>
              </div>
            </div>
            {/* No button - disabled is terminal state */}
          </div>
        </CardContent>
      </Card>
    )
  }

  return null
}
