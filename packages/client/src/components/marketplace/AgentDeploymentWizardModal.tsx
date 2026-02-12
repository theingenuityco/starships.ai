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
import { cn } from '@/lib/utils'
import { useRequiredConnectors, useToolTemplates } from '@/hooks/useTemplates'
import type { DeployStarshipOptionWithAccess } from '@/hooks/useStarships'

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

const TOTAL_STEPS = 4

type StepMeta = { id: WizardStep; label: string; subtitle: string }
const WIZARD_STEPS: StepMeta[] = [
  { id: 1, label: 'Starship', subtitle: 'Select a starship' },
  { id: 2, label: 'Tools', subtitle: 'Suggested tools & permissions' },
  { id: 3, label: 'Connectors', subtitle: 'Connect required apps' },
  { id: 4, label: 'Review', subtitle: 'Confirm & deploy' },
]

function getStarshipInitials(input: { name?: string; slug?: string; id?: string } | null | undefined): string {
  const label = String(input?.name || input?.slug || input?.id || '').trim()
  if (!label) return 'S'
  const parts = label.split(/\s+/).filter(Boolean)
  const first = parts[0]?.[0] ?? 'S'
  const second = parts.length > 1 ? parts[1]?.[0] : undefined
  return (first + (second ?? '')).toUpperCase()
}

function StarshipMonogram({ starship, disabled }: { starship: { name?: string; slug?: string; id?: string }; disabled?: boolean }) {
  const initials = getStarshipInitials(starship)
  return (
    <div
      className={cn(
        'h-10 w-10 shrink-0 rounded-xl border flex items-center justify-center text-[12px] font-semibold tabular-nums',
        disabled ? 'border-border/60 bg-muted/20 text-muted-foreground' : 'border-primary/25 bg-primary/10 text-primary'
      )}
      aria-hidden
    >
      {initials}
    </div>
  )
}

function StarshipPickerIcon({ starship, disabled }: { starship: { name?: string; slug?: string; id?: string }; disabled?: boolean }) {
  const initials = getStarshipInitials(starship)
  return (
    <div className={cn('flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 ring-1 ring-border/40 flex-shrink-0', disabled && 'opacity-60')}>
      <span className="text-sm font-semibold text-primary tabular-nums">{initials}</span>
    </div>
  )
}

function StarshipRightSlot({ children }: { children: React.ReactNode }) {
  // Fixed accessory width so the right side matches the left logo column visually.
  // Monogram is 2rem (w-8) so we reserve w-8 on the right.
  return <div className="w-8 shrink-0 flex items-start justify-center">{children}</div>
}

function stepTitle(step: WizardStep): string {
  if (step === 1) return 'Select starship'
  if (step === 2) return 'Suggested tools'
  if (step === 3) return 'Connectors'
  return 'Review & deploy'
}

