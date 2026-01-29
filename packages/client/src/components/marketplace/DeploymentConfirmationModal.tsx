'use client'

import React, { useEffect, useMemo, useState } from 'react'

import Icon from '@/components/primitives/Icon'
import AgentAvatar from '@/components/animated/AgentAvatar'
import { Avatar } from '@/components/ui/avatar'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useToolTemplates } from '@/hooks/useTemplates'

import type { AgentTemplateModel, AgentToolPermission, ToolTemplateModel } from '@starships/protocol'

interface DeploymentConfirmationModalProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (input?: { toolPermissions?: Record<string, AgentToolPermission> }) => Promise<void>
  isProcessing: boolean
  type: 'agent' | 'tool'
  template: AgentTemplateModel | ToolTemplateModel
  starshipName: string
}

export function DeploymentConfirmationModal({ isOpen, onOpenChange, onConfirm, isProcessing, type, template, starshipName }: DeploymentConfirmationModalProps) {
  const isAgent = type === 'agent'
  const actionText = isAgent ? 'deploy' : 'install'
  const ActionIconName = isAgent ? 'bot' : 'wrench'
  const avatarUrl = isAgent ? (template as AgentTemplateModel).avatarUrl : undefined
  const agentTemplate = (isAgent ? (template as AgentTemplateModel) : null) as AgentTemplateModel | null
  const assignedToolSlugs = (agentTemplate?.assignedToolSlugs || []).filter(Boolean)

  const { data: allToolTemplates = [] } = useToolTemplates(undefined, isOpen && isAgent && assignedToolSlugs.length > 0)
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
    if (!isAgent) return
    if (assignedToolSlugs.length === 0) return

    setToolPermissions(prev => {
      const next: Record<string, AgentToolPermission> = {}
      for (const slug of assignedToolSlugs) {
        // Default to "ask" for safety; user can promote to allow or lock down to deny.
        next[slug] = prev?.[slug] ?? 'ask'
      }
      return next
    })
  }, [isOpen, isAgent, assignedToolSlugs.join('|')])

  const permissionLabel = (p: AgentToolPermission): string => {
    if (p === 'allow') return 'Allow'
    if (p === 'ask') return 'Ask first'
    return 'Deny'
  }
  const permissionDescription = (p: AgentToolPermission): string => {
    if (p === 'allow') return 'Agent can trigger this tool without confirmation.'
    if (p === 'ask') return 'Agent can trigger this tool, but you will be asked to confirm.'
    return 'Agent cannot trigger this tool.'
  }
  const permissionIconName = (p: AgentToolPermission): string => {
    if (p === 'allow') return 'check-circle'
    if (p === 'ask') return 'help-circle'
    return 'x-circle'
  }
  const permissionBadgeClassName = (p: AgentToolPermission): string => {
    if (p === 'allow') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
    if (p === 'ask') return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
    return 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'
  }
  const permissionDotClassName = (p: AgentToolPermission): string => {
    if (p === 'allow') return 'bg-emerald-500/70'
    if (p === 'ask') return 'bg-amber-500/70'
    return 'bg-red-500/70'
  }
  const permissionMenuItemClassName = (p: AgentToolPermission): string => {
    if (p === 'allow') return 'hover:bg-emerald-500/10 focus:bg-emerald-500/10'
    if (p === 'ask') return 'hover:bg-amber-500/10 focus:bg-amber-500/10'
    return 'hover:bg-red-500/10 focus:bg-red-500/10'
  }
  const permissionMenuItemSelectedClassName = (p: AgentToolPermission): string => {
    if (p === 'allow') return 'bg-emerald-500/10'
    if (p === 'ask') return 'bg-amber-500/10'
    return 'bg-red-500/10'
  }
  const permissionMenuIconClassName = (p: AgentToolPermission): string => {
    if (p === 'allow') return 'text-emerald-500'
    if (p === 'ask') return 'text-amber-500'
    return 'text-red-500'
  }

  const handleConfirm = async () => {
    try {
      await onConfirm(isAgent ? { toolPermissions } : undefined)
      onOpenChange(false)
    } catch {
      // Keep the modal open if the deploy/install fails.
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-3xl max-h-[85vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name={ActionIconName} className="w-5 h-5 text-primary" />
            Confirm {isAgent ? 'Deployment' : 'Installation'}
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1 space-y-5">
          {/* Template Info */}
          <div className="rounded-xl border border-border/60 bg-card/50 p-4 shadow-sm">
            <div className="flex items-start gap-3 min-w-0">
              {isAgent ? (
                <Avatar className="h-10 w-10 rounded-full ring-1 ring-border/40 shadow-sm">
                  <AgentAvatar seed={template.name} imageUrl={avatarUrl} size={40} rounded />
                </Avatar>
              ) : (
                <div className="flex-shrink-0 p-2 rounded-lg bg-primary/20">
                  <div className="text-lg">🔧</div>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="font-semibold text-sm leading-tight truncate">{template.name}</h4>
                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs capitalize">
                        {template.category}
                      </Badge>
                      {isAgent && (template as AgentTemplateModel).version ? (
                        <Badge variant="outline" className="text-xs font-mono">
                          v{(template as AgentTemplateModel).version}
                        </Badge>
                      ) : null}
                      {isAgent && (template as AgentTemplateModel).model ? (
                        <Badge variant="outline" className="text-xs font-mono">
                          {(template as AgentTemplateModel).model}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {template.description ? <p className="mt-3 text-sm text-muted-foreground leading-relaxed line-clamp-3">{template.description}</p> : null}
          </div>

          {/* Additional Info */}
          {!isAgent && (template as ToolTemplateModel).requiresApiKey && (
            <div className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
              <Icon name="alert-triangle" className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
              <span className="text-sm text-yellow-800 dark:text-yellow-200">This tool requires an API key to function properly.</span>
            </div>
          )}

          {/* Capabilities (tool permissions) */}
          {isAgent && assignedToolSlugs.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Icon name="wrench" className="h-4 w-4 text-primary" />
                  <div className="text-sm font-semibold">Capabilities</div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {assignedToolSlugs.map(slug => {
                  const info = toolTemplateBySlug.get(slug)
                  const title = info?.name?.trim() || slug
                  const desc = info?.description?.trim() || ''
                  const current = toolPermissions[slug] ?? 'ask'
                  return (
                    <div
                      key={slug}
                      className={cn(
                        'group relative rounded-xl border border-border/60 bg-gradient-to-br from-background/50 to-background/30 p-4 transition-all duration-200',
                        'hover:from-background/60 hover:to-background/40 hover:border-border/70 hover:shadow-md'
                      )}
                    >
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
                                    className="inline-flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                                    aria-label={`Tool info: ${title}`}
                                  >
                                    <Icon name="info" className="h-4 w-4" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top" align="start" className="max-w-xs p-2 text-xs rounded-xl shadow-frosted-lg bg-popover text-popover-foreground border border-border/60">
                                  <div className="font-semibold text-foreground mb-1">{title}</div>
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

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isProcessing}>
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={isProcessing} className="min-w-[120px]">
            {isProcessing ? (
              <>
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                {isAgent ? 'Deploying...' : 'Installing...'}
              </>
            ) : (
              <>
                <Icon name="sparkles" className="w-4 h-4 mr-2" />
                {isAgent ? 'Deploy' : 'Install'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
