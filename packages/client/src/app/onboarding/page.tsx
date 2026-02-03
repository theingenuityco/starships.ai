'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useUserStarships, useUpdateStarship, useStarshipAgents } from '@/hooks/useStarships'
import { useCreateStarshipInvite } from '@/hooks/useStarshipInvites'
import { useCreateAgentFromTemplate } from '@/hooks/useTemplates'
import { useAgentTemplates } from '@/hooks/useTemplates'
import { useCompleteWizardOnboarding } from '@/hooks/useWizardOnboarding'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import Icon from '@/components/primitives/Icon'
import { MarketplaceAvatar } from '@/components/marketplace/MarketplaceAvatar'
import type { AgentTemplateModel } from '@starships/protocol'

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
  const createAgent = useCreateAgentFromTemplate()
  const completeWizard = useCompleteWizardOnboarding()

  const { data: allTemplates = [], isLoading: templatesLoading } = useAgentTemplates(undefined, !!primaryStarship?.id && step === 3)
  const { data: deployedAgents = [] } = useStarshipAgents(primaryStarship?.id ?? '', !!(primaryStarship?.id && step === 3))
  const curatedTemplates = allTemplates.slice(0, 4)

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
    await updateStarship.mutateAsync({ starshipId: primaryStarship.id, updates: { name } })
    setStep(2)
  }, [starshipName, primaryStarship, updateStarship])

  const handleStep2Next = useCallback(async () => {
    const emails = inviteEmails
      .split(/[\s,]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
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
  }, [inviteEmails, primaryStarship?.id, createInvite])

  const handleStep3Next = useCallback(() => {
    setStep(4)
  }, [])

  const handleDeployAgent = useCallback(
    async (template: AgentTemplateModel) => {
      if (!primaryStarship?.id || !primaryStarship?.slug) return
      await createAgent.mutateAsync({
        templateId: template.id,
        starshipId: primaryStarship.id,
        starshipSlug: primaryStarship.slug,
      })
    },
    [primaryStarship, createAgent]
  )

  const handleFinish = useCallback(async () => {
    await completeWizard.mutateAsync()
    if (primaryStarship?.slug) {
      router.push(`/ship/${primaryStarship.slug}`)
    } else {
      router.push('/marketplace')
    }
  }, [completeWizard, primaryStarship?.slug, router])

  const isAlreadyDeployed = useCallback(
    (templateId: string) => deployedAgents.some((a) => a.sourceTemplateId === templateId),
    [deployedAgents]
  )

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
      <div className="mx-auto w-full max-w-lg flex-1 px-6 py-12">
        <p className="text-xs text-muted-foreground">Step {step} of {TOTAL_STEPS}</p>

        {step === 1 && (
          <div className="mt-6 space-y-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">What do you want to call your starship?</h1>
              <p className="mt-1 text-muted-foreground">
                Choose a name your team will recognise—like your company or project.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="starship-name">Starship name</Label>
              <Input
                id="starship-name"
                value={starshipName}
                onChange={(e) => setStarshipName(e.target.value)}
                placeholder="e.g. Acme Corp"
                maxLength={100}
                className="max-w-md"
              />
            </div>
            <div className="flex justify-end pt-4">
              <Button onClick={handleStep1Next} disabled={!starshipName.trim() || updateStarship.isPending}>
                {updateStarship.isPending ? 'Saving...' : 'Next'}
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="mt-6 space-y-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                Who else is on the {primaryStarship?.name ?? 'starship'} team?
              </h1>
              <p className="mt-1 text-muted-foreground">
                Invite colleagues by email. They&apos;ll get a link to join this starship.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-emails">Email addresses (optional)</Label>
              <textarea
                id="invite-emails"
                className="flex min-h-[100px] w-full max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={inviteEmails}
                onChange={(e) => setInviteEmails(e.target.value)}
                placeholder="e.g. ellis@company.com, maria@company.com"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-4">
              <Button onClick={handleStep2Next} disabled={createInvite.isPending}>
                Next
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setStep(3)}>
                Skip this step
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="mt-6 space-y-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Add an AI teammate (optional)</h1>
              <p className="mt-1 text-muted-foreground">
                Deploy an agent to your starship. You can add more from the marketplace later.
              </p>
            </div>
            {templatesLoading ? (
              <p className="text-sm text-muted-foreground">Loading agents...</p>
            ) : (
              <div className="grid gap-3">
                {curatedTemplates.map((template) => {
                  const already = isAlreadyDeployed(template.id)
                  return (
                    <Card key={template.id} className="overflow-hidden">
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <MarketplaceAvatar
                              imageUrl={template.avatarUrl || null}
                              label={template.name}
                              seed={template.name || 'AI'}
                              sizeClassName="h-10 w-10"
                              shapeClassName="rounded-full"
                              ringClassName="ring-1 ring-border/40"
                              showTintWhenMissing={false}
                              showInsetRing={false}
                              fallbackTextClassName="text-xs font-semibold text-muted-foreground"
                            />
                            <div className="min-w-0">
                              <CardTitle className="text-base">{template.name}</CardTitle>
                              {template.description && (
                                <CardDescription className="mt-0.5 line-clamp-2">
                                  {template.description}
                                </CardDescription>
                              )}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant={already ? 'secondary' : 'default'}
                            disabled={already || createAgent.isPending}
                            onClick={() => handleDeployAgent(template)}
                          >
                            {already ? (
                              <>
                                <Icon name="check-circle" className="h-4 w-4 mr-1" />
                                Added
                              </>
                            ) : (
                              'Add'
                            )}
                          </Button>
                        </div>
                      </CardHeader>
                    </Card>
                  )
                })}
              </div>
            )}
            <div className="flex justify-end pt-4">
              <Button onClick={handleStep3Next}>Next</Button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="mt-6 space-y-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Your starship is ready!</h1>
              <p className="mt-1 text-muted-foreground">
                You can explore agents, connect apps, and talk to Aria in channels or DMs.
              </p>
            </div>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground text-sm">
              <li>Explore agents from the marketplace</li>
              <li>Connect Gmail, Slack, and more</li>
              <li>Chat with Aria in #lobby or in DMs</li>
            </ul>
            <div className="flex justify-end pt-4">
              <Button onClick={() => handleFinish()} disabled={completeWizard.isPending}>
                {completeWizard.isPending ? 'Finishing...' : 'Go to my starship'}
              </Button>
            </div>
          </div>
        )}

        {step > 1 && step < 4 && (
          <div className="mt-8">
            <Button variant="ghost" size="sm" onClick={() => setStep((s) => s - 1)}>
              Back
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
