'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Orbitron } from 'next/font/google'
import { useAuth } from '@/hooks/useAuth'
import { useUserStarships, useUpdateStarship } from '@/hooks/useStarships'
import { useCreateStarshipInvite } from '@/hooks/useStarshipInvites'
import { useAgentTemplates } from '@/hooks/useTemplates'
import { useCompleteWizardOnboarding } from '@/hooks/useWizardOnboarding'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Icon from '@/components/primitives/Icon'
import { StarshipsLogo } from '@/components/ui/starships-logo'
import { AgentTemplateCard } from '@/components/marketplace/AgentTemplateCard'
import { StarshipUpgradeSection } from '@/components/settings/StarshipUpgradeSection'
import { StarTheme } from '@/components/theme-context'
import { AuthMarketingPanel } from '@/components/auth/AuthMarketingPanel'
import type { AgentTemplateModel } from '@starships/protocol'

const orbitron = Orbitron({ subsets: ['latin'], weight: ['400'] })

const TOTAL_STEPS = 4

/** Shared content width for steps 1, 2, 4; step 3 uses wider layout. */
const CONTENT_MAX_W = 'max-w-3xl'
const CONTENT_MAX_W_STEP3 = 'max-w-4xl'
/** Consistent input/field width across steps. */
const INPUT_MAX_W = 'max-w-xl'
/** Primary nav button (Next/Complete) min width and height. */
const BTN_PRIMARY = 'min-w-[100px] h-10'
const BTN_NAV_GHOST = 'h-10'

