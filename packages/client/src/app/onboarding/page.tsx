'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { Orbitron } from 'next/font/google'
import { useAuth, AUTH_QUERY_KEYS } from '@/hooks/useAuth'
import { useUserStarships, useUpdateStarship } from '@/hooks/useStarships'
import { useCreateStarshipInvite } from '@/hooks/useStarshipInvites'
import { useCompleteWizardOnboarding } from '@/hooks/useWizardOnboarding'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Icon from '@/components/primitives/Icon'
import { StarshipsLogo } from '@/components/ui/starships-logo'
import { StarshipUpgradeSection } from '@/components/settings/StarshipUpgradeSection'
import { StarTheme } from '@/components/theme-context'
import { AuthMarketingPanel } from '@/components/auth/AuthMarketingPanel'
const orbitron = Orbitron({ subsets: ['latin'], weight: ['400'] })

const TOTAL_STEPS = 3

/** Shared content width for all steps. */
const CONTENT_MAX_W = 'max-w-3xl'
/** Slightly wider width for global nav so buttons sit outside form card. */
const NAV_MAX_W = 'max-w-5xl'
/** Consistent input/field width across steps. */
const INPUT_MAX_W = 'max-w-xl'
/** Primary nav button (Next/Complete) min width and height. */
const BTN_PRIMARY = 'min-w-[100px] h-10'
const BTN_NAV_GHOST = 'h-10'
type OnboardingPersistedState = {
  step: number
  starshipName: string
  inviteEmailRows: string[]
  /** Emails we already sent an invite to this wizard run (avoids re-sending on Back then Next). */
  invitedEmails: string[]
}

const ONBOARDING_STORAGE_PREFIX = 'starships:onboarding:wizard:'

