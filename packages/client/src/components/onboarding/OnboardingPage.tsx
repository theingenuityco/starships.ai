'use client'

import Icon from '@/components/primitives/Icon'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/hooks/useAuth'
import { useOnboardingChatStart } from '@/hooks/useOnboardingChatStart'
import { useOnboardingSession } from '@/hooks/useOnboarding'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

export function OnboardingPage(): React.JSX.Element {
  const router = useRouter()
  const { user, isAuthenticated, isLoading: authLoading } = useAuth()
  const chatStart = useOnboardingChatStart()
  const { data: onboardingData, isLoading: onboardingLoading } = useOnboardingSession()
  const [starshipName, setStarshipName] = useState('')
  const autoResumeRef = useRef(false)

  const canSubmit = useMemo(
    () => isAuthenticated && !authLoading && !chatStart.isPending,
    [authLoading, chatStart.isPending, isAuthenticated]
  )

  useEffect(() => {
    if (authLoading) return
    if (isAuthenticated && user?.onboardingCompleted) {
      router.replace('/profile')
    }
  }, [authLoading, isAuthenticated, router, user?.onboardingCompleted])

  // Resume onboarding automatically when the user already has an onboarding starship/session.
  // This prevents users from getting stuck at "Create your starship" after they already created one.
  useEffect(() => {
    if (autoResumeRef.current) return
    if (authLoading || onboardingLoading) return
    if (!isAuthenticated) return
    if (user?.onboardingCompleted) return

    const session = onboardingData?.session
    if (!session?.starshipId) return

    autoResumeRef.current = true
    ;(async () => {
      try {
        const res = await chatStart.mutateAsync({})
        router.replace(
          `/ship/${encodeURIComponent(res.starship.slug)}/conversations/${encodeURIComponent(res.conversation.id)}?agent=${encodeURIComponent(
            res.ariaAgent.slug
          )}&onboarding=1`
        )
      } catch (e: any) {
        autoResumeRef.current = false
        toast.error('Could not resume onboarding', { description: e?.message || 'Please try again.' })
      }
    })()
  }, [authLoading, onboardingLoading, isAuthenticated, user?.onboardingCompleted, onboardingData?.session, chatStart, router])

  const handleCreate = async () => {
    if (!canSubmit) return
    try {
      const trimmed = starshipName.trim()
      const res = await chatStart.mutateAsync(trimmed ? { starshipName: trimmed } : {})
      router.replace(
        `/ship/${encodeURIComponent(res.starship.slug)}/conversations/${encodeURIComponent(res.conversation.id)}?agent=${encodeURIComponent(res.ariaAgent.slug)}&onboarding=1`
      )
    } catch (e: any) {
      toast.error('Could not start onboarding', { description: e?.message || 'Please try again.' })
    }
  }

  if (authLoading || onboardingLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Icon name="loader-2" className="h-5 w-5 animate-spin" />
          Loading…
        </div>
      </div>
    )
  }

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
                <CardTitle className="text-xl font-semibold">Create your starship</CardTitle>
                <p className="text-sm text-muted-foreground">You’ll be dropped into an onboarding chat with Aria.</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="starshipName">Starship name (optional)</Label>
              <Input
                id="starshipName"
                value={starshipName}
                onChange={(e) => setStarshipName(e.target.value)}
                placeholder="e.g. Endeavour"
                disabled={chatStart.isPending}
              />
              {user?.name ? <p className="text-xs text-muted-foreground">Welcome, {user.name.split(/\s+/)[0]}.</p> : null}
            </div>
            <div className="flex items-center justify-end">
              <Button onClick={handleCreate} disabled={!canSubmit} className="h-10">
                {chatStart.isPending ? 'Creating…' : 'Create my starship'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

