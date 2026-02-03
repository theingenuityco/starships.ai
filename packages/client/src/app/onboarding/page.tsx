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
import api, { type FetchResponse } from '@/lib/api'
import type { AgentTemplateModel, ApiResponse, CreateStarshipInviteResponse } from '@starships/protocol'
import { toast } from 'sonner'

const orbitron = Orbitron({ subsets: ['latin'], weight: ['400'] })

const TOTAL_STEPS = 4

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

  const handleCopyInviteLink = useCallback(async () => {
    if (!primaryStarship?.id) return
    const emails = parseEmails(inviteEmails)
    // Need at least one email: backend creates a per-email invite link
    if (emails.length === 0) {
      toast.info('Add at least one email above, then click "Invite link" to copy a join link for that person.')
      return
    }

    try {
      const response: FetchResponse<ApiResponse<CreateStarshipInviteResponse>> = await api.post(`/api/v1/starships/${primaryStarship.id}/invites`, {
        email: emails[0],
        role: 'collaborator',
      })
      const data = response.data.data
      const url = data?.inviteUrl
      if (!url) {
        toast.error('Invite link unavailable.')
        return
      }

      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
        toast.success('Invite link copied to clipboard')
      } else {
        toast.success('Invite link generated', { description: url })
      }
    } catch (error) {
      toast.error('Failed to generate invite link.')
    }
  }, [inviteEmails, parseEmails, primaryStarship?.id])

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
      <div className="flex min-h-[100dvh] items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Icon name="rocket" className="h-10 w-10 text-primary animate-pulse" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (!hasStarship || isWizardComplete) {
    return null
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      {/* Top-left Starships brand (match landing / PublicHeader) */}
      <header className="flex items-center gap-2 px-8 pt-6">
        <StarshipsLogo width={36} height={36} className="text-foreground" idleLoop={false} playOnMountOnce={false} />
        <span className={`${orbitron.className} text-lg sm:text-xl md:text-2xl font-normal tracking-tight leading-none text-foreground`}>starships.ai</span>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-3xl">
          <p className="text-xs text-muted-foreground">
            Step {step} of {TOTAL_STEPS}
          </p>

          {step === 1 && (
            <div className="mt-6 space-y-6">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">What do you want to call your workspace?</h1>
                <p className="mt-2 text-sm text-muted-foreground max-w-xl">Choose a name your team will recognise—like your company or project.</p>
              </div>
              <div className="space-y-2 max-w-xl">
                <Label htmlFor="starship-name">Starship name</Label>
                <Input id="starship-name" value={starshipName} onChange={e => setStarshipName(e.target.value)} placeholder="e.g. Acme Corp" maxLength={100} />
              </div>
              <div className="flex items-center justify-end pt-6">
                <Button onClick={handleStep1Next} disabled={!starshipName.trim() || updateStarship.isPending}>
                  {updateStarship.isPending ? 'Saving…' : 'Next'}
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="mt-6 space-y-6">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Who else is on the {primaryStarship?.name ?? 'starship'} team?</h1>
                <p className="mt-2 text-sm text-muted-foreground max-w-xl">Invite colleagues by email. They&apos;ll get a link to join this starship.</p>
              </div>
              <div className="space-y-2 max-w-xl">
                <Label htmlFor="invite-emails">Email addresses (optional)</Label>
                <textarea
                  id="invite-emails"
                  className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={inviteEmails}
                  onChange={e => setInviteEmails(e.target.value)}
                  placeholder="e.g. ellis@company.com, maria@company.com"
                />
              </div>
              <div className="mt-6 rounded-lg border border-border/60 bg-card/30 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                <Button variant="ghost" size="sm" onClick={() => setStep(1)} className="h-9 order-1 sm:order-none">
                  Back
                </Button>
                <div className="flex items-center gap-2 w-full sm:w-auto justify-end sm:justify-normal order-2">
                  <Button type="button" variant="outline" size="sm" onClick={handleCopyInviteLink} disabled={!primaryStarship?.id} className="h-9 inline-flex items-center gap-2 shrink-0">
                    <Icon name="link" className="h-4 w-4 shrink-0" />
                    Invite link
                  </Button>
                  <Button size="sm" onClick={handleStep2Next} disabled={createInvite.isPending} className="h-9 shrink-0">
                    Next
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setStep(3)} className="h-9 shrink-0">
                    Skip this step
                  </Button>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="mt-6 flex flex-col max-w-4xl w-full" style={{ maxHeight: 'min(calc(100dvh - 12rem), 720px)' }}>
              <div className="shrink-0">
                <h1 className="text-3xl font-bold tracking-tight">Add an AI teammate (recommended)</h1>
                <p className="mt-2 text-sm text-muted-foreground max-w-xl"> You can add more agents from the marketplace later.</p>
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
              <div className="flex items-center justify-between gap-3 pt-4 shrink-0 border-t border-border/40 mt-4">
                <Button variant="ghost" size="sm" onClick={() => setStep(2)} className="h-9">
                  Back
                </Button>
                <Button onClick={handleStep3Next} className="h-9">
                  Next
                </Button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="mt-6 space-y-6">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Your starship is ready!</h1>
                <p className="mt-2 text-sm text-muted-foreground max-w-xl">You can continue with the free tier and upgrade anytime.</p>
              </div>

              {primaryStarship?.id && (
                <div className="mt-4">
                  <StarshipUpgradeSection starshipId={primaryStarship.id} />
                </div>
              )}

              <div className="flex items-center justify-between pt-6">
                <Button variant="ghost" size="sm" onClick={() => setStep(3)}>
                  Back
                </Button>
                <Button onClick={() => handleFinish()} disabled={completeWizard.isPending}>
                  {completeWizard.isPending ? 'Finishing…' : 'Complete'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
