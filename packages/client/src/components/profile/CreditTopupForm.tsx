'use client'

import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, CreditCard } from 'lucide-react'
import api from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'

interface CreditTopupFormProps {
  onSuccess?: () => void
}

export function CreditTopupForm({ onSuccess }: CreditTopupFormProps): React.JSX.Element {
  const { userId } = useAuth()
  const [amount, setAmount] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const predefinedAmounts = [20, 50, 100]

  const handlePredefinedAmount = (value: number) => {
    setAmount(value.toString())
    setError(null)
  }

  const handleCustomAmount = (value: string) => {
    setAmount(value)
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const numAmount = parseFloat(amount)
    if (!numAmount || numAmount < 20) {
      setError('Minimum top-up amount is $20')
      return
    }

    if (numAmount > 10000) {
      setError('Maximum top-up amount is $10,000')
      return
    }

    if (!userId) {
      setError('User not authenticated')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const response = await api.post('/api/v1/credits/checkout-session', { amount: numAmount })
      const url: string | undefined = response?.data?.data?.url

      if (url) {
        window.location.assign(url)
      } else {
        setError('Failed to create checkout session. Please try again.')
      }
    } catch (err: unknown) {
      console.error('Top-up failed:', err)
      setError('Failed to create checkout session. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="shadow-sm border-border/50 bg-background/80">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plus className="h-5 w-5" />
          Top Up Credits
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Predefined amounts */}
          <div>
            <Label className="text-sm font-medium">Quick Select</Label>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {predefinedAmounts.map(value => (
                <Button key={value} type="button" variant={amount === value.toString() ? 'default' : 'outline'} size="sm" onClick={() => handlePredefinedAmount(value)} disabled={isLoading}>
                  ${value}
                </Button>
              ))}
            </div>
          </div>

          {/* Custom amount */}
          <div>
            <Label htmlFor="custom-amount" className="text-sm font-medium">
              Custom Amount (min $20)
            </Label>
            <div className="relative mt-2">
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">$</span>
              <Input
                id="custom-amount"
                type="number"
                min="20"
                max="10000"
                step="0.01"
                value={amount}
                onChange={e => handleCustomAmount(e.target.value)}
                placeholder="20.00"
                className="pl-8"
                disabled={isLoading}
              />
            </div>
          </div>

          {/* Error message */}
          {error && <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</div>}

          {/* Submit button */}
          <Button type="submit" className="w-full" disabled={isLoading || !amount || parseFloat(amount) < 20}>
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                Creating Checkout...
              </>
            ) : (
              <>
                <CreditCard className="h-4 w-4 mr-2" />
                Proceed to Payment
              </>
            )}
          </Button>

          <p className="text-xs text-muted-foreground text-center">You will be redirected to Stripe to complete your payment securely.</p>
        </form>
      </CardContent>
    </Card>
  )
}

export default CreditTopupForm
