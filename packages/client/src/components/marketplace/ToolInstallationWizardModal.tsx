'use client'

import React, { useEffect, useMemo, useState } from 'react'

import type { DeployStarshipOption, ToolTemplateModel } from '@starships/protocol'

import Icon from '@/components/primitives/Icon'
import { ConnectorSuggestionCard } from '@/components/widgets/ConnectorSuggestionCard'
import { ToolTemplatePreviewCard } from '@/components/marketplace/ToolTemplatePreviewCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useStarshipConnectors } from '@/hooks/useConnectors'
import { StarshipMonogram, StarshipPickerIcon } from '@/components/marketplace/StarshipIdentity'
import { WizardStepper } from '@/components/marketplace/WizardStepper'

type WizardStep = 1 | 2 | 3

interface ToolInstallationWizardModalProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (input?: { starship?: DeployStarshipOption }) => Promise<void>
  isProcessing: boolean
  template: ToolTemplateModel
  /**
   * When provided, user can choose target starship.
   * If length > 1, this wizard will show a selection step.
   */
  ownedStarships?: DeployStarshipOption[]
  /** Fallback when ownedStarships isn't provided. */
  starshipId?: string
  starshipSlug?: string
  starshipName?: string
}

type StepMeta = { id: WizardStep; label: string; subtitle: string }
const WIZARD_STEPS: StepMeta[] = [
  { id: 1, label: 'Starship', subtitle: 'Select a starship' },
  { id: 2, label: 'Connectors', subtitle: 'Connect required apps' },
  { id: 3, label: 'Review', subtitle: 'Confirm & install' },
]

