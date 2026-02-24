'use client'

import React, { useEffect, useMemo, useState } from 'react'

import type { AgentTemplateModel, AgentToolPermission, DeployStarshipOption, ToolTemplateModel } from '@starships/protocol'

import Icon from '@/components/primitives/Icon'
import { ConnectorSuggestionCard } from '@/components/widgets/ConnectorSuggestionCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { AgentTemplatePreviewCard } from '@/components/marketplace/AgentTemplatePreviewCard'
import { StarshipMonogram, StarshipPickerIcon } from '@/components/marketplace/StarshipIdentity'
import { WizardStepper } from '@/components/marketplace/WizardStepper'
import { cn } from '@/lib/utils'
import { useStarshipConnectors } from '@/hooks/useConnectors'
import { useRequiredConnectors, useToolTemplates } from '@/hooks/useTemplates'
import type { DeployStarshipOptionWithAccess } from '@/hooks/useStarships'
import { pickToolLeftIcon } from '@/lib/toolTemplateIcon'

type WizardStep = 1 | 2 | 3 | 4

interface AgentDeploymentWizardModalProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (input?: { toolPermissions?: Record<string, AgentToolPermission>; starship?: DeployStarshipOption }) => Promise<void>
  isProcessing: boolean
  template: AgentTemplateModel
  /**
   * When provided, user can choose target starship.
   * If length > 1, this wizard will show a selection step.
   */
  ownedStarships?: DeployStarshipOptionWithAccess[]
  /** Fallback when ownedStarships isn't provided. */
  starshipId?: string
  starshipSlug?: string
  starshipName?: string
}

type StepMeta = { id: WizardStep; label: string; subtitle: string }
const WIZARD_STEPS: StepMeta[] = [
  { id: 1, label: 'Select Starship', subtitle: '' },
  { id: 2, label: 'Connect Apps', subtitle: '' },
  { id: 3, label: 'Permissions', subtitle: '' },
  { id: 4, label: 'Review', subtitle: '' },
]

function capabilitiesStepTitle(agentName: string): string {
  return `${agentName}'s capabilities`
}

function connectorsStepTitle(agentName: string, count: number): string {
  const n = Number.isFinite(count) ? count : 0
  if (n <= 0) return `${agentName} requires no apps to be connected`
  if (n === 1) return `${agentName} requires this app to be connected`
  return `${agentName} requires these ${n} apps to be connected`
}

function StarshipRightSlot({ children }: { children: React.ReactNode }) {
  // Fixed accessory width so the right side matches the left logo column visually.
  // Monogram is 2rem (w-8) so we reserve w-8 on the right.
  return <div className="w-8 shrink-0 flex items-start justify-center">{children}</div>
}

function stepTitle(step: WizardStep): string {
  if (step === 1) return 'Select Starship'
  if (step === 2) return 'Connect Apps'
  if (step === 3) return 'Permissions'
  return 'Review & install'
}

