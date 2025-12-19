import React from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import AgentAvatar from '@/components/animated/AgentAvatar'
import Icon from '@/components/primitives/Icon'
import { cn } from '@/lib/utils'
import type { AgentFormData } from '../types'
import type { AgentModel, ToolModel } from '@starships/protocol'

type VersionBump = 'patch' | 'minor' | 'major'

type ToolOverride = {
  versionBump: VersionBump
  changelog: string
}

interface AgentPublishModalProps {
  open: boolean
  readOnly?: boolean
  onOpenChange: (open: boolean) => void
  fullAgent: AgentModel | null
  value: AgentFormData
  differsFromPublishedTemplate: boolean
  publishedChangeDetails: string[]
  assignedToolsForOverrides: ToolModel[]
  versionBump: VersionBump
  setVersionBump: React.Dispatch<React.SetStateAction<VersionBump>>
  changelog: string
  setChangelog: React.Dispatch<React.SetStateAction<string>>
  toolOverrides: Record<string, ToolOverride>
  setToolOverrides: React.Dispatch<React.SetStateAction<Record<string, ToolOverride>>>
  publishSteps: string[]
  activePublishStep: string
  setActivePublishStep: React.Dispatch<React.SetStateAction<string>>
  nextVersion: string
  isRequestingPublish: boolean
  onSubmit: () => void
}

const computeNextVersion = (currentVersion: string | undefined, bump: VersionBump): string => {
  const base = currentVersion || '1.0.0'
  const match = base.match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!match) return '1.0.0'

  const major = Number(match[1])
  const minor = Number(match[2])
  const patch = Number(match[3])

  switch (bump) {
    case 'patch':
      return `${major}.${minor}.${patch + 1}`
    case 'minor':
      return `${major}.${minor + 1}.0`
    case 'major':
      return `${major + 1}.0.0`
  }
}

