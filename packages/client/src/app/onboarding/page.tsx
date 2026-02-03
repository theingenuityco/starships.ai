'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { Orbitron } from 'next/font/google'
import { useAuth, AUTH_QUERY_KEYS } from '@/hooks/useAuth'
import { useUserStarships, useUpdateStarship, useCreateStarship, STARSHIP_QUERY_KEYS } from '@/hooks/useStarships'
import { useCreateStarshipInvite, useAcceptStarshipInvite } from '@/hooks/useStarshipInvites'
import { useStarshipAgents } from '@/hooks/useAgents'
import { useAgentTemplates, useRequiredConnectorsForTemplates, useCreateAgentFromTemplate } from '@/hooks/useTemplates'
import { useCompleteWizardOnboarding } from '@/hooks/useWizardOnboarding'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import Icon from '@/components/primitives/Icon'
import { StarshipsLogo } from '@/components/ui/starships-logo'
import { OnboardingAgentCard } from '@/components/onboarding/OnboardingAgentCard'
import { StarshipUpgradeSection } from '@/components/settings/StarshipUpgradeSection'
import { StarshipConnectorsPanel } from '@/components/connectors/StarshipConnectorsPanel'
import { StarTheme } from '@/components/theme-context'
import { AuthMarketingPanel } from '@/components/auth/AuthMarketingPanel'
import api from '@/lib/api'
import type { AgentTemplateModel } from '@starships/protocol'

/** Same shape as accept-invite preview API response. */
type InvitePreviewResponse = {
  invitedEmail: string
  role: 'admin' | 'collaborator'
  expiresAt: string
  starship: { id: string; slug: string; name: string }
}

/** Extract invite token from pasted text: full URL (accept-invite?invite=...) or raw token. */
function parseInviteToken(input: string): string {
  const raw = (input || '').trim()
  if (!raw) return ''
  try {
    const url = new URL(raw)
    const token = url.searchParams.get('invite')
    if (token) return token.trim()
  } catch {
    // not a URL
  }
  return raw
}

const orbitron = Orbitron({ subsets: ['latin'], weight: ['400'] })

const TOTAL_STEPS = 5

/** Shared content width for steps 1, 2. */
const CONTENT_MAX_W = 'max-w-3xl'
/** Steps 3–4: agent picker and connectors. */
const CONTENT_MAX_W_STEP3_4 = 'max-w-4xl'
/** Step 5: upgrade cards fill width nearly. */
const CONTENT_MAX_W_STEP5 = 'max-w-5xl'
/** Consistent input/field width across steps. */
const INPUT_MAX_W = 'max-w-xl'
/** Primary nav button (Next/Complete) min width and height. */
const BTN_PRIMARY = 'min-w-[100px] h-10'
const BTN_NAV_GHOST = 'h-10'