function readPersistedOnboardingState(starshipId?: string | null): OnboardingPersistedState | null {
  if (!starshipId || typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(`${ONBOARDING_STORAGE_PREFIX}${starshipId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<OnboardingPersistedState>
    if (!parsed || typeof parsed !== 'object') return null
    return {
      step: typeof parsed.step === 'number' ? parsed.step : 1,
      starshipName: typeof parsed.starshipName === 'string' ? parsed.starshipName : '',
      inviteEmailRows: Array.isArray(parsed.inviteEmailRows) && parsed.inviteEmailRows.length > 0 ? parsed.inviteEmailRows : [''],
      invitedEmails: Array.isArray(parsed.invitedEmails) ? parsed.invitedEmails : [],
    }
  } catch {
    return null
  }
}

function writePersistedOnboardingState(starshipId: string | null | undefined, state: OnboardingPersistedState) {
  if (!starshipId || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(`${ONBOARDING_STORAGE_PREFIX}${starshipId}`, JSON.stringify(state))
  } catch {
    // Best-effort persistence — ignore quota / privacy errors
  }
}

function clearPersistedOnboardingState(starshipId?: string | null) {
  if (!starshipId || typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(`${ONBOARDING_STORAGE_PREFIX}${starshipId}`)
  } catch {
    // Ignore storage errors on clear
  }
}

export default function OnboardingPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user, userId, isAuthenticated, isLoading: authLoading } = useAuth()
  const { data: starships = [], isLoading: starshipsLoading } = useUserStarships(userId || '', !!userId)
  // Prefer an owned starship for onboarding so existing owners who were invited elsewhere still see the full wizard for their workspace
  const primaryStarship = starships.find(s => s.ownerId === userId) ?? starships[0]

  const [step, setStep] = useState(1)
  const [starshipName, setStarshipName] = useState('')
  const [inviteEmailRows, setInviteEmailRows] = useState<string[]>([''])
  /** Emails we already sent an invite to this wizard run; avoids re-sending when user goes Back then Next. */
  const [emailsInvitedThisSession, setEmailsInvitedThisSession] = useState<string[]>([])

  const updateStarship = useUpdateStarship()
  const createInvite = useCreateStarshipInvite(primaryStarship?.id ?? '')
  const completeWizard = useCompleteWizardOnboarding()

  const userFirstName = (() => {
    const raw = (user?.name || user?.email?.split('@')[0] || '').trim()
    const first = raw.split(/\s+/)[0]
    return first || ''
  })()

  useEffect(() => {
    if (!primaryStarship?.name) return
    const base = primaryStarship.name.trim()
    const alreadyPersonalized = userFirstName && base.startsWith(`${userFirstName}'s `)
    const suggestion = userFirstName && !alreadyPersonalized ? `${userFirstName}'s ${base}` : base
    setStarshipName(suggestion)
  }, [primaryStarship?.name, userFirstName])

  const isWizardComplete = user?.wizardOnboardingCompleted ?? false
  const hasStarship = primaryStarship != null
  /** User joined via invite (member, not owner) — show short "You've joined" instead of full wizard */
  const isJoiner = Boolean(hasStarship && userId && primaryStarship?.ownerId && primaryStarship.ownerId !== userId)

  useEffect(() => {
    if (authLoading || !isAuthenticated) return
    if (isWizardComplete) {
      router.replace(primaryStarship?.slug ? `/ship/${primaryStarship.slug}` : '/explore')
      return
    }
    if (!hasStarship && !starshipsLoading) {
      router.replace('/account')
    }
  }, [authLoading, isAuthenticated, isWizardComplete, hasStarship, starshipsLoading, primaryStarship?.slug, router])

  // Hydrate wizard state from localStorage once we know the primary starship.
  useEffect(() => {
    if (!primaryStarship?.id) return
    const persisted = readPersistedOnboardingState(primaryStarship.id)
    if (!persisted) return

    const clampedStep = Math.min(Math.max(persisted.step, 1), TOTAL_STEPS)
    setStep(clampedStep)
    if (persisted.starshipName) {
      setStarshipName(persisted.starshipName)
    }
    if (persisted.inviteEmailRows && persisted.inviteEmailRows.length > 0) {
      setInviteEmailRows(persisted.inviteEmailRows)
    }
    if (persisted.invitedEmails && persisted.invitedEmails.length > 0) {
      setEmailsInvitedThisSession(persisted.invitedEmails)
    }
  }, [primaryStarship?.id])

  // Persist wizard state whenever it changes.
  useEffect(() => {
    if (!primaryStarship?.id) return
    writePersistedOnboardingState(primaryStarship.id, {
      step,
      starshipName,
      inviteEmailRows,
      invitedEmails: emailsInvitedThisSession,
    })
  }, [primaryStarship?.id, step, starshipName, inviteEmailRows, emailsInvitedThisSession])

  const handleStep1Next = useCallback(async () => {
    const name = starshipName.trim()
    if (!name || !primaryStarship) return
    const currentName = (primaryStarship.name ?? '').trim()
    if (name !== currentName) {
      await updateStarship.mutateAsync({ starshipId: primaryStarship.id, updates: { name } })
    }
    setStep(2)
  }, [starshipName, primaryStarship, updateStarship])

  const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((e || '').trim().toLowerCase())

  const addInviteEmailRow = useCallback(() => {
    setInviteEmailRows(prev => [...prev, ''])
  }, [])

  const removeInviteEmailRow = useCallback((index: number) => {
    setInviteEmailRows(prev => prev.filter((_, i) => i !== index))
  }, [])

  const setInviteEmailAt = useCallback((index: number, value: string) => {
    setInviteEmailRows(prev => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }, [])

  const inviteEmailsParsed = useCallback((): string[] => {
    return inviteEmailRows.map(e => e.trim().toLowerCase()).filter(e => e && validEmail(e))
  }, [inviteEmailRows])

  const handleStep2Next = useCallback(async () => {
    const emails = inviteEmailsParsed()
    const alreadyInvited = new Set(emailsInvitedThisSession.map(e => e.toLowerCase()))
    const toSend = emails.filter(e => !alreadyInvited.has(e.toLowerCase()))
    if (toSend.length > 0 && primaryStarship?.id) {
      for (const email of toSend) {
        try {
          await createInvite.mutateAsync({ email, role: 'collaborator' })
        } catch {
          // Toast already from hook; continue with rest
        }
      }
      setEmailsInvitedThisSession(prev => [...prev, ...toSend.map(e => e.toLowerCase())])
    }
    setStep(3)
  }, [inviteEmailsParsed, primaryStarship?.id, createInvite, emailsInvitedThisSession])

  const handleFinish = useCallback(async () => {
    await completeWizard.mutateAsync()
    clearPersistedOnboardingState(primaryStarship?.id)
    await queryClient.refetchQueries({ queryKey: AUTH_QUERY_KEYS.me() })
    if (primaryStarship?.slug) {
      router.push(`/ship/${primaryStarship.slug}`)
    } else {
      router.push('/explore')
    }
  }, [completeWizard, queryClient, primaryStarship?.slug, router])

  const primaryCtaLabel = (() => {
    if (step === 1) {
      return updateStarship.isPending ? 'Saving…' : 'Next ->'
    }
    if (step === 3) {
      return completeWizard.isPending ? 'Finishing…' : 'Complete'
    }
    return 'Next ->'
  })()

  const isPrimaryCtaDisabled = (() => {
    if (step === 1) {
      return !starshipName.trim() || updateStarship.isPending
    }
    if (step === 2) {
      return createInvite.isPending
    }
    if (step === 3) {
      return completeWizard.isPending
    }
    return false
  })()

  const handlePrimaryCtaClick = useCallback(() => {
    if (step === 1) return handleStep1Next()
    if (step === 2) return handleStep2Next()
    if (step === 3) return handleFinish()
  }, [step, handleStep1Next, handleStep2Next, handleFinish])

  if (authLoading || !isAuthenticated || (hasStarship && starshipsLoading)) {
    return (
      <StarTheme theme="dark">
        <div className="min-h-[100dvh] bg-black relative overflow-hidden flex items-center justify-center">
          <AuthMarketingPanel className="fixed inset-0" />
          <div className="fixed inset-0 bg-black/40 z-[1]" aria-hidden />
          <div className="flex flex-col items-center gap-4 relative z-10">
            <Icon name="rocket" className="h-10 w-10 text-primary animate-pulse" />
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      </StarTheme>
    )
  }

  if (!hasStarship || isWizardComplete) {
    return null
  }

  /** Joiner flow: minimal "You've joined" screen, no rename/invite/agents/upgrade steps */
  if (isJoiner) {
    const starshipDisplayName = primaryStarship?.name?.trim() || 'your team'
    return (
      <StarTheme theme="dark">
        <div className="min-h-[100dvh] bg-black relative overflow-hidden flex flex-col">
          <AuthMarketingPanel className="fixed inset-0" />
          <div className="fixed inset-0 bg-black/40 z-[1]" aria-hidden />
          <header className="flex items-center gap-2 px-8 pt-6 relative z-10">
            <StarshipsLogo width={36} height={36} className="text-foreground" idleLoop={false} playOnMountOnce={false} />
            <span className={`${orbitron.className} text-lg sm:text-xl md:text-2xl font-normal tracking-tight leading-none text-foreground`}>starships.ai</span>
          </header>
          <main className="flex flex-1 flex-col items-center justify-start px-4 pt-14 pb-24 relative z-10">
            <div className={`w-full mx-auto min-w-0 ${CONTENT_MAX_W}`}>
              <h1 className="text-3xl font-bold tracking-tight">You&apos;ve joined {starshipDisplayName}</h1>
              <p className="mt-2 text-sm text-muted-foreground">You&apos;re all set. Go to the workspace to collaborate and use agents.</p>
              <div className="mt-8">
                <Button onClick={handleFinish} disabled={completeWizard.isPending} className={BTN_PRIMARY}>
                  {completeWizard.isPending ? 'Starting…' : 'Get started'}
                </Button>
              </div>
            </div>
          </main>
        </div>
      </StarTheme>
    )
  }

  return (
    <StarTheme theme="dark">
      <div className="min-h-[100dvh] bg-black relative overflow-hidden flex flex-col">
        <AuthMarketingPanel className="fixed inset-0" />
        <div className="fixed inset-0 bg-black/40 z-[1]" aria-hidden />
        {/* Top-left Starships brand (match landing / PublicHeader) */}
        <header className="flex items-center gap-2 px-8 pt-6 relative z-10">
          <StarshipsLogo width={36} height={36} className="text-foreground" idleLoop={false} playOnMountOnce={false} />
          <span className={`${orbitron.className} text-lg sm:text-xl md:text-2xl font-normal tracking-tight leading-none text-foreground`}>starships.ai</span>
        </header>

        <main className="flex flex-1 flex-col items-center justify-start px-4 pt-14 pb-28 relative z-10">
          <div className="w-full flex justify-center">
            <div className={`w-full min-w-0 ${CONTENT_MAX_W}`}>
              <p className="text-xs text-muted-foreground mb-1">
                Step {step} of {TOTAL_STEPS}
              </p>

              {step === 1 && (
                <div className="mt-6 flex flex-col">
                  <div className="space-y-6">
                    <div>
                      <h1 className="text-3xl font-bold tracking-tight">Name your workspace</h1>
                      <p className="mt-2 text-sm text-muted-foreground">Choose a name your team will recognise, like your company or project.</p>
                    </div>
                    <div className={`space-y-2 ${INPUT_MAX_W}`}>
                      <Label htmlFor="starship-name">Starship name</Label>
                      <Input
                        id="starship-name"
                        value={starshipName}
                        onChange={e => setStarshipName(e.target.value)}
                        placeholder="e.g. Acme Corp"
                        maxLength={100}
                        style={{ color: '#000000', backgroundColor: '#ffffff' }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="mt-6 flex flex-col">
                  <div className="space-y-6">
                    <div>
                      <h1 className="text-3xl font-bold tracking-tight">Invite your team</h1>
                      <p className="mt-2 text-sm text-muted-foreground">Who else is on the {primaryStarship?.name ?? 'your workspace'} team?</p>
                    </div>
                    <div className={`space-y-3 ${INPUT_MAX_W}`}>
                      <ul className="flex flex-col gap-3 w-full">
                        {inviteEmailRows.map((email, idx) => (
                          <li key={idx} className="flex items-center gap-2 w-full">
                            <Input type="email" value={email} onChange={e => setInviteEmailAt(idx, e.target.value)} placeholder="colleague@company.com" className="flex-1 min-w-0" />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              onClick={() => removeInviteEmailRow(idx)}
                              disabled={inviteEmailRows.length <= 1}
                              aria-label="Remove email"
                            >
                              <Icon name="x" className="w-3 h-3" />
                            </Button>
                          </li>
                        ))}
                      </ul>
                      <Button type="button" variant="outline" size="sm" onClick={addInviteEmailRow} className="gap-1">
                        <Icon name="plus" className="w-3.5 h-3.5" />
                        Add another
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="mt-6 flex flex-col">
                  <div className="space-y-6">
                    <div>
                      <h1 className="text-3xl font-bold tracking-tight">Your starship is ready!</h1>
                      <p className="mt-2 text-sm text-muted-foreground">You can continue with the free tier and upgrade anytime.</p>
                    </div>

                    {primaryStarship?.id ? (
                      <div className="mt-4 w-full min-w-0">
                        <StarshipUpgradeSection starshipId={primaryStarship.id} cardClassName="bg-transparent border-0 shadow-none w-full" hideDescription />
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Global sticky navigation bar: consistent position across steps */}
          <div className="fixed inset-x-0 bottom-16 px-4 pb-4 pointer-events-none">
            <div className={`mx-auto w-full min-w-0 ${NAV_MAX_W} flex items-center justify-between gap-3 pointer-events-auto`}>
              <div>
                {step > 1 && step <= TOTAL_STEPS && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className={BTN_NAV_GHOST}
                    onClick={() => {
                      if (step === 2) setStep(1)
                      else if (step === 3) setStep(2)
                    }}
                  >
                    {'<- Back'}
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={handlePrimaryCtaClick} disabled={isPrimaryCtaDisabled} className={BTN_PRIMARY}>
                  {primaryCtaLabel}
                </Button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </StarTheme>
  )
}
