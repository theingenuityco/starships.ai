'use client'

import dynamic from 'next/dynamic'
import React, { useEffect, useMemo, useState } from 'react'

import type { AgentTemplateModel, AgentToolPermission, DeployStarshipOption, ToolTemplateModel } from '@starships/protocol'

import Icon from '@/components/primitives/Icon'
import { ConnectorSuggestionCard } from '@/components/widgets/ConnectorSuggestionCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Progress } from '@/components/ui/progress'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useRequiredConnectors, useToolTemplates } from '@/hooks/useTemplates'
import type { DeployStarshipOptionWithAccess } from '@/hooks/useStarships'

type WizardStep = 1 | 2 | 3

// Lazy import to avoid circular dependency:
// `AgentTemplateCard` opens the wizard (imports this file), and the wizard wants to render the card.
const AgentTemplateCard = dynamic(() => import('@/components/marketplace/AgentTemplateCard').then(m => m.AgentTemplateCard), { ssr: false })

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

const TOTAL_STEPS = 3

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
        'h-8 w-8 shrink-0 rounded-lg border flex items-center justify-center text-[11px] font-semibold tabular-nums',
        disabled ? 'border-border/60 bg-muted/20 text-muted-foreground' : 'border-primary/25 bg-primary/10 text-primary'
      )}
      aria-hidden
    >
      {initials}
    </div>
  )
}