export function AgentPublishModal({
  open,
  readOnly,
  onOpenChange,
  fullAgent,
  value,
  differsFromPublishedTemplate,
  publishedChangeDetails,
  assignedToolsForOverrides,
  versionBump,
  setVersionBump,
  changelog,
  setChangelog,
  toolOverrides,
  setToolOverrides,
  publishSteps,
  activePublishStep,
  setActivePublishStep,
  nextVersion,
  isRequestingPublish,
  onSubmit,
}: AgentPublishModalProps) {
  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      setChangelog('')
      setToolOverrides({})
      setActivePublishStep('agent')
    } else {
      setActivePublishStep('agent')
    }
  }

  if (readOnly) return null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl rounded-lg">
        <DialogHeader>
          <DialogTitle>Request: Publish to marketplace</DialogTitle>
          <DialogDescription>Choose how to bump the agent’s version and add a brief changelog. Once approved, this agent will be published to the community marketplace.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Agent step card (identity, version diff, bump, changelog) */}
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-3 space-y-3 shadow-sm">
            <div
              className={cn('flex items-start justify-between gap-4 cursor-pointer', activePublishStep === 'agent' ? 'bg-muted/40 rounded-lg px-1 py-1 -mx-1' : '')}
              onClick={() => setActivePublishStep('agent')}
              role="button"
              aria-expanded={activePublishStep === 'agent'}
            >
              <div className="flex items-start gap-2 min-w-0">
                <AgentAvatar
                  seed={fullAgent?.name || value.name || value.slug || 'Agent'}
                  size={32}
                  rounded
                  className="h-8 w-8 rounded-xl overflow-hidden ring-1 ring-primary/40 bg-background shrink-0"
                />
                <div className="space-y-0.5 min-w-0">
                  <p className="text-xs font-semibold truncate">{fullAgent?.name || value.name || 'Untitled agent'}</p>
                  <p className="text-[11px] text-muted-foreground font-mono truncate">{fullAgent?.slug || value.slug || 'no-slug'}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-4 text-[11px] shrink-0">
                <div className="text-right">
                  <p className="uppercase text-[10px] text-muted-foreground mb-0.5">Current</p>
                  <p className="font-mono font-semibold text-sm">v{fullAgent?.version || '1.0.0'}</p>
                </div>
                <div className="text-right">
                  <p className="uppercase text-[10px] text-muted-foreground mb-0.5">New</p>
                  <p className="font-mono font-semibold text-sm text-emerald-600">v{nextVersion}</p>
                </div>
              </div>
            </div>

            {activePublishStep === 'agent' && (
              <>
                {fullAgent?.publishedTemplateId ? (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground">Agent changes in this publish</p>
                    {differsFromPublishedTemplate && publishedChangeDetails.length > 0 ? (
                      <ul className="list-disc list-inside space-y-0.5 text-[11px] text-muted-foreground">
                        {publishedChangeDetails.map(item => (
                          <li key={item} className="font-medium">
                            {item}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">No detected differences from the last published template.</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-muted-foreground">Agent changes in this publish</p>
                    <p className="text-[11px] text-muted-foreground">First time publishing this agent to the marketplace.</p>
                  </div>
                )}

                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground">Agent version bump</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {(
                      [
                        {
                          value: 'major' as const,
                          title: 'Major',
                          summary: 'Big changes',
                          description: 'Breaking changes or large updates that may impact users.',
                        },
                        {
                          value: 'minor' as const,
                          title: 'Minor',
                          summary: 'New features',
                          description: 'Adds features in a backwards-compatible way.',
                        },
                        {
                          value: 'patch' as const,
                          title: 'Patch',
                          summary: 'Small fixes',
                          description: 'Tiny adjustments and bug fixes; no breaking changes.',
                        },
                      ] as const
                    ).map(option => {
                      const isSelected = versionBump === option.value
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setVersionBump(option.value)}
                          className={cn(
                            'w-full rounded-lg border px-3 py-2 text-left transition-colors text-xs',
                            'hover:bg-muted/60',
                            isSelected ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-500/5' : 'border-border/60 bg-background'
                          )}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-semibold">{option.title}</span>
                            <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground">{option.summary}</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-snug">{option.description}</p>
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground">Agent changelog</p>
                  <textarea
                    id="publication-changelog"
                    className="w-full min-h-[80px] rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    placeholder="Summarize what changed in this version for reviewers…"
                    value={changelog}
                    onChange={e => setChangelog(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground mt-0.5">High-level notes about changes to this agent for reviewers.</p>
                </div>
              </>
            )}
          </div>

          {/* Tool change steps (one collapsible card per tool, mirroring agent card) */}
          {assignedToolsForOverrides.length > 0 && (
            <div className="space-y-3">
              <div className="space-y-3 pr-1">
                {assignedToolsForOverrides.map(tool => {
                  const override = toolOverrides[tool.id] || { versionBump: 'patch' as const, changelog: '' }
                  const isNewTemplate = !tool.publishedTemplateId
                  const hasTemplateUpdate = !!tool.updateInfo?.needsUpdate
                  const changeLabel = isNewTemplate
                    ? 'New tool will be published for this agent.'
                    : hasTemplateUpdate
                      ? 'Tool definition changes will be synced to its template.'
                      : 'No detected changes vs current template.'
                  const currentToolVersion = tool.version || '1.0.0'
                  const nextToolVersion = computeNextVersion(currentToolVersion, override.versionBump)
                  const isActiveToolStep = activePublishStep === tool.id

                  return (
                    <div key={tool.id} className="rounded-lg border border-border bg-muted/40 px-3 py-3 space-y-3 shadow-sm">
                      {/* Tool identity + version diff (mirrors agent header) */}
                      <div
                        className={cn('flex items-start justify-between gap-4 cursor-pointer', isActiveToolStep ? 'bg-muted/40 rounded-lg px-1 py-1 -mx-1' : '')}
                        onClick={() => setActivePublishStep(tool.id)}
                        role="button"
                        aria-expanded={isActiveToolStep}
                      >
                        <div className="flex items-start gap-2 min-w-0">
                          <div className="h-8 w-8 rounded-lg bg-primary/5 border border-primary/30 flex items-center justify-center text-[11px] font-semibold text-primary shrink-0">
                            {(tool.name || tool.slug || 'T').charAt(0).toUpperCase()}
                          </div>
                          <div className="space-y-0.5 min-w-0">
                            <p className="text-xs font-semibold truncate">{tool.name}</p>
                            <p className="text-[11px] text-muted-foreground truncate font-mono">{tool.slug}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 text-[11px] shrink-0">
                          <div className="text-right">
                            <p className="uppercase text-[10px] text-muted-foreground mb-0.5">Current</p>
                            <p className="font-mono font-semibold text-sm">v{currentToolVersion}</p>
                          </div>
                          <div className="text-right">
                            <p className="uppercase text-[10px] text-muted-foreground mb-0.5">New</p>
                            <p className="font-mono font-semibold text-sm text-emerald-600">v{nextToolVersion}</p>
                          </div>
                          {tool.updateInfo?.latestVersion && tool.updateInfo.latestVersion !== tool.version && (
                            <div className="col-span-2 text-[10px] text-emerald-600 text-right">Template latest: v{tool.updateInfo.latestVersion}</div>
                          )}
                        </div>
                      </div>

                      {isActiveToolStep && (
                        <>
                          {/* Tool changes summary (mirrors agent changes section) */}
                          <div className="space-y-1">
                            <p className="text-xs font-semibold text-muted-foreground">Tool changes in this publish</p>
                            <p className="text-[11px] text-muted-foreground">{changeLabel}</p>
                          </div>

                          {/* Tool version bump (mirrors agent version bump style, but per tool) */}
                          <div className="space-y-1">
                            <p className="text-xs font-semibold text-muted-foreground">Tool version bump</p>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              {(
                                [
                                  {
                                    value: 'major' as const,
                                    title: 'Major',
                                    summary: 'Big changes',
                                    description: 'Breaking changes or large updates that may impact users.',
                                  },
                                  {
                                    value: 'minor' as const,
                                    title: 'Minor',
                                    summary: 'New features',
                                    description: 'Adds features in a backwards-compatible way.',
                                  },
                                  {
                                    value: 'patch' as const,
                                    title: 'Patch',
                                    summary: 'Small fixes',
                                    description: 'Tiny adjustments and bug fixes; no breaking changes.',
                                  },
                                ] as const
                              ).map(option => {
                                const isSelected = override.versionBump === option.value
                                return (
                                  <button
                                    key={option.value}
                                    type="button"
                                    onClick={() =>
                                      setToolOverrides(prev => ({
                                        ...prev,
                                        [tool.id]: { versionBump: option.value, changelog: override.changelog },
                                      }))
                                    }
                                    className={cn(
                                      'w-full rounded-lg border px-3 py-2 text-left transition-colors text-xs',
                                      'hover:bg-muted/60',
                                      isSelected ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-500/5' : 'border-border/60 bg-background'
                                    )}
                                  >
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="font-semibold">{option.title}</span>
                                      <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground">{option.summary}</span>
                                    </div>
                                    <p className="text-[11px] text-muted-foreground leading-snug">{option.description}</p>
                                  </button>
                                )
                              })}
                            </div>
                          </div>

                          {/* Tool changelog (mirrors agent changelog section) */}
                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-muted-foreground">Tool changelog</p>
                            <textarea
                              className="w-full min-h-[80px] rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                              placeholder="Notes about changes to this tool for reviewers…"
                              value={override.changelog}
                              onChange={e =>
                                setToolOverrides(prev => ({
                                  ...prev,
                                  [tool.id]: { versionBump: override.versionBump, changelog: e.target.value },
                                }))
                              }
                            />
                            <p className="text-[11px] text-muted-foreground mt-0.5">High-level notes about changes to this tool for reviewers.</p>
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between">
          {publishSteps.length > 1 && (
            <p className="text-[11px] text-muted-foreground">
              Step {Math.max(1, publishSteps.indexOf(activePublishStep) + 1)} of {publishSteps.length}
            </p>
          )}
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isRequestingPublish}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              const currentIndex = publishSteps.indexOf(activePublishStep)
              const isLastStep = currentIndex === publishSteps.length - 1 || currentIndex === -1
              if (isLastStep) {
                onSubmit()
              } else {
                const nextStep = publishSteps[currentIndex + 1]
                if (nextStep) {
                  setActivePublishStep(nextStep)
                }
              }
            }}
            disabled={isRequestingPublish}
          >
            {isRequestingPublish ? 'Submitting…' : publishSteps.indexOf(activePublishStep) === publishSteps.length - 1 || publishSteps.length === 1 ? 'Submit for review' : 'Next'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
