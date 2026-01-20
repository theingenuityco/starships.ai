'use client'

import Icon from '@/components/primitives/Icon'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  const autoResumeRef = useRef(false)
  const [autoStartFailed, setAutoStartFailed] = useState(false)

  const canAutoStart = useMemo(
    () => isAuthenticated && !authLoading && !onboardingLoading && !chatStart.isPending,
    [authLoading, chatStart.isPending, isAuthenticated]
  )

  useEffect(() => {
    if (authLoading) return
    if (isAuthenticated && user?.onboardingCompleted) {
      router.replace('/profile')
    }
  }, [authLoading, isAuthenticated, router, user?.onboardingCompleted])

  // Auto-start onboarding as soon as the onboarding session has a starship.
  // The backend ensures a starship is provisioned and linked for non-onboarded users.
  useEffect(() => {
    if (autoResumeRef.current) return
    if (authLoading || onboardingLoading) return
    if (!isAuthenticated) return
    if (user?.onboardingCompleted) return

    const session = onboardingData?.session
    if (!session?.starshipId) return

    autoResumeRef.current = true
    setAutoStartFailed(false)
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
        setAutoStartFailed(true)
        toast.error('Could not resume onboarding', { description: e?.message || 'Please try again.' })
      }
    })()
  }, [authLoading, onboardingLoading, isAuthenticated, user?.onboardingCompleted, onboardingData?.session, chatStart, router])

  const handleRetry = async () => {
    if (!canAutoStart) return
    try {
      autoResumeRef.current = true
      setAutoStartFailed(false)
      const res = await chatStart.mutateAsync({})
      router.replace(
        `/ship/${encodeURIComponent(res.starship.slug)}/conversations/${encodeURIComponent(res.conversation.id)}?agent=${encodeURIComponent(res.ariaAgent.slug)}&onboarding=1`
      )
    } catch (e: any) {
      autoResumeRef.current = false
      setAutoStartFailed(true)
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
                <CardTitle className="text-xl font-semibold">Setting up your starship…</CardTitle>
                <p className="text-sm text-muted-foreground">Hang tight — we’re starting your onboarding chat with Aria.</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {user?.name ? <p className="text-xs text-muted-foreground">Welcome, {user.name.split(/\s+/)[0]}.</p> : null}

            {autoStartFailed ? (
              <div className="flex items-center justify-end">
                <Button onClick={handleRetry} disabled={!canAutoStart} className="h-10">
                  {chatStart.isPending ? 'Starting…' : 'Try again'}
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3 text-muted-foreground">
                <Icon name="loader-2" className="h-5 w-5 animate-spin" />
                Redirecting…
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