function stepTitle(step: WizardStep): string {
  if (step === 1) return 'Select starship'
  if (step === 2) return 'Configure'
  return 'Review & deploy'
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

  const singleStarshipFromProps: DeployStarshipOptionWithAccess | null =
    starshipId && (starshipName || starshipSlug) ? { id: starshipId, slug: starshipSlug ?? '', name: starshipName ?? '' } : null
  const listForSelection = (ownedStarships?.length ? ownedStarships : singleStarshipFromProps ? [singleStarshipFromProps] : []) as DeployStarshipOptionWithAccess[]

  const [step, setStep] = useState<WizardStep>(1)
  const [selectedStarship, setSelectedStarship] = useState<DeployStarshipOption | null>(null)

  // Only fetch tool/connectors when the modal is open and user reaches configuration step.
  const shouldFetchConfigData = isOpen && step >= 2
  const { data: allToolTemplates = [] } = useToolTemplates(undefined, shouldFetchConfigData && assignedToolSlugs.length > 0)
  const { data: requiredConnectors = [] } = useRequiredConnectors(templateId, shouldFetchConfigData && !!templateId)

  useEffect(() => {
    if (!isOpen) return
    setStep(1)
    const firstEnabled = listForSelection.find(s => !(s as DeployStarshipOptionWithAccess)?.deployDisabled) ?? null
    setSelectedStarship(firstEnabled)
  }, [isOpen, listForSelection[0]?.id, listForSelection.length])

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
    return false
  }, [step, selectedStarship])

  const handleNext = () => {
    if (isProcessing) return
    if (!canGoNext) return
    if (step === 1) setStep(2)
    else if (step === 2) setStep(3)
  }

  const handleBack = () => {
    if (isProcessing) return
    if (step === 2) setStep(1)
    else if (step === 3) setStep(2)
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

  const showGridSelection = listForSelection.length > 0 && listForSelection.length <= 6
  const progressValue = (step / TOTAL_STEPS) * 100

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col w-[calc(100vw-2rem)] max-w-4xl max-h-[85vh] overflow-hidden p-0">
        <TooltipProvider>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <DialogHeader className="shrink-0 px-6 pt-6 pb-4 border-b border-border/50">
              <DialogTitle className="flex items-center gap-2">
                <Icon name="sparkles" className="w-5 h-5 text-primary" />
                <span>Deploy agent</span>
              </DialogTitle>

              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold">{stepTitle(step)}</div>
                  <div className="text-xs text-muted-foreground">
                    Step {step} of {TOTAL_STEPS}
                  </div>
                </div>
                <Progress value={progressValue} />
              </div>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              {/* Agent preview card (reuse marketplace card without CTA). */}
              <div className="pointer-events-none">
                <AgentTemplateCard template={template} showDeployCta={false} showCategory={false} density="compact" />
              </div>

              {step === 1 ? (
                <div className="mt-5 space-y-3">
                  <div className="text-sm font-semibold">Choose a starship</div>

                  {listForSelection.length === 0 ? (
                    <div className="rounded-xl border border-border/60 bg-card/50 p-4">
                      <p className="text-sm text-muted-foreground">No starships available for deployment.</p>
                    </div>
                  ) : showGridSelection ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {listForSelection.map(s => {
                        const access = s as DeployStarshipOptionWithAccess
                        const disabled = Boolean(access.deployDisabled)
                        const selected = selectedStarship?.id === s.id
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              if (disabled) return
                              setSelectedStarship(s)
                            }}
                            disabled={isProcessing || disabled}
                            aria-pressed={selected}
                            className={cn(
                              // Min height ensures consistent layout even when disabled warning is present.
                              'text-left rounded-xl border p-4 transition-all bg-card/40 hover:bg-card/60 min-h-[108px]',
                              selected ? 'border-primary/50 ring-2 ring-primary/20' : 'border-border/60',
                              (isProcessing || disabled) && 'opacity-60 cursor-not-allowed',
                              disabled && 'hover:bg-card/40'
                            )}
                          >
                            <div className="flex flex-col h-full">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start gap-2 min-w-0">
                                    <StarshipMonogram starship={s} disabled={disabled} />
                                    <div className="min-w-0 flex-1">
                                      <div className="text-base font-semibold leading-tight truncate">{s.name || 'Unnamed starship'}</div>
                                      <div className="mt-0.5 text-xs text-muted-foreground truncate">{s.slug ? `/${s.slug}` : s.id}</div>
                                    </div>
                                  </div>
                                </div>
                                {disabled ? (
                                  <Icon name="lock" className="h-5 w-5 text-muted-foreground shrink-0" />
                                ) : selected ? (
                                  <Icon name="check-circle" className="h-5 w-5 text-primary shrink-0" />
                                ) : (
                                  <div className="h-5 w-5 shrink-0" />
                                )}
                              </div>

                              {/* Disabled warning should be full-width (not part of the monogram/name/slug row). */}
                              <div className="mt-auto pt-3 text-[11px] text-muted-foreground truncate min-h-[1.1rem]">
                                {disabled ? access.deployDisabledReason || 'Deploy disabled' : ''}
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-border/60 bg-card/50 p-4">
                      <p className="text-sm text-muted-foreground">Select the target starship below.</p>
                      <div className="mt-3">
                        {/* For large lists, we keep it simple: clickable list */}
                        <div className="space-y-2">
                          {listForSelection.map(s => {
                            const access = s as DeployStarshipOptionWithAccess
                            const disabled = Boolean(access.deployDisabled)
                            const selected = selectedStarship?.id === s.id
                            return (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => {
                                  if (disabled) return
                                  setSelectedStarship(s)
                                }}
                                disabled={isProcessing || disabled}
                                className={cn('w-full rounded-lg border px-3 py-2 text-sm transition-colors text-left', selected ? 'border-primary/50 bg-primary/10' : 'border-border/60 bg-background/30 hover:bg-muted/30', (isProcessing || disabled) && 'opacity-60 cursor-not-allowed', disabled && 'hover:bg-background/30')}
                              >
                                <div className="flex flex-col min-h-[64px]">
                                  <div className="flex items-start justify-between gap-3">
                                    <span className="flex items-start gap-2 min-w-0 flex-1">
                                      <StarshipMonogram starship={s} disabled={disabled} />
                                      <span className="min-w-0 flex-1">
                                        <span className="block truncate text-base font-semibold leading-tight">{s.name || s.slug || s.id}</span>
                                        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{s.slug ? `/${s.slug}` : s.id}</span>
                                      </span>
                                    </span>
                                    {disabled ? <Icon name="lock" className="h-4 w-4 text-muted-foreground shrink-0" /> : selected ? <Icon name="check" className="h-4 w-4 text-primary shrink-0" /> : null}
                                  </div>

                                  {/* Disabled warning should be full-width (not part of the monogram/name/slug row). */}
                                  <div className="mt-auto pt-2 text-[11px] text-muted-foreground truncate min-h-[1.1rem]">
                                    {disabled ? access.deployDisabledReason || 'Deploy disabled' : ''}
                                  </div>
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}

              {step === 2 ? (
                <div className="mt-5 space-y-6">
                  {/* Connect apps */}
                  {requiredConnectors.length > 0 ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Icon name="plug" className="h-4 w-4 text-primary" />
                        <div className="text-sm font-semibold">Connect apps</div>
                        <Badge variant="outline" className="text-xs">
                          {requiredConnectors.length}
                        </Badge>
                      </div>

                      {selectedStarship?.id ? (
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
                      )}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-border/60 bg-card/50 p-4">
                      <div className="flex items-center gap-2">
                        <Icon name="check-circle" className="h-4 w-4 text-emerald-500" />
                        <p className="text-sm font-semibold">No connectors required</p>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">This agent can be deployed without connecting any apps.</p>
                    </div>
                  )}

                  {/* Capabilities / permissions */}
                  {assignedToolSlugs.length > 0 ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Icon name="wrench" className="h-4 w-4 text-primary" />
                        <div className="text-sm font-semibold">Capabilities</div>
                        <span className="text-xs text-muted-foreground">(permissions can be changed later)</span>
                      </div>

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
                    </div>
                  ) : null}
                </div>
              ) : null}

              {step === 3 ? (
                <div className="mt-5 space-y-4">
                  <div className="rounded-xl border border-border/60 bg-card/50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">Target starship</div>
                        {selectedStarship ? (
                          <div className="mt-1 flex items-start gap-2 min-w-0">
                            <StarshipMonogram starship={selectedStarship} />
                            <div className="min-w-0">
                              <div className="text-sm text-muted-foreground truncate">{selectedStarship?.name || selectedStarship?.slug || selectedStarship?.id}</div>
                              <div className="mt-0.5 text-[11px] text-muted-foreground truncate">{selectedStarship?.slug ? `/${selectedStarship.slug}` : selectedStarship?.id}</div>
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
                        <Icon name="plug" className="h-4 w-4 text-primary" />
                        <div className="text-sm font-semibold">Connectors</div>
                      </div>
                      <div className="mt-2 text-sm text-muted-foreground">{requiredConnectors.length > 0 ? `${requiredConnectors.length} required` : 'None required'}</div>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-card/50 p-4">
                      <div className="flex items-center gap-2">
                        <Icon name="wrench" className="h-4 w-4 text-primary" />
                        <div className="text-sm font-semibold">Capabilities</div>
                      </div>
                      <div className="mt-2 text-sm text-muted-foreground">
                        {assignedToolSlugs.length > 0 ? (
                          <span className="tabular-nums">
                            {assignedToolSlugs.length} tools • {permissionCounts.allow} allow • {permissionCounts.ask} ask • {permissionCounts.deny} deny
                          </span>
                        ) : (
                          'No tools'
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <DialogFooter className="shrink-0 px-6 py-4 border-t border-border/50 gap-2 flex-row justify-between sm:justify-between sm:space-x-0">
              <div>
                {step > 1 ? (
                  <Button type="button" variant="ghost" onClick={handleBack} disabled={isProcessing}>
                    {'<- Back'}
                  </Button>
                ) : (
                  <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isProcessing}>
                    Cancel
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-2">
                {step < 3 ? (
                  <Button type="button" onClick={handleNext} disabled={isProcessing || !canGoNext} className="min-w-[120px]">
                    Next →
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

