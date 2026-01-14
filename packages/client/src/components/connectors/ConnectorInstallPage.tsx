'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'

import api from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { useUserStarships } from '@/hooks/useStarships'
import { useStartOAuthConnector } from '@/hooks/useConnectors'

import { LoginForm } from '@/components/auth/LoginForm'
import { AuthMarketingPanel } from '@/components/auth/AuthMarketingPanel'
import { StarTheme } from '@/components/theme-context'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import Icon from '@/components/primitives/Icon'
import { StarshipsLogo } from '@/components/ui/starships-logo'
import { Orbitron } from 'next/font/google'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'motion/react'

type InstallValidateResponse = {
  ok: true
  provider: string
  verifiedLaunchMetadata: Record<string, unknown>
}

const orbitron = Orbitron({ subsets: ['latin'], weight: ['400'] })

function titleCase(input: string): string {
  const s = String(input || '').trim()
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function ConnectorInstallPage() {
  const router = useRouter()
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
        const msg = err?.response?.data?.error?.message || err?.response?.data?.error || err?.message || 'Failed to validate install request.'
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
  const selectedStarship = useMemo(() => starships?.find(s => s.id === selectedStarshipId), [starships, selectedStarshipId])

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

  const shouldShowLogin = !validateError && !isValidating && launchMetadata && !isAuthenticated
  const shouldShowConfirm = !validateError && !isValidating && launchMetadata && isAuthenticated
  const shouldShowMissingContext = !validateError && !isValidating && !launchMetadata
  const shouldShowLoader = isValidating || authLoading

  const contentKey: 'loading' | 'error' | 'missing' | 'login' | 'confirm' | 'idle' = validateError
    ? 'error'
    : shouldShowLoader
      ? 'loading'
      : shouldShowMissingContext
        ? 'missing'
        : shouldShowLogin
          ? 'login'
          : shouldShowConfirm
            ? 'confirm'
            : 'idle'

  // Smooth height changes for install body without layout transforms affecting the header.
  // We use ResizeObserver so height changes animate reliably (even with AnimatePresence mode="wait").
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const [bodyHeight, setBodyHeight] = useState<number | null>(null)
  const [bodyOverflowVisible, setBodyOverflowVisible] = useState(false)

  useLayoutEffect(() => {
    const el = bodyRef.current
    if (!el) return

    const measure = () => {
      const next = el.getBoundingClientRect().height
      if (Number.isFinite(next) && next >= 0) {
        setBodyHeight(next)
      }
    }

    // Initial measure
    measure()

    const ro = new ResizeObserver(() => {
      // During resize animation, keep overflow hidden so the container feels like it's expanding/collapsing.
      setBodyOverflowVisible(false)
      measure()
    })
    ro.observe(el)

    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    // On content swaps, ensure we don't clip focus rings after the resize finishes.
    setBodyOverflowVisible(false)
  }, [contentKey])

  return (
    <StarTheme theme="dark">
      <div className="min-h-[100dvh] bg-black relative overflow-hidden flex items-center justify-center">
        <AuthMarketingPanel className="fixed inset-0" />

        {/* Header with logo (match /login look) */}
        <header className="fixed top-4 sm:top-8 left-0 right-0 z-50">
          <div className="px-4 sm:px-8 flex items-center justify-between h-8">
            <button className="cursor-pointer select-none h-8 flex items-center" onClick={() => router.push('/')} title="Go to home" type="button">
              <span className="flex items-center gap-2">
                <StarshipsLogo width={32} height={32} className="text-foreground" idleLoop={false} playOnMountOnce={false} />
                <span className={`${orbitron.className} text-lg sm:text-xl md:text-2xl font-normal tracking-tight leading-none`}>starships.ai</span>
              </span>
            </button>
          </div>
        </header>

        <div className="w-full flex items-start justify-center px-6 pt-28 pb-16 relative z-10">
          <div className="w-full max-w-md space-y-4">
            <Card>
              <CardHeader className="space-y-4 text-center">
                  {/* Connection preview (top of card) */}
                  <div className="flex items-center justify-center py-1">
                    <div className="h-[84px] w-[84px] rounded-full bg-black/40 border-2 border-white/15 shadow-sm flex items-center justify-center">
                      <StarshipsLogo width={48} height={48} className="text-foreground" idleLoop={false} playOnMountOnce={false} />
                    </div>

                    <div
                      className="-mx-px h-[3px] w-16"
                      aria-hidden="true"
                      style={{
                        backgroundImage: 'repeating-linear-gradient(to right, rgba(255,255,255,0.15) 0 3px, transparent 3px 7px)',
                      }}
                    />

                    <div className="h-[84px] w-[84px] rounded-full bg-black/40 border-2 border-white/15 shadow-sm flex items-center justify-center overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={providerIconSrc}
                        alt={`${providerLabel} logo`}
                        className="h-12 w-12 object-contain"
                        onError={e => {
                          ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                        }}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <CardTitle className="text-xl">Connect Starships.ai to {providerLabel}</CardTitle>
                    <CardDescription>{!isAuthenticated ? 'Sign in to Starships.ai to continue.' : `Select a starship, then continue to ${providerLabel}.`}</CardDescription>
                  </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <motion.div
                  // Animate container height; content swaps fade without collapsing to 0.
                  animate={bodyHeight === null ? {} : { height: bodyHeight }}
                  transition={{ duration: 0.28 }}
                  onAnimationComplete={() => setBodyOverflowVisible(true)}
                  style={{ overflow: bodyOverflowVisible ? 'visible' : 'hidden' }}
                >
                  <div ref={bodyRef} className="space-y-4">
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.div
                        key={contentKey}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        {contentKey === 'loading' && (
                          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                            <Icon name="loader-2" className="h-4 w-4 animate-spin" />
                            Validating install…
                          </div>
                        )}

                        {contentKey === 'error' && (
                          <Alert>
                            <Icon name="info" className="h-4 w-4" />
                            <AlertDescription>{validateError}</AlertDescription>
                          </Alert>
                        )}

                        {contentKey === 'missing' && (
                          <Alert>
                            <Icon name="info" className="h-4 w-4" />
                            <AlertDescription>Unable to load install context.</AlertDescription>
                          </Alert>
                        )}

                        {contentKey === 'login' && <LoginForm embedded />}

                        {contentKey === 'confirm' && (
                          <>
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
                                      {starships.map(s => (
                                        <SelectItem key={s.id} value={s.id}>
                                          {s.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>

                                <Button className="w-full" disabled={!selectedStarshipId || isStarting || startOAuth.isPending} onClick={onStart}>
                                  {isStarting || startOAuth.isPending ? 'Starting…' : `Continue to ${providerLabel}`}
                                </Button>
                              </>
                            )}
                          </>
                        )}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </motion.div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </StarTheme>
  )
}