export default function OnboardingPage() {
  const router = useRouter()
  const { user, userId, isAuthenticated, isLoading: authLoading } = useAuth()
  const { data: starships = [], isLoading: starshipsLoading } = useUserStarships(userId || '', !!userId)
  const primaryStarship = starships[0]

  const [step, setStep] = useState(1)
  const [starshipName, setStarshipName] = useState('')
  const [inviteEmails, setInviteEmails] = useState('')

  const updateStarship = useUpdateStarship()
  const createInvite = useCreateStarshipInvite(primaryStarship?.id ?? '')
  const completeWizard = useCompleteWizardOnboarding()

  const { data: allTemplates = [], isLoading: templatesLoading } = useAgentTemplates(undefined, !!primaryStarship?.id && step === 3)
  const curatedTemplates: AgentTemplateModel[] = allTemplates.slice(0, 4)

  useEffect(() => {
    if (primaryStarship?.name) setStarshipName(primaryStarship.name)
  }, [primaryStarship?.name])

  const isWizardComplete = user?.wizardOnboardingCompleted ?? false
  const hasStarship = primaryStarship != null

  useEffect(() => {
    if (authLoading || !isAuthenticated) return
    if (isWizardComplete) {
      if (user?.navigationOnboardingCompleted ?? true) {
        router.replace(primaryStarship?.slug ? `/ship/${primaryStarship.slug}` : '/marketplace')
      } else {
        router.replace('/marketplace')
      }
      return
    }
    if (!hasStarship && !starshipsLoading) {
      router.replace('/profile')
    }
  }, [authLoading, isAuthenticated, isWizardComplete, hasStarship, starshipsLoading, user?.navigationOnboardingCompleted, primaryStarship?.slug, router])

  const handleStep1Next = useCallback(async () => {
    const name = starshipName.trim()
    if (!name || !primaryStarship) return
    const currentName = (primaryStarship.name ?? '').trim()
    if (name !== currentName) {
      await updateStarship.mutateAsync({ starshipId: primaryStarship.id, updates: { name } })
    }
    setStep(2)
  }, [starshipName, primaryStarship, updateStarship])

  const parseEmails = useCallback((raw: string): string[] => {
    return raw
      .split(/[\s,]+/)
      .map(e => e.trim().toLowerCase())
      .filter(e => e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
  }, [])

  const handleStep2Next = useCallback(async () => {
    const emails = parseEmails(inviteEmails)
    if (emails.length > 0 && primaryStarship?.id) {
      for (const email of emails) {
        try {
          await createInvite.mutateAsync({ email, role: 'collaborator' })
        } catch {
          // Toast already from hook; continue with rest
        }
      }
    }
    setStep(3)
  }, [inviteEmails, primaryStarship?.id, createInvite, parseEmails])

  const handleStep3Next = useCallback(() => {
    setStep(4)
  }, [])

  const handleFinish = useCallback(async () => {
    await completeWizard.mutateAsync()
    if (primaryStarship?.slug) {
      router.push(`/ship/${primaryStarship.slug}`)
    } else {
      router.push('/marketplace')
    }
  }, [completeWizard, primaryStarship?.slug, router])

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

        <main className="flex flex-1 flex-col items-center justify-center px-4 py-10 relative z-10">
        <div className={`w-full mx-auto min-w-0 ${step === 3 ? CONTENT_MAX_W_STEP3 : CONTENT_MAX_W}`}>
          <p className="text-xs text-muted-foreground mb-1">
            Step {step} of {TOTAL_STEPS}
          </p>

          {step === 1 && (
            <div className="mt-6 space-y-6">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">What do you want to call your workspace?</h1>
                <p className="mt-2 text-sm text-muted-foreground">Choose a name your team will recognise, like your company or project.</p>
              </div>
              <div className={`space-y-2 ${INPUT_MAX_W}`}>
                <Label htmlFor="starship-name">Starship name</Label>
                <Input id="starship-name" value={starshipName} onChange={e => setStarshipName(e.target.value)} placeholder="e.g. Acme Corp" maxLength={100} />
              </div>
              <div className="flex items-center justify-end pt-6">
                <Button onClick={handleStep1Next} disabled={!starshipName.trim() || updateStarship.isPending} className={BTN_PRIMARY}>
                  {updateStarship.isPending ? 'Saving…' : 'Next'}
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="mt-6 space-y-6">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Who else is on the {primaryStarship?.name ?? 'starship'} team?</h1>
                <p className="mt-2 text-sm text-muted-foreground">Invite colleagues by email. They&apos;ll get a link to join this starship.</p>
              </div>
              <div className={`space-y-2 ${INPUT_MAX_W}`}>
                <Label htmlFor="invite-emails">Email addresses (optional)</Label>
                <textarea
                  id="invite-emails"
                  className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={inviteEmails}
                  onChange={e => setInviteEmails(e.target.value)}
                  placeholder="e.g. ellis@company.com, maria@company.com"
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 pt-6">
                <Button variant="ghost" size="sm" onClick={() => setStep(1)} className={BTN_NAV_GHOST}>
                  Back
                </Button>
                <div className="flex items-center gap-2">
                  <Button onClick={handleStep2Next} disabled={createInvite.isPending} className={BTN_PRIMARY}>
                    Next
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setStep(3)} className={BTN_NAV_GHOST}>
                    Skip this step
                  </Button>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="mt-6 flex flex-col w-full" style={{ maxHeight: 'min(calc(100dvh - 12rem), 720px)' }}>
              <div className="shrink-0">
                <h1 className="text-3xl font-bold tracking-tight">Add an AI teammate (recommended)</h1>
                <p className="mt-2 text-sm text-muted-foreground">You can add more agents from the marketplace later.</p>
              </div>
              {templatesLoading ? (
                <p className="mt-4 text-sm text-muted-foreground">Loading agents...</p>
              ) : curatedTemplates.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">No recommended agents available yet. You can always deploy agents from the marketplace later.</p>
              ) : (
                <div className="mt-4 min-h-0 flex-1 overflow-y-auto rounded-lg border border-border/60 bg-card/30 p-2 -mx-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 pb-2">
                    {curatedTemplates.map(template => (
                      <AgentTemplateCard
                        key={template.id}
                        template={template}
                        targetStarshipId={primaryStarship?.id}
                        onClick={() => window.open(`/marketplace/agents/${encodeURIComponent(template.slug)}`, '_blank', 'noopener,noreferrer')}
                      />
                    ))}
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between gap-3 pt-4 shrink-0 mt-4">
                <Button variant="ghost" size="sm" onClick={() => setStep(2)} className={BTN_NAV_GHOST}>
                  Back
                </Button>
                <Button onClick={handleStep3Next} className={BTN_PRIMARY}>
                  Next
                </Button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="mt-6 space-y-6">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Your starship is ready!</h1>
                <p className="mt-2 text-sm text-muted-foreground">You can continue with the free tier and upgrade anytime.</p>
              </div>

              {primaryStarship?.id && (
                <div className="mt-4">
                  <StarshipUpgradeSection starshipId={primaryStarship.id} cardClassName="bg-card/30 border-border/60" />
                </div>
              )}

              <div className="flex items-center justify-between pt-6">
                <Button variant="ghost" size="sm" onClick={() => setStep(3)} className={BTN_NAV_GHOST}>
                  Back
                </Button>
                <Button onClick={() => handleFinish()} disabled={completeWizard.isPending} className={BTN_PRIMARY}>
                  {completeWizard.isPending ? 'Finishing…' : 'Complete'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>
      </div>
    </StarTheme>
  )
}
