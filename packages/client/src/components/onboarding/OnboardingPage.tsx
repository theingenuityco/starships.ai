'use client'

import Icon from '@/components/primitives/Icon'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { useAuth } from '@/hooks/useAuth'
import {
  ONBOARDING_QUERY_KEYS,
  useOnboardingApply,
  useOnboardingAriaSuggest,
  useOnboardingFinish,
  useOnboardingRecommendations,
  useOnboardingSession,
  useOnboardingStart,
} from '@/hooks/useOnboarding'
import { cn } from '@/lib/utils'
import type { AgentTemplateModel, OnboardingGoal, OnboardingStep } from '@starships/protocol'
import { useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

type WizardStep = 'welcome' | 'goals' | 'connectors' | 'agents' | 'first_task'

const GOAL_LABELS: Record<OnboardingGoal, { title: string; description: string }> = {
  research: { title: 'Research', description: 'Find, summarize, and synthesize information quickly.' },
  analytics: { title: 'Analytics', description: 'Turn data into insights and reports.' },
  support: { title: 'Support', description: 'Draft responses, triage issues, and keep customers happy.' },
  automation: { title: 'Automation', description: 'Automate recurring workflows across your tools.' },
  tool_building: { title: 'Tool-building', description: 'Build tools and agents that extend Starships.' },
}

function stepTitle(step: WizardStep): string {
  switch (step) {
    case 'welcome':
      return 'Welcome'
    case 'goals':
      return 'Choose your goals'
    case 'connectors':
      return 'Connectors'
    case 'agents':
      return 'Pick your crew'
    case 'first_task':
      return 'First task'
  }
}

function nextStep(step: WizardStep): WizardStep {
  switch (step) {
    case 'welcome':
      return 'goals'
    case 'goals':
      return 'connectors'
    case 'connectors':
      return 'agents'
    case 'agents':
      return 'first_task'
    case 'first_task':
      return 'first_task'
  }
}

function renderProgress(step: WizardStep) {
  const steps: WizardStep[] = ['welcome', 'goals', 'connectors', 'agents', 'first_task']
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {steps.map((s, idx) => {
        const isActive = s === step
        const isDone = steps.indexOf(step) > idx
        return (
          <div key={s} className={cn('text-xs px-2 py-1 rounded-full border', isActive && 'border-primary text-primary', isDone && 'bg-muted')}>
            {stepTitle(s)}
          </div>
        )
      })}
    </div>
  )
}