export function ToolInstallationWizardModal({
  isOpen,
  onOpenChange,
  onConfirm,
  isProcessing,
  template,
  ownedStarships,
  starshipId,
  starshipSlug,
  starshipName,
}: ToolInstallationWizardModalProps) {
  const templateSlug = String(template?.slug || '').trim()
  const toolName = String(template?.name || 'tool').trim() || 'tool'
  const requiresApiKey = Boolean(template?.requiresApiKey)

  const requiredConnectorProviders = useMemo(() => {
    const list = Array.isArray(template?.requiredConnectorProviders) ? template.requiredConnectorProviders : []
    const normalized = list
      .map(p => String(p || '').trim())
      .filter(Boolean)
      // Ignore the built-in Starships connector requirement.
      .filter(p => p.toLowerCase() !== 'starships')
    return Array.from(new Set(normalized))
  }, [template])

  const singleStarshipFromProps: DeployStarshipOption | null =
    starshipId && (starshipName || starshipSlug) ? { id: starshipId, slug: starshipSlug ?? '', name: starshipName ?? '' } : null
  const listForSelection = ownedStarships?.length ? ownedStarships : singleStarshipFromProps ? [singleStarshipFromProps] : []

  const [step, setStep] = useState<WizardStep>(1)
  const [selectedStarship, setSelectedStarship] = useState<DeployStarshipOption | null>(null)
  const [starshipPickerOpen, setStarshipPickerOpen] = useState(false)
  const [starshipPickerSearch, setStarshipPickerSearch] = useState('')

  const selectedStarshipId = String(selectedStarship?.id || '')
  const shouldFetchConnectors = isOpen && step >= 2 && !!selectedStarshipId
  const { data: selectedStarshipConnectors = [] } = useStarshipConnectors(selectedStarshipId, Boolean(shouldFetchConnectors))

  const connectedRequiredConnectorsCount = useMemo(() => {
    const requiredProviders = new Set(requiredConnectorProviders.map(p => String(p || '').trim().toLowerCase()).filter(Boolean))
    if (requiredProviders.size === 0) return 0
    return (selectedStarshipConnectors ?? []).filter(c => {
      const provider = String(c?.provider || '').trim().toLowerCase()
      if (!provider || provider === 'starships') return false
      const status = String(c?.status || '').trim()
      return requiredProviders.has(provider) && status === 'connected'
    }).length
  }, [requiredConnectorProviders, selectedStarshipConnectors])

  useEffect(() => {
    if (!isOpen) return
    setStep(1)
    setSelectedStarship(listForSelection[0] ?? null)
  }, [isOpen, listForSelection[0]?.id, listForSelection.length])

  useEffect(() => {
    if (!starshipPickerOpen) setStarshipPickerSearch('')
  }, [starshipPickerOpen])

  const canGoNext = useMemo(() => {
    if (step === 1) return !!selectedStarship
    if (step === 2) return !!selectedStarship
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
  }

  const handleBack = () => {
    if (isProcessing) return
    if (step === 2) setStep(1)
    else if (step === 3) setStep(2)
  }

  const handleInstall = async () => {
    try {
      await onConfirm({ starship: selectedStarship ?? undefined })
      onOpenChange(false)
    } catch {
      // Keep wizard open if install fails.
    }
  }

  const showConnectorsStep = step === 2
  const showReviewStep = step === 3

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col w-[calc(100vw-2rem)] max-w-3xl h-[80vh] overflow-hidden p-0">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <DialogHeader className="shrink-0 px-6 pt-6 pb-6 space-y-6">
            <DialogTitle>Install tool</DialogTitle>
            <div>
              <WizardStepper currentStep={step} steps={WIZARD_STEPS} />
            </div>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <div className="text-sm font-semibold">Tool details</div>
            <ToolTemplatePreviewCard template={template} className="mt-3 mb-6" />

            {step === 1 ? (
              <div className="mt-8 space-y-4">
                <div className="text-sm font-semibold">Choose a starship to install {toolName}</div>

                {listForSelection.length === 0 ? (
                  <div className="rounded-xl border border-border/60 bg-card/50 p-4">
                    <p className="text-sm text-muted-foreground">No starships available for installation.</p>
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
                              <span className="block truncate text-sm font-semibold leading-tight">{selectedStarship?.name || selectedStarship?.slug || 'Select a starship…'}</span>
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
                            <Input value={starshipPickerSearch} onChange={e => setStarshipPickerSearch(e.target.value)} placeholder="Search starships…" className="h-9 pl-10" autoFocus />
                          </div>
                        </div>

                        <div className="p-2 max-h-64 overflow-y-auto custom-scrollbar">
                          {filteredStarships.length === 0 ? (
                            <div className="text-center py-4 text-sm text-muted-foreground">No starships match your search</div>
                          ) : (
                            <>
                              {filteredStarships.map(s => {
                                const selected = selectedStarship?.id === s.id
                                return (
                                  <button
                                    key={s.id}
                                    type="button"
                                    onClick={() => {
                                      setSelectedStarship(s)
                                      setStarshipPickerOpen(false)
                                    }}
                                    className={cn(
                                      'w-full text-left px-3 py-2 rounded-lg transition-colors focus-visible-ring',
                                      selected ? 'text-primary bg-primary/10 border-transparent' : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-primary/5 hover:shadow-sm'
                                    )}
                                  >
                                    <div className="flex items-center gap-3 min-w-0">
                                      <StarshipPickerIcon starship={s} />
                                      <div className="min-w-0 flex flex-col flex-1">
                                        <div className="text-sm font-semibold leading-tight text-foreground truncate">{s.name || s.slug || s.id}</div>
                                        <div className="mt-0.5 text-xs leading-4 text-muted-foreground truncate">{s.slug ? `/${s.slug}` : s.id}</div>
                                      </div>
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

            {showConnectorsStep ? (
              <div className="mt-8 space-y-4">
                <div className="text-sm font-semibold">Connectors</div>

                {requiredConnectorProviders.length > 0 ? (
                  selectedStarship?.id ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs text-muted-foreground">
                          {connectedRequiredConnectorsCount}/{requiredConnectorProviders.length} connected
                        </div>
                        {requiresApiKey ? (
                          <Badge variant="outline" className="border-yellow-500/30 bg-yellow-500/10 text-yellow-800 dark:text-yellow-200 text-[11px] px-2 py-0.5">
                            API key required
                          </Badge>
                        ) : null}
                      </div>

                      <ConnectorSuggestionCard
                        starshipId={selectedStarship.id}
                        providers={requiredConnectorProviders}
                        hideSearch={true}
                        hideDisconnect={false}
                        compactCard
                        connectButtonLabel="Connect"
                        animateCards={false}
                      />
                    </div>
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
                      <p className="text-xs text-muted-foreground leading-relaxed">This tool can be installed without connecting any apps.</p>
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {showReviewStep ? (
              <div className="mt-8 space-y-2">
                <div className="text-sm font-semibold">Review</div>

                <div className="space-y-3 pt-2">
                  <div className="group relative rounded-lg border border-border/60 bg-card/10 p-3">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon name="rocket" className="h-4 w-4 text-foreground shrink-0" />
                        <div className="text-sm font-semibold leading-tight text-foreground truncate">Target starship</div>
                      </div>

                      {selectedStarship ? (
                        <div className="mt-1 flex items-start gap-3 min-w-0">
                          <StarshipMonogram starship={selectedStarship} />
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-muted-foreground truncate">{selectedStarship?.name || selectedStarship?.slug || selectedStarship?.id}</div>
                            <div className="mt-0.5 text-[11px] text-muted-foreground truncate">{selectedStarship?.slug ? `/${selectedStarship.slug}` : selectedStarship?.id}</div>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-1 text-xs text-muted-foreground truncate">Not selected</div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="group relative rounded-lg border border-border/60 bg-card/10 p-3">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <Icon name="plug" className="h-4 w-4 text-foreground shrink-0" />
                          <div className="text-sm font-semibold leading-tight text-foreground truncate">Connectors</div>
                        </div>
                        {requiredConnectorProviders.length > 0 ? (
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs leading-none text-muted-foreground">
                            <span className="font-medium leading-none tabular-nums text-muted-foreground">{requiredConnectorProviders.length} required</span>
                            <span aria-hidden="true" className="h-3 w-px bg-border/60" />
                            <span className="font-medium leading-none tabular-nums text-emerald-700 dark:text-emerald-300">{connectedRequiredConnectorsCount} connected</span>
                          </div>
                        ) : (
                          <div className="mt-1 text-xs font-medium leading-none text-emerald-700 dark:text-emerald-300">No connectors required</div>
                        )}
                      </div>
                    </div>
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

              {step < 3 ? (
                <Button type="button" variant="primaryOutline" onClick={handleNext} disabled={isProcessing || !canGoNext} className="min-w-[120px]">
                  Next
                  <Icon name="caret-right" className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Button type="button" onClick={handleInstall} disabled={isProcessing || !selectedStarship || !templateSlug} className="min-w-[140px]">
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
      </DialogContent>
    </Dialog>
  )
}