export default function OnboardingPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user, userId, userEmail, isAuthenticated, isLoading: authLoading } = useAuth()
  const { data: starships = [], isLoading: starshipsLoading } = useUserStarships(userId || '', !!userId)
  // Prefer an owned starship for onboarding so existing owners who were invited elsewhere still see the full wizard for their workspace
  const primaryStarship = starships.find(s => s.ownerId === userId) ?? starships[0]

  const [step, setStep] = useState(1)
  const [starshipName, setStarshipName] = useState('')
  const [inviteEmailRows, setInviteEmailRows] = useState<string[]>([''])
  /** Step 1 tab: create/name workspace vs join with invite link. */
  const [step1Tab, setStep1Tab] = useState<'create' | 'join'>('create')
  /**
   * User intent: set when they advance from step 1. Only 'new-workspace' means we create a default
   * starship on Complete. Join-invite path never sets this; we never create a starship for joiners.
   */
  const [onboardingPath, setOnboardingPath] = useState<'new-workspace' | null>(null)
  const [inviteLinkInput, setInviteLinkInput] = useState('')
  const [joinPreview, setJoinPreview] = useState<InvitePreviewResponse | null>(null)
  const [joinPreviewLoading, setJoinPreviewLoading] = useState(false)
  const [joinPreviewError, setJoinPreviewError] = useState<string | null>(null)
  /** Template IDs of agents the user added on step 3 (used to show required connectors on step 4). */
  const [deployedTemplateIds, setDeployedTemplateIds] = useState<string[]>([])

  const updateStarship = useUpdateStarship()
  const createStarship = useCreateStarship()
  const createInvite = useCreateStarshipInvite(primaryStarship?.id ?? '')
  const createAgentFromTemplate = useCreateAgentFromTemplate()
  const acceptInvite = useAcceptStarshipInvite(userId)
  const completeWizard = useCompleteWizardOnboarding()

  const { data: allTemplates = [], isLoading: templatesLoading } = useAgentTemplates(undefined, step === 3)
  const curatedTemplates: AgentTemplateModel[] = allTemplates.slice(0, 8)
  const { data: starshipAgents = [] } = useStarshipAgents(primaryStarship?.id ?? '', step === 4 && !!primaryStarship?.id)
  const templateIdsForConnectors =
    !primaryStarship || deployedTemplateIds.length > 0
      ? deployedTemplateIds
      : ([...new Set((starshipAgents as Array<{ sourceTemplateId?: string }>).map(a => a.sourceTemplateId).filter(Boolean))] as string[])
  const { data: requiredConnectorsForSelected = [], isLoading: connectorsLoading } = useRequiredConnectorsForTemplates(templateIdsForConnectors, step === 4 && templateIdsForConnectors.length > 0)
  const connectorProviders = requiredConnectorsForSelected.map(c => c.provider)

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

  // Rule: a default starship is created only when the user completes all 5 steps of the New Workspace wizard.
  // Join-via-invite assigns them only to the invited starship; no new starship is created.

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
    // When user has no starship we keep them on onboarding (step 1: New Workspace or Join with invite link).
    // We do not redirect to profile; profile now sends 0-starship users here.
  }, [authLoading, isAuthenticated, isWizardComplete, hasStarship, starshipsLoading, user?.navigationOnboardingCompleted, primaryStarship?.slug, router])

  const handleStep1Next = useCallback(async () => {
    const name = starshipName.trim()
    // No starship yet (New Workspace path): only advance; default starship is created when user completes step 5.
    if (!primaryStarship) {
      if (!name) return
      setStep(2)
      return
    }
    if (!name) return
    const currentName = (primaryStarship.name ?? '').trim()
    if (name !== currentName) {
      await updateStarship.mutateAsync({ starshipId: primaryStarship.id, updates: { name } })
    }
    setStep(2)
  }, [starshipName, primaryStarship, updateStarship])

  // Clear New Workspace intent if user switches to Join tab (they haven't committed yet).
  const handleStep1TabChange = useCallback((tab: 'create' | 'join') => {
    setStep1Tab(tab)
    if (tab === 'join') setOnboardingPath(null)
  }, [])

  const handleJoinWithInviteLink = useCallback(async () => {
    const token = parseInviteToken(inviteLinkInput)
    if (!token) {
      setJoinPreviewError('Please paste an invite link from your email.')
      return
    }
    setJoinPreviewError(null)
    setJoinPreview(null)
    setJoinPreviewLoading(true)
    try {
      const r = await fetch('/api/v1/starship-invites/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const json = await r.json().catch(() => null)
      if (!r.ok || !json?.data) {
        throw new Error(json?.error?.message || 'Invalid or expired invite link.')
      }
      const preview = json.data as InvitePreviewResponse
      setJoinPreview(preview)

      const invitedEmail = (preview.invitedEmail || '').trim().toLowerCase()
      const currentEmail = (userEmail || '').trim().toLowerCase()
      if (invitedEmail && currentEmail && invitedEmail !== currentEmail) {
        const returnUrl = `/accept-invite?invite=${encodeURIComponent(token)}`
        router.replace(`/login?logout=true&expectedEmail=${encodeURIComponent(preview.invitedEmail)}&returnUrl=${encodeURIComponent(returnUrl)}&tab=login`)
        return
      }

      const starship = await acceptInvite.mutateAsync(token)
      // Ensure starships list is updated before navigation so no code sees "0 starships" and creates a default.
      await queryClient.refetchQueries({ queryKey: STARSHIP_QUERY_KEYS.byOwner(userId || '') })
      // Mark wizard complete so client-layout does not redirect back to /onboarding.
      await completeWizard.mutateAsync()
      await queryClient.refetchQueries({ queryKey: AUTH_QUERY_KEYS.me() })
      router.replace(`/ship/${encodeURIComponent(starship.slug)}`)
    } catch (e: unknown) {
      setJoinPreviewError(e instanceof Error ? e.message : 'Invalid or expired invite link.')
    } finally {
      setJoinPreviewLoading(false)
    }
  }, [inviteLinkInput, userEmail, userId, acceptInvite, completeWizard, queryClient, router])

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
  }, [inviteEmailsParsed, primaryStarship?.id, createInvite])

  const handleStep3Next = useCallback(() => {
    setStep(4)
  }, [])

  const handleAgentDeployed = useCallback((template: AgentTemplateModel) => {
    setDeployedTemplateIds(prev => (prev.includes(template.id) ? prev : [...prev, template.id]))
  }, [])

  const handleAgentRemoved = useCallback((template: AgentTemplateModel) => {
    setDeployedTemplateIds(prev => prev.filter(id => id !== template.id))
  }, [])

  const handleStep4Next = useCallback(() => {
    setStep(5)
  }, [])

  const handleFinish = useCallback(async () => {
    // Create a starship only when the user explicitly chose "New Workspace" at step 1 and completed the wizard.
    // We call POST /starships (explicit create), never "ensure default" — so joiners can never trigger creation.
    const shouldCreateNewWorkspace = onboardingPath === 'new-workspace' && !primaryStarship
    if (shouldCreateNewWorkspace) {
      const name = starshipName.trim() || 'My Workspace'
      const ship = await createStarship.mutateAsync({ name })
      const emails = inviteEmailsParsed()
      for (const email of emails) {
        try {
          await api.post(`/api/v1/starships/${ship.id}/invites`, { email, role: 'collaborator' })
        } catch {
          // Toast from hook not available; continue
        }
      }
      for (const templateId of deployedTemplateIds) {
        try {
          await createAgentFromTemplate.mutateAsync({ templateId, starshipId: ship.id })
        } catch {
          // Toast from mutation
        }
      }
      await queryClient.invalidateQueries({ queryKey: STARSHIP_QUERY_KEYS.byOwner(userId || '') })
      await completeWizard.mutateAsync()
      await queryClient.refetchQueries({ queryKey: AUTH_QUERY_KEYS.me() })
      router.push(`/ship/${ship.slug}`)
      return
    }
    // Inconsistent state: no starship and user never chose New Workspace (e.g. join path). Don't create; send back to step 1.
    if (!primaryStarship) {
      await completeWizard.mutateAsync()
      await queryClient.refetchQueries({ queryKey: AUTH_QUERY_KEYS.me() })
      router.replace('/onboarding')
      return
    }
    // Joiner or owner completing wizard: just complete and navigate.
    await completeWizard.mutateAsync()
    await queryClient.refetchQueries({ queryKey: AUTH_QUERY_KEYS.me() })
    if (primaryStarship.slug) {
      router.push(`/ship/${primaryStarship.slug}`)
    } else {
      router.push('/marketplace')
    }
  }, [completeWizard, queryClient, primaryStarship, onboardingPath, starshipName, inviteEmailsParsed, deployedTemplateIds, createStarship, createAgentFromTemplate, userId, router])

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

  if (isWizardComplete) {
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
          <main className="flex flex-1 flex-col items-center justify-center px-4 py-10 relative z-10">
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

        <main className="flex flex-1 flex-col items-center justify-center px-4 py-10 relative z-10">
          <div className={`w-full mx-auto min-w-0 ${step === 5 ? CONTENT_MAX_W_STEP5 : step === 3 || step === 4 ? CONTENT_MAX_W_STEP3_4 : CONTENT_MAX_W}`}>
            <p className="text-xs text-muted-foreground mb-1">
              Step {step} of {TOTAL_STEPS}
            </p>

            {step === 1 && (
              <div className="mt-6 space-y-6">
                <Tabs value={step1Tab} onValueChange={v => handleStep1TabChange(v === 'join' ? 'join' : 'create')} className="w-full">
                  <TabsList className="grid w-full grid-cols-2 p-0 h-11 bg-muted/30 rounded-lg">
                    <TabsTrigger value="create" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">
                      New Workspace
                    </TabsTrigger>
                    <TabsTrigger value="join" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">
                      Join with invite link
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="create" className="mt-6 space-y-6">
                    <div>
                      <h2 className="text-2xl font-bold tracking-tight">Name your workspace</h2>
                      <p className="mt-2 text-sm text-muted-foreground">Choose a name your team will recognise, like your company or project.</p>
                    </div>
                    <div className={`space-y-2 ${INPUT_MAX_W}`}>
                      <Label htmlFor="starship-name">Starship name</Label>
                      <Input id="starship-name" value={starshipName} onChange={e => setStarshipName(e.target.value)} placeholder="e.g. Acme Corp" maxLength={100} />
                    </div>
                    <div className="flex items-center justify-end pt-2">
                      <Button onClick={handleStep1Next} disabled={!starshipName.trim() || updateStarship.isPending} className={BTN_PRIMARY}>
                        {updateStarship.isPending ? 'Saving…' : 'Next'}
                      </Button>
                    </div>
                  </TabsContent>
                  <TabsContent value="join" className="mt-6 space-y-6">
                    <div>
                      <h2 className="text-2xl font-bold tracking-tight">Join with invite link</h2>
                      <p className="mt-2 text-sm text-muted-foreground">Paste the invite link to join your team&apos;s starship.</p>
                    </div>
                    <div className={`space-y-2 ${INPUT_MAX_W}`}>
                      <Label htmlFor="invite-link">Invite link</Label>
                      <Input
                        id="invite-link"
                        value={inviteLinkInput}
                        onChange={e => {
                          setInviteLinkInput(e.target.value)
                          setJoinPreviewError(null)
                        }}
                        placeholder="https://…/accept-invite?invite=…"
                        className="font-mono text-sm"
                      />
                      {joinPreviewError ? <p className="text-sm text-destructive">{joinPreviewError}</p> : null}
                      {joinPreview ? (
                        <p className="text-sm text-muted-foreground">
                          Joining <span className="font-medium text-foreground">{joinPreview.starship.name}</span>…
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-center justify-end pt-2">
                      <Button onClick={handleJoinWithInviteLink} disabled={!inviteLinkInput.trim() || joinPreviewLoading || acceptInvite.isPending} className={BTN_PRIMARY}>
                        {joinPreviewLoading || acceptInvite.isPending ? 'Joining…' : 'Join'}
                      </Button>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            )}

            {step === 2 && (
              <div className="mt-6 space-y-6">
                <div>
                  <h1 className="text-3xl font-bold tracking-tight">Invite your team</h1>
                  <p className="mt-2 text-sm text-muted-foreground">Who else is on the {primaryStarship?.name ?? 'your workspace'} team?</p>
                </div>
                <div className={`space-y-3 ${INPUT_MAX_W}`}>
                  <ul className="grid grid-cols-1 gap-3">
                    {inviteEmailRows.map((email, idx) => (
                      <li key={idx} className="flex items-center gap-2">
                        <Input type="email" value={email} onChange={e => setInviteEmailAt(idx, e.target.value)} placeholder="colleague@company.com" className="flex-1" />
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
                <div className="flex flex-wrap items-center justify-between gap-3 pt-6">
                  <Button variant="ghost" size="sm" onClick={() => setStep(1)} className={BTN_NAV_GHOST}>
                    Back
                  </Button>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setStep(3)} className={BTN_NAV_GHOST}>
                      Skip this step
                    </Button>
                    <Button onClick={handleStep2Next} disabled={createInvite.isPending} className={BTN_PRIMARY}>
                      Next
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="mt-6 flex flex-col w-full" style={{ maxHeight: 'min(calc(100dvh - 12rem), 720px)' }}>
                <div className="shrink-0">
                  <h1 className="text-3xl font-bold tracking-tight">Add AI teammates (recommended)</h1>
                  <p className="mt-2 text-sm text-muted-foreground">You can add more from the marketplace later.</p>
                </div>
                {templatesLoading ? (
                  <p className="mt-4 text-sm text-muted-foreground">Loading agents...</p>
                ) : curatedTemplates.length === 0 ? (
                  <p className="mt-4 text-sm text-muted-foreground">No recommended agents available yet. You can always deploy agents from the marketplace later.</p>
                ) : (
                  <div className="mt-4 min-h-0 flex-1 overflow-y-auto pb-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-4xl mx-auto">
                      {curatedTemplates.map(template => (
                        <OnboardingAgentCard
                          key={template.id}
                          template={template}
                          targetStarshipId={primaryStarship?.id ?? ''}
                          onDeployed={handleAgentDeployed}
                          onRemoved={handleAgentRemoved}
                          selectionOnly={!primaryStarship}
                          isSelected={deployedTemplateIds.includes(template.id)}
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
              <div className="mt-6 flex flex-col w-full" style={{ maxHeight: 'min(calc(100dvh - 12rem), 720px)' }}>
                <div className="shrink-0">
                  <h1 className="text-3xl font-bold tracking-tight">Connect your apps</h1>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {connectorProviders.length > 0
                      ? 'Based on your AI teammates selection, connect these apps for max efficiency.'
                      : 'No connectors required by your agents. You can connect apps anytime from your workspace.'}
                  </p>
                </div>
                {primaryStarship?.id ? (
                  <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
                    {connectorsLoading ? (
                      <p className="text-sm text-muted-foreground">Loading connectors...</p>
                    ) : connectorProviders.length > 0 ? (
                      <StarshipConnectorsPanel
                        starshipId={primaryStarship.id}
                        onlyProviders={connectorProviders}
                        hideSearch
                        hideDisconnect={false}
                        maxColumns={2}
                        hideCardDescription
                        connectButtonLabel="Connect"
                      />
                    ) : null}
                  </div>
                ) : connectorProviders.length > 0 ? (
                  <p className="mt-4 text-sm text-muted-foreground">You&apos;ll need to connect: {connectorProviders.join(', ')}. You can connect these apps after completing.</p>
                ) : null}
                <div className="flex items-center justify-between gap-3 pt-4 shrink-0 mt-4">
                  <Button variant="ghost" size="sm" onClick={() => setStep(3)} className={BTN_NAV_GHOST}>
                    Back
                  </Button>
                  <Button onClick={handleStep4Next} className={BTN_PRIMARY}>
                    Next
                  </Button>
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="mt-6 space-y-6">
                <div>
                  <h1 className="text-3xl font-bold tracking-tight">Your starship is ready!</h1>
                  <p className="mt-2 text-sm text-muted-foreground">You can continue with the free tier and upgrade anytime.</p>
                </div>

                {primaryStarship?.id ? (
                  <div className="mt-4 w-full min-w-0">
                    <StarshipUpgradeSection starshipId={primaryStarship.id} cardClassName="bg-transparent border-0 shadow-none w-full" hideDescription />
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-muted-foreground">You can upgrade your plan anytime from workspace settings.</p>
                )}

                <div className="flex items-center justify-between pt-6">
                  <Button variant="ghost" size="sm" onClick={() => setStep(4)} className={BTN_NAV_GHOST}>
                    Back
                  </Button>
                  <Button
                    onClick={() => handleFinish()}
                    disabled={completeWizard.isPending || (!primaryStarship && (createStarship.isPending || createAgentFromTemplate.isPending))}
                    className={BTN_PRIMARY}
                  >
                    {completeWizard.isPending || (!primaryStarship && (createStarship.isPending || createAgentFromTemplate.isPending)) ? 'Finishing…' : 'Complete'}
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