function AriaPanel({
  step,
  goals,
  enabled,
}: {
  step: OnboardingStep
  goals: OnboardingGoal[]
  enabled: boolean
}): React.JSX.Element {
  const suggest = useOnboardingAriaSuggest()
  const [markdown, setMarkdown] = useState<string>('Loading…')
  const [providers, setProviders] = useState<string[]>([])
  const [templates, setTemplates] = useState<AgentTemplateModel[]>([])

  useEffect(() => {
    if (!enabled) {
      setMarkdown('Create your starship to begin. I’ll guide you through goals, connectors, and picking your crew.')
      setProviders([])
      setTemplates([])
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await suggest.mutateAsync({ step, goals })
        if (cancelled) return
        setMarkdown(res.explanationMarkdown || '')
        setProviders(res.recommendedConnectorProviders || [])
        setTemplates(res.recommendedAgentTemplates || [])
      } catch (e: any) {
        if (cancelled) return
        setMarkdown('Tell me what you want to do and I’ll recommend a minimal crew and any required connectors.')
        setProviders([])
        setTemplates([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [enabled, goals, step]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card className="rounded-2xl">
      <CardHeader className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 border border-primary/15 flex items-center justify-center">
            <Icon name="sparkles" className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-base font-semibold">Aria</CardTitle>
            <p className="text-xs text-muted-foreground">I’ll guide you through setup.</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground whitespace-pre-wrap">{markdown}</p>
        {providers.length > 0 ? (
          <div className="space-y-1">
            <div className="text-xs font-medium text-foreground">Suggested connectors</div>
            <div className="text-xs text-muted-foreground">{providers.join(', ')}</div>
          </div>
        ) : null}
        {templates.length > 0 ? (
          <div className="space-y-1">
            <div className="text-xs font-medium text-foreground">Suggested agents</div>
            <div className="text-xs text-muted-foreground">{templates.map((t) => t.name).join(', ')}</div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

export function OnboardingPage(): React.JSX.Element {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user, isAuthenticated, isLoading: authLoading } = useAuth()

  const sessionQuery = useOnboardingSession()
  const startMutation = useOnboardingStart()
  const recMutation = useOnboardingRecommendations()
  const applyMutation = useOnboardingApply()
  const finishMutation = useOnboardingFinish()

  const [step, setStep] = useState<WizardStep>('welcome')
  const [starshipName, setStarshipName] = useState('')
  const [goals, setGoals] = useState<OnboardingGoal[]>([])
  const [recommendedTemplates, setRecommendedTemplates] = useState<AgentTemplateModel[]>([])
  const [recommendedConnectorProviders, setRecommendedConnectorProviders] = useState<string[]>([])
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([])
  const [primaryTemplateId, setPrimaryTemplateId] = useState<string | null>(null)
  const [shipSlug, setShipSlug] = useState<string | null>(null)

  const canInteract = useMemo(() => isAuthenticated && !authLoading, [authLoading, isAuthenticated])
  const session = sessionQuery.data?.session
  const starshipReady = !!session?.starshipId

  // If the user is already onboarded, don't keep them here.
  useEffect(() => {
    if (authLoading) return
    if (isAuthenticated && user?.onboardingCompleted) {
      router.replace('/profile')
    }
  }, [authLoading, isAuthenticated, router, user?.onboardingCompleted])

  // If a session exists, resume from it.
  useEffect(() => {
    if (!session) return
    // Until a starship is created, keep the user on the welcome step.
    if (!session.starshipId) {
      setStep('welcome')
    } else {
      const s = session.step
      if (s === 'welcome') setStep('goals')
      if (s === 'goals') setStep('goals')
      if (s === 'connectors') setStep('connectors')
      if (s === 'agents') setStep('agents')
      if (s === 'first_task') setStep('first_task')
      if (s === 'done') setStep('first_task')
    }

    setGoals(Array.isArray(session.goals) ? session.goals : [])
    setSelectedTemplateIds(Array.isArray(session.selectedAgentTemplateIds) ? session.selectedAgentTemplateIds : [])
    setPrimaryTemplateId(session.primaryAgentTemplateId ?? null)
  }, [session])

  const handleStart = async () => {
    if (!canInteract) return
    try {
      const payload: { starshipName?: string } = {}
      const trimmed = starshipName.trim()
      if (trimmed) payload.starshipName = trimmed

      const res = await startMutation.mutateAsync(payload)
      setShipSlug(res.starship?.slug || null)
      toast.success('Starship created', { description: 'Aria is ready to guide you.' })
      await queryClient.invalidateQueries({ queryKey: ONBOARDING_QUERY_KEYS.session() })
      setStep('goals')
    } catch (e: any) {
      toast.error('Could not start onboarding', { description: e?.message || 'Please try again.' })
    }
  }

  const handleGoalsContinue = async () => {
    if (!canInteract) return
    if (goals.length === 0) {
      toast.error('Pick at least one goal')
      return
    }
    try {
      const res = await recMutation.mutateAsync({ goals })
      setRecommendedTemplates(res.recommendedAgentTemplates || [])
      setRecommendedConnectorProviders(res.recommendedConnectorProviders || [])
      // carry ship slug forward if it was returned earlier (session endpoint doesn't include it)
      if (res.session.starshipId && !shipSlug && res.session.starshipId) {
        // no-op (slug isn't available here); UI links will hide if missing
      }
      setStep('connectors')
      await queryClient.invalidateQueries({ queryKey: ONBOARDING_QUERY_KEYS.session() })
    } catch (e: any) {
      toast.error('Failed to get recommendations', { description: e?.message || 'Please try again.' })
    }
  }

  const handleDeploy = async () => {
    if (!canInteract) return
    try {
      await applyMutation.mutateAsync({
        selectedAgentTemplateIds: selectedTemplateIds,
        primaryAgentTemplateId: primaryTemplateId,
      })
      toast.success('Agents deployed', { description: 'Ready for your first task.' })
      await queryClient.invalidateQueries({ queryKey: ONBOARDING_QUERY_KEYS.session() })
      setStep('first_task')
    } catch (e: any) {
      toast.error('Deployment failed', { description: e?.message || 'Please try again.' })
    }
  }

  const handleFinish = async () => {
    if (!canInteract) return
    try {
      const res = await finishMutation.mutateAsync()
      const slug = res.starship.slug
      const agentSlug = res.primaryAgent.slug
      router.replace(`/ship/${encodeURIComponent(slug)}/conversations?agent=${encodeURIComponent(agentSlug)}`)
    } catch (e: any) {
      toast.error('Could not finish onboarding', { description: e?.message || 'Please try again.' })
    }
  }

  const loading = authLoading || sessionQuery.isLoading
  const hasSession = !!sessionQuery.data?.session

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Icon name="loader-2" className="h-5 w-5 animate-spin" />
          Loading onboarding…
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-5xl grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-4">
          <Card className="rounded-2xl">
            <CardHeader className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 border border-primary/15 flex items-center justify-center">
                  <Icon name="rocket" className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <CardTitle className="text-xl font-semibold">Onboarding</CardTitle>
                  <p className="text-sm text-muted-foreground">A quick setup guided by Aria.</p>
                </div>
              </div>
              {renderProgress(step)}
            </CardHeader>
            <CardContent className="space-y-6">
              {step === 'welcome' ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="starshipName">Starship name (optional)</Label>
                    <Input
                      id="starshipName"
                      value={starshipName}
                      onChange={(e) => setStarshipName(e.target.value)}
                      placeholder="e.g. Endeavour"
                      disabled={startMutation.isPending}
                    />
                    {user?.name ? <p className="text-xs text-muted-foreground">Welcome, {user.name.split(/\s+/)[0]}.</p> : null}
                  </div>
                  <div className="flex items-center justify-end">
                    <Button onClick={handleStart} disabled={!canInteract || startMutation.isPending} className="h-10">
                      {startMutation.isPending ? 'Creating…' : 'Create my starship'}
                    </Button>
                  </div>
                  {sessionQuery.isError ? (
                    <p className="text-xs text-muted-foreground">No onboarding session yet. Create your starship to begin.</p>
                  ) : null}
                </div>
              ) : null}

              {step === 'goals' ? (
                <div className="space-y-4">
                  <div className="text-sm text-muted-foreground">Pick what you want to accomplish first (choose 1–2).</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(Object.keys(GOAL_LABELS) as OnboardingGoal[]).map((g) => {
                      const checked = goals.includes(g)
                      return (
                        <button
                          key={g}
                          type="button"
                          className={cn('text-left border rounded-xl p-3 hover:bg-muted/50', checked && 'border-primary')}
                          onClick={() => {
                            setGoals((prev) => {
                              const current = Array.isArray(prev) ? prev : []
                              return current.includes(g)
                                ? current.filter((x) => x !== g)
                                : current.length >= 2
                                  ? current
                                  : [...current, g]
                            })
                          }}
                        >
                          <div className="font-medium">{GOAL_LABELS[g].title}</div>
                          <div className="text-xs text-muted-foreground">{GOAL_LABELS[g].description}</div>
                        </button>
                      )
                    })}
                  </div>
                  <div className="flex items-center justify-between">
                    <Button variant="outline" onClick={() => setStep('welcome')} disabled={hasSession}>
                      Back
                    </Button>
                    <Button onClick={handleGoalsContinue} disabled={!canInteract || recMutation.isPending}>
                      {recMutation.isPending ? 'Working…' : 'Continue'}
                    </Button>
                  </div>
                </div>
              ) : null}

              {step === 'connectors' ? (
                <div className="space-y-4">
                  <div className="text-sm text-muted-foreground">
                    Based on your goals, Aria suggests these connectors. You can connect now or later.
                  </div>
                  {recommendedConnectorProviders.length > 0 ? (
                    <div className="text-sm">
                      <div className="font-medium">Suggested</div>
                      <div className="text-muted-foreground">{recommendedConnectorProviders.join(', ')}</div>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">No connectors required for your current goals.</div>
                  )}
                  {shipSlug ? (
                    <div className="text-sm">
                      <Link className="text-primary underline underline-offset-4" href={`/ship/${encodeURIComponent(shipSlug)}/connectors`}>
                        Manage connectors
                      </Link>
                    </div>
                  ) : null}
                  <Separator />
                  <div className="flex items-center justify-between">
                    <Button variant="outline" onClick={() => setStep('goals')}>
                      Back
                    </Button>
                    <Button onClick={() => setStep('agents')}>Continue</Button>
                  </div>
                </div>
              ) : null}

              {step === 'agents' ? (
                <div className="space-y-4">
                  <div className="text-sm text-muted-foreground">
                    Select the agents you want to deploy. You stay in control—nothing deploys until you confirm.
                  </div>
                  {recommendedTemplates.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No recommendations yet. Go back and choose goals.</div>
                  ) : (
                    <div className="space-y-2">
                      {recommendedTemplates.map((t) => {
                        const id = t.id
                        const checked = selectedTemplateIds.includes(id)
                        const isPrimary = primaryTemplateId === id
                        return (
                          <div key={id} className={cn('border rounded-xl p-3 space-y-2', checked && 'border-primary')}>
                            <div className="flex items-start gap-3">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(v) => {
                                  const nextChecked = Boolean(v)
                                  setSelectedTemplateIds((prev) =>
                                    nextChecked ? Array.from(new Set([...prev, id])) : prev.filter((x) => x !== id)
                                  )
                                  if (!nextChecked && isPrimary) setPrimaryTemplateId(null)
                                }}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="font-medium">{t.name}</div>
                                {t.description ? <div className="text-xs text-muted-foreground">{t.description}</div> : null}
                              </div>
                            </div>
                            {checked ? (
                              <div className="flex items-center gap-2 text-xs">
                                <button
                                  type="button"
                                  className={cn(
                                    'px-2 py-1 rounded-full border',
                                    isPrimary ? 'border-primary text-primary' : 'text-muted-foreground'
                                  )}
                                  onClick={() => setPrimaryTemplateId(id)}
                                >
                                  Make primary
                                </button>
                              </div>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <Button variant="outline" onClick={() => setStep('connectors')}>
                      Back
                    </Button>
                    <Button onClick={handleDeploy} disabled={!canInteract || applyMutation.isPending}>
                      {applyMutation.isPending ? 'Deploying…' : 'Deploy selected'}
                    </Button>
                  </div>
                </div>
              ) : null}

              {step === 'first_task' ? (
                <div className="space-y-4">
                  <div className="text-sm text-muted-foreground">
                    Choose a quick first task, or jump straight into chat and tell Aria what you need.
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      { title: 'Set up my workspace', prompt: 'Help me set up my starship for my goals.' },
                      { title: 'Recommend my next agent', prompt: 'Based on my goals, what agent should I deploy next?' },
                      { title: 'Connect my tools', prompt: 'Which connectors should I connect first, and why?' },
                      { title: 'Start with a win', prompt: 'Give me a quick first task to get value in 2 minutes.' },
                    ].map((t) => (
                      <div key={t.title} className="border rounded-xl p-3">
                        <div className="font-medium">{t.title}</div>
                        <div className="text-xs text-muted-foreground">{t.prompt}</div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-end">
                    <Button onClick={handleFinish} disabled={!canInteract || finishMutation.isPending}>
                      {finishMutation.isPending ? 'Finishing…' : 'Go to chat'}
                    </Button>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-1 space-y-4">
          <AriaPanel step={step as OnboardingStep} goals={goals} enabled={starshipReady} />
        </div>
      </div>
    </div>
  )
}

