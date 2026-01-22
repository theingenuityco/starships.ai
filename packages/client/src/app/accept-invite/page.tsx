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
  // Canonical param is `invite` (no backwards compatibility with `token`).
  const inviteToken = (searchParams.get('invite') || '').trim()
  const hasLegacyTokenParam = Boolean((searchParams.get('token') || '').trim())

  const { isAuthenticated, isLoading } = useAuth()
  const acceptInvite = useAcceptStarshipInvite()

  const [attempted, setAttempted] = useState(false)

  const returnUrl = useMemo(() => {
    if (!inviteToken) return '/accept-invite'
    return `/accept-invite?invite=${encodeURIComponent(inviteToken)}`
  }, [inviteToken])

  useEffect(() => {
    if (!inviteToken) return

    // If not logged in, redirect to login and come back here after auth.
    if (!isLoading && !isAuthenticated) {
      router.replace(`/login?returnUrl=${encodeURIComponent(returnUrl)}`)
      return
    }

    if (!isAuthenticated) return
    if (attempted) return

    setAttempted(true)
    void acceptInvite
      .mutateAsync(inviteToken)
      .then(starship => {
        router.replace(`/ship/${encodeURIComponent(starship.slug)}/conversations`)
      })
      .catch(() => {
        // errors are surfaced via toast; keep page visible for retry
      })
  }, [inviteToken, isLoading, isAuthenticated, attempted, acceptInvite, router, returnUrl])

  const canRetry = Boolean(inviteToken) && isAuthenticated && !acceptInvite.isPending

  return (
    <div className="mx-auto mt-12 max-w-xl px-4">
      <Card>
        <CardHeader>
          <CardTitle>Accept invite</CardTitle>
          <CardDescription>Join a starship as a collaborator.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!inviteToken ? (
            hasLegacyTokenParam ? (
              <p className="text-sm text-muted-foreground">This invite link is outdated. Please request a new invite link.</p>
            ) : (
              <p className="text-sm text-muted-foreground">Missing invite token. Please open the invite link from your email.</p>
            )
          ) : isLoading ? (
            <p className="text-sm text-muted-foreground">Checking your account…</p>
          ) : !isAuthenticated ? (
            <p className="text-sm text-muted-foreground">Redirecting you to sign in…</p>
          ) : acceptInvite.isPending ? (
            <p className="text-sm text-muted-foreground">Accepting invite…</p>
          ) : (
            <div className="flex items-center gap-2">
              <Button onClick={() => acceptInvite.mutate(inviteToken)} disabled={!canRetry}>
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

