'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
import { useAcceptStarshipInvite } from '@/hooks/useStarshipInvites'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

type InvitePreviewResponse = {
  invitedEmail: string
  role: 'admin' | 'collaborator'
  expiresAt: string
  starship: { id: string; slug: string; name: string }
}

export default function AcceptInvitePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Canonical param is `invite` (no backwards compatibility with `token`).
  const inviteToken = (searchParams.get('invite') || '').trim()
  const hasLegacyTokenParam = Boolean((searchParams.get('token') || '').trim())

  const { isAuthenticated, isLoading, userEmail } = useAuth()
  const acceptInvite = useAcceptStarshipInvite()

  const [attempted, setAttempted] = useState(false)
  const [preview, setPreview] = useState<InvitePreviewResponse | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const returnUrl = useMemo(() => {
    if (!inviteToken) return '/accept-invite'
    return `/accept-invite?invite=${encodeURIComponent(inviteToken)}`
  }, [inviteToken])

  useEffect(() => {
    if (!inviteToken) return
    if (preview || previewLoading || previewError) return

    setPreviewLoading(true)
    void fetch('/api/v1/starship-invites/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: inviteToken }),
    })
      .then(async r => {
        const json = await r.json().catch(() => null)
        if (!r.ok || !json?.data) {
          throw new Error(json?.error?.message || 'Invalid or expired invite token')
        }
        setPreview(json.data as InvitePreviewResponse)
      })
      .catch((e: any) => {
        setPreviewError(typeof e?.message === 'string' ? e.message : 'Invalid or expired invite token')
      })
      .finally(() => setPreviewLoading(false))
  }, [inviteToken, preview, previewLoading, previewError])

  useEffect(() => {
    if (!inviteToken) return
    if (previewLoading) return
    if (previewError) return
    if (!preview) return

    const invitedEmail = (preview.invitedEmail || '').trim().toLowerCase()
    const currentEmail = (userEmail || '').trim().toLowerCase()

    // If the user is logged in as the wrong email, force logout and prompt sign-in as the invited email.
    if (!isLoading && isAuthenticated && invitedEmail && currentEmail && invitedEmail !== currentEmail) {
      router.replace(
        `/login?logout=true&expectedEmail=${encodeURIComponent(preview.invitedEmail)}&returnUrl=${encodeURIComponent(returnUrl)}&tab=login`
      )
      return
    }

    // If not logged in, redirect to login and come back here after auth.
    if (!isLoading && !isAuthenticated) {
      const expected = preview.invitedEmail ? `&expectedEmail=${encodeURIComponent(preview.invitedEmail)}` : ''
      router.replace(`/login?returnUrl=${encodeURIComponent(returnUrl)}${expected}&tab=login`)
      return
    }
  }, [inviteToken, previewLoading, previewError, preview, isLoading, isAuthenticated, userEmail, router, returnUrl])

  useEffect(() => {
    if (!inviteToken) return
    if (previewLoading) return
    if (previewError) return
    if (!preview) return

    const invitedEmail = (preview.invitedEmail || '').trim().toLowerCase()
    const currentEmail = (userEmail || '').trim().toLowerCase()
    if (invitedEmail && currentEmail && invitedEmail !== currentEmail) return

    if (!isAuthenticated) return
    if (attempted) return

    setAttempted(true)
    void acceptInvite
      .mutateAsync(inviteToken)
      .then(starship => {
        router.replace(`/ship/${encodeURIComponent(starship.slug)}`)
      })
      .catch(() => {
        // errors are surfaced via toast; keep page visible for retry
      })
  }, [inviteToken, previewLoading, previewError, preview, userEmail, isAuthenticated, attempted, acceptInvite, router])

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
          ) : previewLoading ? (
            <p className="text-sm text-muted-foreground">Loading invite…</p>
          ) : previewError ? (
            <p className="text-sm text-muted-foreground">{previewError}</p>
          ) : isLoading ? (
            <p className="text-sm text-muted-foreground">Checking your account…</p>
          ) : !isAuthenticated ? (
            <p className="text-sm text-muted-foreground">Redirecting you to sign in…</p>
          ) : acceptInvite.isPending ? (
            <p className="text-sm text-muted-foreground">Accepting invite…</p>
          ) : preview && userEmail && preview.invitedEmail && preview.invitedEmail.trim().toLowerCase() !== userEmail.trim().toLowerCase() ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                This invite was sent to <span className="font-medium">{preview.invitedEmail}</span>, but you’re signed in as{' '}
                <span className="font-medium">{userEmail}</span>.
              </p>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() =>
                    router.replace(
                      `/login?logout=true&expectedEmail=${encodeURIComponent(preview.invitedEmail)}&returnUrl=${encodeURIComponent(returnUrl)}&tab=login`
                    )
                  }
                >
                  Sign in as invited email
                </Button>
                <Button variant="ghost" onClick={() => router.push('/')} disabled={acceptInvite.isPending}>
                  Cancel
                </Button>
              </div>
            </div>
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