export function AgentDeploymentWizardModal({ isOpen, onOpenChange, onConfirm, isProcessing, template, ownedStarships, starshipId, starshipSlug, starshipName }: AgentDeploymentWizardModalProps) {
  const assignedToolSlugs = (template?.assignedToolSlugs || []).filter(Boolean)
  const templateId = template?.id ?? ''
  const agentDeployLabel = String(template?.name || 'agent').trim() || 'agent'

  const singleStarshipFromProps: DeployStarshipOptionWithAccess | null = starshipId && (starshipName || starshipSlug) ? { id: starshipId, slug: starshipSlug ?? '', name: starshipName ?? '' } : null
  const listForSelection = (ownedStarships?.length ? ownedStarships : singleStarshipFromProps ? [singleStarshipFromProps] : []) as DeployStarshipOptionWithAccess[]

  const [step, setStep] = useState<WizardStep>(1)
  const [selectedStarship, setSelectedStarship] = useState<DeployStarshipOption | null>(null)
  const [starshipPickerOpen, setStarshipPickerOpen] = useState(false)
  const [starshipPickerSearch, setStarshipPickerSearch] = useState('')

  const shouldFetchTools = isOpen && step >= 3 && assignedToolSlugs.length > 0
  const shouldFetchConnectors = isOpen && step >= 2 && !!templateId
  const { data: allToolTemplates = [] } = useToolTemplates(undefined, shouldFetchTools && assignedToolSlugs.length > 0)
  const { data: requiredConnectors = [] } = useRequiredConnectors(templateId, shouldFetchConnectors && !!templateId)
  const selectedStarshipId = String(selectedStarship?.id || '')
  const { data: selectedStarshipConnectors = [] } = useStarshipConnectors(selectedStarshipId, Boolean(shouldFetchConnectors && selectedStarshipId))

  const visibleRequiredConnectors = useMemo(() => {
    return (requiredConnectors ?? []).filter(c => {
      const provider = String(c?.provider || '').trim()
      if (!provider) return false
      // Ignore the built-in Starships connector requirement.
      return provider.toLowerCase() !== 'starships'
    })
  }, [requiredConnectors])

  const connectedRequiredConnectorsCount = useMemo(() => {
    const requiredProviders = new Set(
      visibleRequiredConnectors
        .map(c =>
          String(c?.provider || '')
            .trim()
            .toLowerCase()
        )
        .filter(Boolean)
    )
    if (requiredProviders.size === 0) return 0
    return (selectedStarshipConnectors ?? []).filter(c => {
      const provider = String(c?.provider || '')
        .trim()
        .toLowerCase()
      if (!provider || provider === 'starships') return false
      const status = String(c?.status || '').trim()
      return requiredProviders.has(provider) && status === 'connected'
    }).length
  }, [visibleRequiredConnectors, selectedStarshipConnectors])

  useEffect(() => {
    if (!isOpen) return
    setStep(1)
    const firstEnabled = listForSelection.find(s => !(s as DeployStarshipOptionWithAccess)?.deployDisabled) ?? null
    setSelectedStarship(firstEnabled)
  }, [isOpen, listForSelection[0]?.id, listForSelection.length])

  useEffect(() => {
    if (!starshipPickerOpen) setStarshipPickerSearch('')
  }, [starshipPickerOpen])

  const toolTemplateBySlug = useMemo(() => {
    const map = new Map<string, ToolTemplateModel>()
    for (const t of allToolTemplates) {
      if (t?.slug) map.set(t.slug, t)
    }
    return map
  }, [allToolTemplates])

  const [toolPermissions, setToolPermissions] = useState<Record<string, AgentToolPermission>>({})
  useEffect(() => {
    if (!isOpen) return
    if (assignedToolSlugs.length === 0) return
    setToolPermissions(prev => {
      const next: Record<string, AgentToolPermission> = {}
      const defaults = template.assignedToolDefaultPermissions
      for (const slug of assignedToolSlugs) {
        next[slug] = prev?.[slug] ?? defaults?.[slug] ?? 'ask'
      }
      return next
    })
  }, [isOpen, assignedToolSlugs.join('|'), template])

  const permissionLabel = (p: AgentToolPermission): string => (p === 'allow' ? 'Always' : p === 'ask' ? 'Ask First' : 'Never')
  const permissionDescription = (p: AgentToolPermission): string =>
    p === 'allow' ? 'Agent can trigger this tool without confirmation.' : p === 'ask' ? 'Agent can trigger this tool, but you will be asked to confirm.' : 'Agent cannot trigger this tool.'
  const permissionIconName = (p: AgentToolPermission): string => (p === 'allow' ? 'check-circle' : p === 'ask' ? 'help-circle' : 'x-circle')
  const permissionBadgeClassName = (p: AgentToolPermission): string => {
    if (p === 'allow') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
    if (p === 'ask') return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
    return 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'
  }
  const permissionDotClassName = (p: AgentToolPermission): string => (p === 'allow' ? 'bg-emerald-500/70' : p === 'ask' ? 'bg-amber-500/70' : 'bg-red-500/70')
  const permissionMenuItemClassName = (p: AgentToolPermission): string =>
    p === 'allow' ? 'hover:bg-emerald-500/10 focus:bg-emerald-500/10' : p === 'ask' ? 'hover:bg-amber-500/10 focus:bg-amber-500/10' : 'hover:bg-red-500/10 focus:bg-red-500/10'
  const permissionMenuItemSelectedClassName = (p: AgentToolPermission): string => (p === 'allow' ? 'bg-emerald-500/10' : p === 'ask' ? 'bg-amber-500/10' : 'bg-red-500/10')
  const permissionMenuIconClassName = (p: AgentToolPermission): string => (p === 'allow' ? 'text-emerald-500' : p === 'ask' ? 'text-amber-500' : 'text-red-500')

  const canGoNext = useMemo(() => {
    if (step === 1) return !!selectedStarship && !(selectedStarship as DeployStarshipOptionWithAccess)?.deployDisabled
    if (step === 2 || step === 3) return true
    return false
  }, [step, selectedStarship])

  const filteredStarships = useMemo(() => {
    const q = (starshipPickerSearch || '').trim().toLowerCase()
    if (!q) return listForSelection
    return listForSelection.filter(s => {
      const name = (s.name || '').toLowerCase()
      const slugv = (s.slug || '').toLowerCase()
      return name.includes(q) || slugv.includes(q)
    })
  }, [listForSelection, starshipPickerSearch])

  const handleNext = () => {
    if (isProcessing) return
    if (!canGoNext) return
    if (step === 1) setStep(2)
    else if (step === 2) setStep(3)
    else if (step === 3) setStep(4)
  }

  const handleBack = () => {
    if (isProcessing) return
    if (step === 2) setStep(1)
    else if (step === 3) setStep(2)
    else if (step === 4) setStep(3)
  }

  const handleDeploy = async () => {
    try {
      await onConfirm({ toolPermissions, starship: selectedStarship ?? undefined })
      onOpenChange(false)
    } catch {
      // Keep wizard open if install fails.
    }
  }

  const permissionCounts = useMemo(() => {
    const counts = { allow: 0, ask: 0, deny: 0 }
    for (const slug of assignedToolSlugs) {
      const p = toolPermissions[slug] ?? 'ask'
      counts[p]++
    }
    return counts
  }, [assignedToolSlugs, toolPermissions])

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col w-[calc(100vw-2rem)] max-w-3xl h-[80vh] overflow-hidden p-0">
        <TooltipProvider>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <DialogHeader className="shrink-0 px-6 pt-6 pb-6 space-y-6">
              <DialogTitle>Install Agent</DialogTitle>

              <div>
                <WizardStepper currentStep={step} steps={WIZARD_STEPS} />
              </div>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <AgentTemplatePreviewCard template={template} className="mb-6" />

              {step === 1 ? (
                <div className="mt-8 space-y-4">
                  <div className="text-sm font-semibold">Select Workspace</div>

                  {listForSelection.length === 0 ? (
                    <div className="rounded-xl border border-border/60 bg-card/50 p-4">
                      <p className="text-sm text-muted-foreground">No starships available for deployment.</p>
                    </div>
                  ) : (
                    <div>
                      <Popover open={starshipPickerOpen} onOpenChange={setStarshipPickerOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            aria-label={selectedStarship ? `Selected starship: ${selectedStarship.name || selectedStarship.slug}. Change starship.` : 'Select a starship'}
                            className={cn(
                              // Match starship-level tool selector trigger styling (ToolDropdown)
                              'flex min-h-14 w-full max-w-sm items-center justify-between whitespace-nowrap rounded-md border border-input bg-primary/10 px-4 py-3 text-sm text-left',
                              'ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                              'hover:bg-primary/15 hover:text-foreground',
                              isProcessing && 'opacity-60 cursor-not-allowed'
                            )}
                            disabled={isProcessing}
                          >
                            <span className="flex items-center gap-3 min-w-0">
                              <StarshipPickerIcon starship={selectedStarship ?? { id: '', name: 'S' }} />
                              <span className="min-w-0 flex-1 flex items-center">
                                <span className="block truncate text-sm font-semibold leading-tight">{selectedStarship?.name || selectedStarship?.slug || 'Select a starship…'}</span>
                              </span>
                            </span>
                            <Icon name="chevron-down" className={cn('h-4 w-4 opacity-50 shrink-0', starshipPickerOpen && 'rotate-180')} />
                          </Button>
                        </PopoverTrigger>

                        <PopoverContent
                          align="start"
                          side="bottom"
                          sideOffset={8}
                          aria-label="Starship options"
                          className={cn('p-0 rounded-lg shadow-frosted-lg text-sm leading-6 w-[min(520px,calc(100vw-40px))]')}
                        >
                          <div className="border-b border-border/40 p-2">
                            <div className="relative">
                              <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4 pointer-events-none" />
                              <Input value={starshipPickerSearch} onChange={e => setStarshipPickerSearch(e.target.value)} placeholder="Search starships…" className="h-9 pl-10" autoFocus />
                            </div>
                          </div>

                          <div className="p-2 max-h-64 overflow-y-auto custom-scrollbar">
                            {listForSelection.length === 0 ? (
                              <div className="text-center py-4 text-sm text-muted-foreground">No starships available</div>
                            ) : filteredStarships.length === 0 ? (
                              <div className="text-center py-4 text-sm text-muted-foreground">No starships match your search</div>
                            ) : (
                              <>
                                {filteredStarships.map(s => {
                                  const access = s as DeployStarshipOptionWithAccess
                                  const disabled = Boolean(access.deployDisabled)
                                  const selected = selectedStarship?.id === s.id
                                  return (
                                    <button
                                      key={s.id}
                                      type="button"
                                      disabled={disabled}
                                      onClick={() => {
                                        if (disabled) return
                                        setSelectedStarship(s)
                                        setStarshipPickerOpen(false)
                                      }}
                                      className={cn(
                                        'w-full text-left px-3 py-2 rounded-lg transition-colors focus-visible-ring',
                                        selected
                                          ? 'text-primary bg-primary/10 border-transparent'
                                          : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-primary/5 hover:shadow-sm',
                                        disabled && 'opacity-60 cursor-not-allowed hover:bg-transparent hover:shadow-none'
                                      )}
                                    >
                                      <div className="flex items-center gap-3 min-w-0">
                                        <StarshipPickerIcon starship={s} disabled={disabled} />
                                        <div className="min-w-0 flex flex-col flex-1">
                                          <div className="text-sm font-semibold leading-tight text-foreground truncate">{s.name || s.slug || s.id}</div>
                                        </div>
                                        {disabled ? <Icon name="lock" className="h-4 w-4 text-muted-foreground shrink-0" /> : null}
                                      </div>
                                    </button>
                                  )
                                })}
                              </>
                            )}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  )}
                </div>
              ) : null}

              {step === 2 ? (
                <div className="mt-8 space-y-4">
                  <div className="text-sm font-semibold">Connect Apps</div>

                  {visibleRequiredConnectors.length > 0 ? (
                    selectedStarship?.id ? (
                      <ConnectorSuggestionCard
                        starshipId={selectedStarship.id}
                        providers={visibleRequiredConnectors.map(c => c.provider)}
                        hideSearch={true}
                        hideDisconnect={false}
                        compactCard
                        connectButtonLabel="Connect"
                        animateCards={false}
                        showDemoVideos
                      />
                    ) : (
                      <div className="rounded-xl border border-border/60 bg-card/50 p-4">
                        <p className="text-sm text-muted-foreground">Select a starship first to connect apps.</p>
                      </div>
                    )
                  ) : (
                    <div className="rounded-lg border border-border/60 bg-card/10 p-3">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <Icon name="check-circle" className="h-4 w-4 text-emerald-500" />
                          <p className="text-sm font-semibold leading-tight">No connectors required</p>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">This agent can be deployed without connecting any apps.</p>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}

              {step === 3 ? (
                <div className="mt-8 space-y-4">
                  <div className="text-sm font-semibold">{capabilitiesStepTitle(agentDeployLabel)}</div>
                  {assignedToolSlugs.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {assignedToolSlugs.map(slug => {
                        const info = toolTemplateBySlug.get(slug)
                        const title = info?.name?.trim() || slug
                        const desc = info?.description?.trim() || ''
                        const current = toolPermissions[slug] ?? 'ask'
                        return (
                          <div key={slug} className="group relative rounded-xl border border-border/60 bg-gradient-to-br from-background/50 to-background/30 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-3 min-w-0">
                                <div className="mt-1.5 flex-shrink-0">
                                  <div className={cn('h-2 w-2 rounded-full', permissionDotClassName(current))} />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <div className="text-sm font-semibold leading-5 text-foreground truncate">{title}</div>
                                    <Tooltip delayDuration={250}>
                                      <TooltipTrigger asChild>
                                        <button
                                          type="button"
                                          className="inline-flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors flex-shrink-0"
                                          aria-label={`Tool info: ${title}`}
                                        >
                                          <Icon name="info" className="h-4 w-4" />
                                        </button>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" align="start" className="max-w-xs p-2 text-xs">
                                        <div className="text-muted-foreground leading-relaxed">{desc || slug}</div>
                                      </TooltipContent>
                                    </Tooltip>
                                  </div>
                                </div>
                              </div>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <span className={cn('inline-flex', isProcessing && 'cursor-not-allowed')}>
                                    <button type="button" disabled={isProcessing} className={cn('inline-flex items-center', isProcessing && 'opacity-70')}>
                                      <Badge variant="outline" className={cn('whitespace-nowrap border', permissionBadgeClassName(current))}>
                                        <span className="inline-flex items-center gap-1.5">
                                          <Icon name={permissionIconName(current)} className="h-3.5 w-3.5" />
                                          <span>{permissionLabel(current)}</span>
                                          <Icon name="chevron-down" className="h-3.5 w-3.5 opacity-70" />
                                        </span>
                                      </Badge>
                                    </button>
                                  </span>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-72">
                                  {(['allow', 'ask', 'deny'] as const).map(p => (
                                    <DropdownMenuItem
                                      key={p}
                                      className={cn('cursor-pointer', permissionMenuItemClassName(p), p === current && permissionMenuItemSelectedClassName(p))}
                                      onClick={() => {
                                        if (isProcessing) return
                                        setToolPermissions(prev => ({ ...prev, [slug]: p }))
                                      }}
                                    >
                                      <div className="flex flex-col gap-0.5">
                                        <div className="flex items-center gap-2">
                                          <Icon name={permissionIconName(p)} className={cn('h-4 w-4', permissionMenuIconClassName(p))} />
                                          <span className="text-sm font-medium">{permissionLabel(p)}</span>
                                        </div>
                                        <div className="text-xs text-muted-foreground">{permissionDescription(p)}</div>
                                      </div>
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-border/60 bg-card/10 p-3">
                      <div className="flex items-center gap-2">
                        <Icon name="check-circle" className="h-4 w-4 text-emerald-500" />
                        <p className="text-sm font-semibold leading-tight">No automations</p>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">This agent has no automations to configure.</p>
                    </div>
                  )}
                </div>
              ) : null}

              {step === 4 ? (
                <div className="mt-8">
                  <h3 className="text-sm font-semibold text-foreground mb-4">Review</h3>
                  <div className="space-y-4">
                    <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted/50">
                          <Icon name="rocket" className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Select Workspace</p>
                          <p className="mt-0.5 text-sm font-semibold text-foreground truncate">
                            {selectedStarship ? selectedStarship.name || selectedStarship.slug || selectedStarship.id : 'Not selected'}
                          </p>
                        </div>
                        {selectedStarship ? (
                          <div className="shrink-0">
                            <StarshipMonogram starship={selectedStarship} />
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="rounded-xl border border-border/60 bg-muted/20 p-4 flex flex-col justify-center min-h-[72px]">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted/50">
                            <Icon name="plug" className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Connect Apps</p>
                        </div>
                        {visibleRequiredConnectors.length > 0 ? (
                          <p className="mt-2 text-sm text-foreground">
                            <span className="tabular-nums font-medium text-emerald-600 dark:text-emerald-400">{connectedRequiredConnectorsCount}</span>
                            <span className="text-muted-foreground"> / {visibleRequiredConnectors.length} connected</span>
                          </p>
                        ) : (
                          <p className="mt-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">No connectors required</p>
                        )}
                      </div>
                      {assignedToolSlugs.length > 0 ? (
                        <div className="rounded-xl border border-border/60 bg-muted/20 p-4 flex flex-col justify-center min-h-[72px]">
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted/50">
                              <Icon name="wrench" className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Permissions</p>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                            {permissionCounts.allow > 0 && <span className="font-medium text-foreground">{permissionCounts.allow} always</span>}
                            {permissionCounts.allow > 0 && permissionCounts.ask > 0 && <span className="text-border">·</span>}
                            {permissionCounts.ask > 0 && <span className="font-medium text-foreground">{permissionCounts.ask} ask first</span>}
                            {(permissionCounts.allow > 0 || permissionCounts.ask > 0) && permissionCounts.deny > 0 && <span className="text-border">·</span>}
                            {permissionCounts.deny > 0 && <span className="font-medium text-foreground">{permissionCounts.deny} never</span>}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <DialogFooter className="shrink-0 px-6 py-4 gap-2 flex-row justify-between sm:justify-between sm:space-x-0">
              <div className="flex items-center gap-2">
                {step > 1 ? (
                  <Button type="button" variant="ghost" onClick={handleBack} disabled={isProcessing}>
                    <Icon name="caret-left" className="h-4 w-4 mr-1" />
                    Back
                  </Button>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                {step < 4 ? (
                  <Button type="button" variant="primaryOutline" onClick={handleNext} disabled={isProcessing || !canGoNext} className="min-w-[120px]">
                    Next
                    <Icon name="caret-right" className="h-4 w-4 ml-1" />
                  </Button>
                ) : (
                  <Button type="button" onClick={handleDeploy} disabled={isProcessing || !selectedStarship} className="min-w-[140px]">
                    {isProcessing ? (
                      <>
                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                        Installing…
                      </>
                    ) : (
                      <>
                        Install
                        <Icon name="download" className="w-4 h-4 ml-2" />
                      </>
                    )}
                  </Button>
                )}
              </div>
            </DialogFooter>
          </div>
        </TooltipProvider>
      </DialogContent>
    </Dialog>
  )
}
