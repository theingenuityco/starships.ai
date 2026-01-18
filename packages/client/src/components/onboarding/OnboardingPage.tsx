'use client'

import Icon from '@/components/primitives/Icon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/hooks/useAuth'
import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

type OnboardingCompleteResponse = {
  starship: { id: string; slug: string; name: string }
  agent: { id: string; slug: string; name: string } | null
}

function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null
  const token = localStorage.getItem('starships_auth_token')
  if (!token || token === 'null' || token === 'undefined') return null
  return token
}

export function OnboardingPage(): React.JSX.Element {
  const router = useRouter()
  const { user, isAuthenticated, isLoading } = useAuth()
  const [starshipName, setStarshipName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const canSubmit = useMemo(() => {
    if (!isAuthenticated) return false
    if (isLoading) return false
    return !submitting
  }, [isAuthenticated, isLoading, submitting])

  const handleComplete = useCallback(async () => {
    if (!canSubmit) return
    const token = getStoredToken()
    if (!token) {
      toast.error('Authentication required', { description: 'Please sign in again.' })
      router.push('/login')
      return
    }

    try {
      setSubmitting(true)
      const payload: Record<string, unknown> = {}
      const trimmed = starshipName.trim()
      if (trimmed.length > 0) payload.starshipName = trimmed

      const res = await fetch('/api/v1/onboarding/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })

      const json = await res.json()
      if (!res.ok || !json?.data) {
        throw new Error(json?.error?.message || 'Failed to complete onboarding')
      }

      const data = json.data as OnboardingCompleteResponse
      const slug = data?.starship?.slug
      const agentSlug = data?.agent?.slug
      if (!slug || !agentSlug) {
        throw new Error('Onboarding completed but default agent is missing.')
      }

      router.replace(`/ship/${encodeURIComponent(slug)}/conversations?agent=${encodeURIComponent(agentSlug)}`)
    } catch (e: any) {
      toast.error('Onboarding failed', { description: e?.message || 'Please try again.' })
      setSubmitting(false)
    }
  }, [canSubmit, router, starshipName])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-xl">
        <Card className="rounded-2xl">
          <CardHeader className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 border border-primary/15 flex items-center justify-center">
                <Icon name="rocket" className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-xl font-semibold">Set up your starship</CardTitle>
                <p className="text-sm text-muted-foreground">We’ll create your first starship and deploy Aria.</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="starshipName">
                Starship name (optional)
              </label>
              <Input
                id="starshipName"
                value={starshipName}
                onChange={(e) => setStarshipName(e.target.value)}
                placeholder="e.g. Endeavour"
                disabled={submitting}
              />
              {user?.name ? <p className="text-xs text-muted-foreground">Welcome, {user.name.split(/\s+/)[0]}.</p> : null}
            </div>

            <div className="flex items-center justify-end">
              <Button onClick={handleComplete} disabled={!canSubmit} className="h-10">
                {submitting ? 'Creating…' : 'Create my starship'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

