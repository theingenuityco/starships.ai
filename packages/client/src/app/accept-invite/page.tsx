'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
import { useAcceptStarshipInvite } from '@/hooks/useStarshipInvites'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

export default function AcceptInvitePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // New canonical param is `invite`; keep `token` as a backwards-compatible fallback.
  const token = (searchParams.get('invite') || searchParams.get('token') || '').trim()

  const { isAuthenticated, isLoading } = useAuth()
  const acceptInvite = useAcceptStarshipInvite()

  const [attempted, setAttempted] = useState(false)

  const returnUrl = useMemo(() => {
    if (!token) return '/accept-invite'
    return `/accept-invite?invite=${encodeURIComponent(token)}`
  }, [token])

  useEffect(() => {
    if (!token) return

    // If not logged in, redirect to login and come back here after auth.
    if (!isLoading && !isAuthenticated) {
      router.replace(`/login?returnUrl=${encodeURIComponent(returnUrl)}`)
      return
    }

    if (!isAuthenticated) return
    if (attempted) return

    setAttempted(true)
    void acceptInvite
      .mutateAsync(token)
      .then(starship => {
        router.replace(`/ship/${encodeURIComponent(starship.slug)}/conversations`)
      })
      .catch(() => {
        // errors are surfaced via toast; keep page visible for retry
      })
  }, [token, isLoading, isAuthenticated, attempted, acceptInvite, router, returnUrl])

  const canRetry = Boolean(token) && isAuthenticated && !acceptInvite.isPending

  return (
    <div className="mx-auto mt-12 max-w-xl px-4">
      <Card>
        <CardHeader>
          <CardTitle>Accept invite</CardTitle>
          <CardDescription>Join a starship as a collaborator.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!token ? (
            <p className="text-sm text-muted-foreground">Missing invite token. Please open the invite link from your email.</p>
          ) : isLoading ? (
            <p className="text-sm text-muted-foreground">Checking your account…</p>
          ) : !isAuthenticated ? (
            <p className="text-sm text-muted-foreground">Redirecting you to sign in…</p>
          ) : acceptInvite.isPending ? (
            <p className="text-sm text-muted-foreground">Accepting invite…</p>
          ) : (
            <div className="flex items-center gap-2">
              <Button onClick={() => acceptInvite.mutate(token)} disabled={!canRetry}>
                Accept invite
              </Button>
              <Button variant="ghost" onClick={() => router.push('/')} disabled={acceptInvite.isPending}>
                Cancel
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

