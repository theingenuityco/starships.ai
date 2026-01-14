'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'

import api from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { useUserStarships } from '@/hooks/useStarships'
import { useStartOAuthConnector } from '@/hooks/useConnectors'

import { LoginForm } from '@/components/auth/LoginForm'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import Icon from '@/components/primitives/Icon'

type InstallValidateResponse = {
  ok: true
  provider: string
  verifiedLaunchMetadata: Record<string, unknown>
}

function titleCase(input: string): string {
  const s = String(input || '').trim()
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function ConnectorInstallPage() {
  const params = useParams<{ provider: string }>()
  const searchParams = useSearchParams()
  const provider = (params?.provider || '').trim()

  const { isAuthenticated, isLoading: authLoading, user } = useAuth()

  const queryObject = useMemo(() => {
    const out: Record<string, string> = {}
    if (!searchParams) return out
    for (const [k, v] of searchParams.entries()) {
      out[k] = v
    }
    return out
  }, [searchParams])

  const [isValidating, setIsValidating] = useState(true)
  const [validateError, setValidateError] = useState<string | null>(null)
  const [launchMetadata, setLaunchMetadata] = useState<Record<string, unknown> | null>(null)

  // Validate provider-initiated install/entry (unsigned providers are blocked server-side).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setIsValidating(true)
      setValidateError(null)
      setLaunchMetadata(null)

      if (!provider) {
        setValidateError('Missing connector provider.')
        setIsValidating(false)
        return
      }

      try {
        const resp = await api.get(`/api/v1/connectors/${encodeURIComponent(provider)}/install/validate`, {
          params: queryObject,
        })
        const payload = resp.data?.data as InstallValidateResponse
        if (!payload?.ok) {
          throw new Error('Install validation failed')
        }
        if (!cancelled) {
          setLaunchMetadata(payload.verifiedLaunchMetadata || {})
        }
      } catch (err: any) {
        const msg =
          err?.response?.data?.error?.message ||
          err?.response?.data?.error ||
          err?.message ||
          'Failed to validate install request.'
        if (!cancelled) {
          setValidateError(String(msg))
        }
      } finally {
        if (!cancelled) setIsValidating(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [provider, queryObject])

  const providerLabel = titleCase(provider || 'connector')
  const providerIconSrc = `/connectors/${provider}.svg`

  const { data: starships, isLoading: starshipsLoading } = useUserStarships(user?.id || '', isAuthenticated && !!user?.id)
  const [selectedStarshipId, setSelectedStarshipId] = useState<string>('')

  // Auto-select if there is exactly one starship.
  useEffect(() => {
    if (starships && starships.length === 1) {
      setSelectedStarshipId(starships[0].id)
    }
  }, [starships])

  const startOAuth = useStartOAuthConnector(selectedStarshipId || '')
  const [isStarting, setIsStarting] = useState(false)

  const onStart = async () => {
    if (!provider || !selectedStarshipId || !launchMetadata) return
    setIsStarting(true)
    try {
      const authorizationUrl = await startOAuth.mutateAsync({
        provider: provider as any,
        metadata: launchMetadata,
      })

      if (typeof window !== 'undefined') {
        // Embedded apps often require top-level navigation.
        if (window.top) {
          window.top.location.href = authorizationUrl
        } else {
          window.location.href = authorizationUrl
        }
      }
    } finally {
      setIsStarting(false)
    }
  }

  return (
    <div className="min-h-[100dvh] bg-background flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-lg space-y-4">
        <Card>
          <CardHeader className="space-y-2">
            <div className="flex items-center gap-3">
              {/* Provider icon (optional) */}
              <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center overflow-hidden">
                {/* Use img to avoid Next Image restrictions for dynamic public assets */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={providerIconSrc}
                  alt={`${providerLabel} logo`}
                  className="h-10 w-10 object-contain"
                  onError={(e) => {
                    // Hide broken icon (fallback to generic glyph below).
                    ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                  }}
                />
                <Icon name="plug" className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-xl">Connect {providerLabel}</CardTitle>
                <CardDescription>
                  This connection was initiated by {providerLabel}. Sign in to Starships to continue.
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {(isValidating || authLoading) && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Icon name="loader-2" className="h-4 w-4 animate-spin" />
                Validating install…
              </div>
            )}

            {validateError && (
              <Alert>
                <Icon name="info" className="h-4 w-4" />
                <AlertDescription>{validateError}</AlertDescription>
              </Alert>
            )}

            {!validateError && !isValidating && !launchMetadata && (
              <Alert>
                <Icon name="info" className="h-4 w-4" />
                <AlertDescription>Unable to load install context.</AlertDescription>
              </Alert>
            )}

            {/* Step 1: Login */}
            {!validateError && !isValidating && launchMetadata && !isAuthenticated && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Sign in or create an account to continue.</p>
                <LoginForm />
              </div>
            )}

            {/* Step 2: Confirm */}
            {!validateError && !isValidating && launchMetadata && isAuthenticated && (
              <div className="space-y-4">
                {starshipsLoading && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Icon name="loader-2" className="h-4 w-4 animate-spin" />
                    Loading your starships…
                  </div>
                )}

                {!starshipsLoading && (!starships || starships.length === 0) && (
                  <Alert>
                    <Icon name="info" className="h-4 w-4" />
                    <AlertDescription>You don’t have any starships yet. Create one in your profile to connect apps.</AlertDescription>
                  </Alert>
                )}

                {!starshipsLoading && starships && starships.length > 0 && (
                  <>
                    <div className="space-y-2">
                      <Label>Starship</Label>
                      <Select value={selectedStarshipId} onValueChange={setSelectedStarshipId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a starship" />
                        </SelectTrigger>
                        <SelectContent>
                          {starships.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <Alert>
                      <Icon name="info" className="h-4 w-4" />
                      <AlertDescription>
                        You’re about to connect <strong>{providerLabel}</strong> to the selected starship.
                      </AlertDescription>
                    </Alert>

                    <Button className="w-full" disabled={!selectedStarshipId || isStarting || startOAuth.isPending} onClick={onStart}>
                      {isStarting || startOAuth.isPending ? 'Starting…' : `Continue to ${providerLabel}`}
                    </Button>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