function WizardStepper({ currentStep }: { currentStep: WizardStep }) {
  const progressValue = TOTAL_STEPS <= 1 ? 0 : ((currentStep - 1) / (TOTAL_STEPS - 1)) * 100
  const n = WIZARD_STEPS.length
  const lastIndex = Math.max(0, n - 1)

  return (
    <div className="relative pt-1">
      {/* Track line */}
      <div className="absolute left-[16px] right-[16px] top-[16px] h-px bg-border/60 z-0" aria-hidden />
      {/* Progress line */}
      <div className="absolute left-[16px] right-[16px] top-[16px] h-px z-0" aria-hidden>
        <div className="h-full bg-primary/50 origin-left" style={{ transform: `scaleX(${Math.max(0, Math.min(1, progressValue / 100))})` }} />
      </div>

      {/* Absolute-position the nodes so dot centers are truly equidistant. */}
      <ol className="relative min-h-[62px] z-10">
        {WIZARD_STEPS.map((s, index) => {
          const isCompleted = currentStep > s.id
          const isActive = currentStep === s.id
          const pct = lastIndex === 0 ? 0 : (index / lastIndex) * 100
          const isFirst = index === 0
          const isLast = index === lastIndex
          const transform = isFirst ? 'translateX(0)' : isLast ? 'translateX(-100%)' : 'translateX(-50%)'
          const alignment = isFirst ? 'items-start text-left' : isLast ? 'items-end text-right' : 'items-center text-center'
          return (
            <li
              key={s.id}
              className={cn('absolute top-0 flex flex-col', alignment)}
              style={{ left: `${pct}%`, transform }}
              aria-current={isActive ? 'step' : undefined}
            >
              {/* Halo masks the line behind the node (prevents visual overlap). */}
              <div className="relative z-10 rounded-full bg-card p-[2px]" aria-hidden>
                <div
                  className={cn(
                    'h-7 w-7 rounded-full border flex items-center justify-center shadow-sm',
                    isCompleted
                      ? 'border-emerald-500/40 bg-emerald-500 text-white'
                      : isActive
                        ? 'border-primary/50 bg-primary/10 text-primary'
                        : 'border-border/60 bg-background text-muted-foreground'
                  )}
                >
                  {isCompleted ? <Icon name="check" className="h-4 w-4" /> : <span className="text-xs font-semibold tabular-nums">{s.id}</span>}
                </div>
              </div>

              <div className="mt-2 min-w-0 w-36 sm:w-44">
                <div className={cn('text-xs font-semibold leading-tight truncate', isActive || isCompleted ? 'text-foreground' : 'text-muted-foreground')}>{s.label}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground truncate">{s.subtitle}</div>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

export function AgentDeploymentWizardModal({
  isOpen,
  onOpenChange,
  onConfirm,
  isProcessing,
  template,
  ownedStarships,
  starshipId,
  starshipSlug,
  starshipName,
}: AgentDeploymentWizardModalProps) {
  const assignedToolSlugs = (template?.assignedToolSlugs || []).filter(Boolean)
  const templateId = template?.id ?? ''
  const agentDeployLabel = String(template?.name || 'agent').trim() || 'agent'

  const singleStarshipFromProps: DeployStarshipOptionWithAccess | null =
    starshipId && (starshipName || starshipSlug) ? { id: starshipId, slug: starshipSlug ?? '', name: starshipName ?? '' } : null
  const listForSelection = (ownedStarships?.length ? ownedStarships : singleStarshipFromProps ? [singleStarshipFromProps] : []) as DeployStarshipOptionWithAccess[]

  const [step, setStep] = useState<WizardStep>(1)
  const [selectedStarship, setSelectedStarship] = useState<DeployStarshipOption | null>(null)
  const [starshipPickerOpen, setStarshipPickerOpen] = useState(false)
  const [starshipPickerSearch, setStarshipPickerSearch] = useState('')

  // Only fetch tool/connectors when the modal is open and user reaches configuration step.
  const shouldFetchTools = isOpen && step >= 2
  const shouldFetchConnectors = isOpen && step >= 3
  const { data: allToolTemplates = [] } = useToolTemplates(undefined, shouldFetchTools && assignedToolSlugs.length > 0)
  const { data: requiredConnectors = [] } = useRequiredConnectors(templateId, shouldFetchConnectors && !!templateId)

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

  const permissionLabel = (p: AgentToolPermission): string => (p === 'allow' ? 'Allow' : p === 'ask' ? 'Ask first' : 'Deny')
  const permissionDescription = (p: AgentToolPermission): string =>
    p === 'allow' ? 'Agent can trigger this tool without confirmation.' : p === 'ask' ? 'Agent can trigger this tool, but you will be asked to confirm.' : 'Agent cannot trigger this tool.'
  const permissionIconName = (p: AgentToolPermission): string => (p === 'allow' ? 'check-circle' : p === 'ask' ? 'help-circle' : 'x-circle')
  const permissionBadgeClassName = (p: AgentToolPermission): string => {
    if (p === 'allow') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
    if (p === 'ask') return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
    return 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'
  }
  const permissionDotClassName = (p: AgentToolPermission): string => (p === 'allow' ? 'bg-emerald-500/70' : p === 'ask' ? 'bg-amber-500/70' : 'bg-red-500/70')
  const permissionMenuItemClassName = (p: AgentToolPermission): string => (p === 'allow' ? 'hover:bg-emerald-500/10 focus:bg-emerald-500/10' : p === 'ask' ? 'hover:bg-amber-500/10 focus:bg-amber-500/10' : 'hover:bg-red-500/10 focus:bg-red-500/10')
  const permissionMenuItemSelectedClassName = (p: AgentToolPermission): string => (p === 'allow' ? 'bg-emerald-500/10' : p === 'ask' ? 'bg-amber-500/10' : 'bg-red-500/10')
  const permissionMenuIconClassName = (p: AgentToolPermission): string => (p === 'allow' ? 'text-emerald-500' : p === 'ask' ? 'text-amber-500' : 'text-red-500')

  const canGoNext = useMemo(() => {
    if (step === 1) return !!selectedStarship && !(selectedStarship as DeployStarshipOptionWithAccess)?.deployDisabled
    if (step === 2) return true
    if (step === 3) return !!selectedStarship
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
      // Keep wizard open if deploy fails.
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
      <DialogContent className="flex flex-col w-[calc(100vw-2rem)] max-w-4xl h-[85vh] overflow-hidden p-0">
        <TooltipProvider>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <DialogHeader className="shrink-0 px-6 pt-6 pb-6 space-y-6">
              <DialogTitle>Deploy agent</DialogTitle>

              <div>
                <WizardStepper currentStep={step} />
              </div>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              {/* Agent details (compact preview, matches marketplace card layout). */}
              <div className="text-sm font-semibold">Agent details</div>
              <AgentTemplatePreviewCard template={template} className="mt-3 mb-6" />

              {step === 1 ? (
                <div className="mt-8 space-y-3">
                  <div className="text-sm font-semibold">Choose a starship to deploy {agentDeployLabel}</div>

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
                              'flex min-h-14 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-background px-4 py-3 text-sm text-left',
                              'ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                              'hover:bg-background hover:text-foreground',
                              isProcessing && 'opacity-60 cursor-not-allowed'
                            )}
                            disabled={isProcessing}
                          >
                            <span className="flex items-start gap-3 min-w-0">
                              <StarshipPickerIcon starship={selectedStarship ?? { id: '', name: 'S' }} />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate">
                                  {selectedStarship?.name || selectedStarship?.slug || 'Select a starship…'}
                                </span>
                                {selectedStarship ? (
                                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                                    {selectedStarship.slug ? `/${selectedStarship.slug}` : selectedStarship.id}
                                  </span>
                                ) : null}
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
                              <Input
                                value={starshipPickerSearch}
                                onChange={e => setStarshipPickerSearch(e.target.value)}
                                placeholder="Search starships…"
                                className="h-9 pl-10"
                                autoFocus
                              />
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
                                        selected ? 'text-primary bg-primary/10 border-transparent' : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-primary/5 hover:shadow-sm',
                                        disabled && 'opacity-60 cursor-not-allowed hover:bg-transparent hover:shadow-none'
                                      )}
                                    >
                                      <div className="flex items-center gap-3 min-w-0">
                                        <StarshipPickerIcon starship={s} disabled={disabled} />
                                        <div className="min-w-0 flex flex-col flex-1">
                                          <div className="font-medium leading-5 text-foreground truncate">{s.name || s.slug || s.id}</div>
                                          <div className="mt-0.5 text-xs leading-4 text-muted-foreground truncate">{s.slug ? `/${s.slug}` : s.id}</div>
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
                <div className="mt-5 space-y-6">
                  <div className="flex items-center gap-2">
                    <Icon name="wrench" className="h-4 w-4 text-primary" />
                    <div className="text-sm font-semibold">Suggested tools</div>
                    <Badge variant="outline" className="text-xs">
                      {assignedToolSlugs.length}
                    </Badge>
                    <span className="text-xs text-muted-foreground">(permissions can be changed later)</span>
                  </div>

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
                                          <Icon name="info" iconOverride={{ type: 'phosphor', component: 'Info' }} className="h-4 w-4" />
                                        </button>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" align="start" className="max-w-xs p-2 text-xs rounded-xl shadow-frosted-lg bg-card text-card-foreground border border-border/60 z-[1004]">
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
                                          <span className="ml-auto" />
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
                    <div className="rounded-xl border border-border/60 bg-card/50 p-4">
                      <div className="flex items-center gap-2">
                        <Icon name="check-circle" className="h-4 w-4 text-emerald-500" />
                        <p className="text-sm font-semibold">No tools required</p>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">This agent doesn’t require any tools to be deployed.</p>
                    </div>
                  )}
                </div>
              ) : null}

              {step === 3 ? (
                <div className="mt-5 space-y-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">Connect apps</div>
                      {selectedStarship ? <div className="mt-1 text-xs text-muted-foreground truncate">Deploying to {selectedStarship.name || selectedStarship.slug || selectedStarship.id}</div> : null}
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {requiredConnectors.length}
                    </Badge>
                  </div>

                  {requiredConnectors.length > 0 ? (
                    selectedStarship?.id ? (
                      <ConnectorSuggestionCard
                        starshipId={selectedStarship.id}
                        providers={requiredConnectors.map(c => c.provider)}
                        hideSearch={true}
                        hideDisconnect={false}
                        compactCard
                        connectButtonLabel="Connect"
                      />
                    ) : (
                      <div className="rounded-xl border border-border/60 bg-card/50 p-4">
                        <p className="text-sm text-muted-foreground">Select a starship first to connect apps.</p>
                      </div>
                    )
                  ) : (
                    <div className="rounded-xl border border-border/60 bg-card/50 p-4">
                      <div className="flex items-center gap-2">
                        <Icon name="check-circle" className="h-4 w-4 text-emerald-500" />
                        <p className="text-sm font-semibold">No connectors required</p>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">This agent can be deployed without connecting any apps.</p>
                    </div>
                  )}
                </div>
              ) : null}

              {step === 4 ? (
                <div className="mt-5 space-y-4">
                  <div className="rounded-xl border border-border/60 bg-card/50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">Target starship</div>
                        {selectedStarship ? (
                          <div className="mt-1 flex items-start gap-3 min-w-0">
                            <StarshipMonogram starship={selectedStarship} />
                            <div className="min-w-0">
                              <div className="text-sm text-muted-foreground truncate">{selectedStarship?.name || selectedStarship?.slug || selectedStarship?.id}</div>
                              <div className="mt-0.5 text-xs text-muted-foreground truncate">{selectedStarship?.slug ? `/${selectedStarship.slug}` : selectedStarship?.id}</div>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-1 text-sm text-muted-foreground truncate">Not selected</div>
                        )}
                      </div>
                      {selectedStarship ? <Icon name="check-circle" className="h-5 w-5 text-primary shrink-0" /> : null}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-xl border border-border/60 bg-card/50 p-4">
                      <div className="flex items-center gap-2">
                        <Icon name="wrench" className="h-4 w-4 text-primary" />
                        <div className="text-sm font-semibold">Tools</div>
                      </div>
                      <div className="mt-2 text-sm text-muted-foreground tabular-nums">
                        {assignedToolSlugs.length > 0 ? (
                          <>
                            {assignedToolSlugs.length} tools • {permissionCounts.allow} allow • {permissionCounts.ask} ask • {permissionCounts.deny} deny
                          </>
                        ) : (
                          'No tools'
                        )}
                      </div>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-card/50 p-4">
                      <div className="flex items-center gap-2">
                        <Icon name="plug" className="h-4 w-4 text-primary" />
                        <div className="text-sm font-semibold">Connectors</div>
                      </div>
                      <div className="mt-2 text-sm text-muted-foreground">{requiredConnectors.length > 0 ? `${requiredConnectors.length} required` : 'None required'}</div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <DialogFooter className="shrink-0 px-6 py-4 gap-2 flex-row justify-between sm:justify-between sm:space-x-0">
              <div>
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isProcessing}>
                  Cancel
                </Button>
              </div>

              <div className="flex items-center gap-2">
                {step > 1 ? (
                  <Button type="button" variant="ghost" onClick={handleBack} disabled={isProcessing}>
                    <Icon name="caret-left" className="h-4 w-4 mr-1" />
                    Back
                  </Button>
                ) : null}
                {step < 4 ? (
                  <Button type="button" onClick={handleNext} disabled={isProcessing || !canGoNext} className="min-w-[120px]">
                    Next
                    <Icon name="caret-right" className="h-4 w-4 ml-1" />
                  </Button>
                ) : (
                  <Button type="button" onClick={handleDeploy} disabled={isProcessing || !selectedStarship} className="min-w-[140px]">
                    {isProcessing ? (
                      <>
                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                        Deploying...
                      </>
                    ) : (
                      <>
                        <Icon name="sparkles" className="w-4 h-4 mr-2" />
                        Deploy
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

