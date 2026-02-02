'use client'

import Icon from '@/components/primitives/Icon'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import api from '@/lib/api'
import type { FetchResponse } from '@/lib/types'
import type { ApiResponse, ToolModel } from '@starships/protocol'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import React, { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { STARSHIP_TOOL_PERMISSION_QUERY_KEYS, type StarshipToolPermissionRow, type ToolPermission, useStarshipToolPermissions } from '@/hooks/useStarshipToolPermissions'
import { PROFILE_SECTION_CARD_CLASS } from '@/components/profile/profileCardClasses'
import { cn } from '@/lib/utils'

type Props = {
  starshipId: string
  canEdit: boolean
}

type PermissionUIValue = ToolPermission | 'unset'

const PERMISSION_LABEL: Record<PermissionUIValue, string> = {
  unset: 'Not set',
  allow: 'Allow',
  ask: 'Ask first',
  deny: 'Deny',
}

function PermissionBadge({ value }: { value: PermissionUIValue }) {
  if (value === 'allow') {
    return (
      <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
        Allow
      </Badge>
    )
  }
  if (value === 'ask') {
    return (
      <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400">
        Ask
      </Badge>
    )
  }
  if (value === 'deny') {
    return (
      <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">
        Deny
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="border-border/60 bg-muted/20 text-muted-foreground">
      Not set
    </Badge>
  )
}

const permissionDescription = (p: PermissionUIValue): string => {
  if (p === 'allow') return 'Agent can trigger this tool without confirmation.'
  if (p === 'ask') return 'Agent can trigger this tool, but you will be asked to confirm.'
  if (p === 'deny') return 'Agent cannot trigger this tool.'
  return 'Remove starship-level assignment.'
}

const permissionIconName = (p: PermissionUIValue): string => {
  if (p === 'allow') return 'check-circle'
  if (p === 'ask') return 'help-circle'
  if (p === 'deny') return 'x-circle'
  return 'minus'
}

const permissionBadgeClassName = (p: PermissionUIValue): string => {
  if (p === 'allow') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
  if (p === 'ask') return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
  if (p === 'deny') return 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'
  return 'border-border/60 bg-muted/20 text-muted-foreground'
}

const permissionMenuItemClassName = (p: PermissionUIValue): string => {
  if (p === 'allow') return 'hover:bg-emerald-500/10 focus:bg-emerald-500/10'
  if (p === 'ask') return 'hover:bg-amber-500/10 focus:bg-amber-500/10'
  if (p === 'deny') return 'hover:bg-red-500/10 focus:bg-red-500/10'
  return 'hover:bg-muted/30 focus:bg-muted/30'
}

const permissionMenuItemSelectedClassName = (p: PermissionUIValue): string => {
  if (p === 'allow') return 'bg-emerald-500/10'
  if (p === 'ask') return 'bg-amber-500/10'
  if (p === 'deny') return 'bg-red-500/10'
  return 'bg-muted/30'
}

const permissionMenuIconClassName = (p: PermissionUIValue): string => {
  if (p === 'allow') return 'text-emerald-500'
  if (p === 'ask') return 'text-amber-500'
  if (p === 'deny') return 'text-red-500'
  return 'text-muted-foreground'
}

const permissionDotClassName = (p: PermissionUIValue): string => {
  if (p === 'allow') return 'bg-emerald-500/70'
  if (p === 'ask') return 'bg-amber-500/70'
  if (p === 'deny') return 'bg-red-500/70'
  return 'bg-muted-foreground/60'
}

function ToolDropdown(args: { value: string; onValueChange: (next: string) => void; tools: ToolModel[]; disabled?: boolean; placeholder?: string }) {
  const { value, onValueChange, tools, disabled = false, placeholder = 'Select…' } = args
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const selected = useMemo(() => tools.find(t => t.slug === value) || null, [tools, value])
  const filtered = useMemo(() => {
    const q = (search || '').trim().toLowerCase()
    if (!q) return tools
    return tools.filter(t => {
      const name = (t.name || '').toLowerCase()
      const slug = (t.slug || '').toLowerCase()
      const desc = (t.description || '').toLowerCase()
      return name.includes(q) || slug.includes(q) || desc.includes(q)
    })
  }, [search, tools])

  // Reset search when closing for predictable UX.
  React.useEffect(() => {
    if (!open) setSearch('')
  }, [open])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          aria-label={selected ? `Selected tool: ${selected.name || selected.slug}. Change tool.` : 'Select a tool'}
          className={cn(
            // Match Input styling (components/ui/input)
            'flex h-10 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-background px-3 py-2 text-sm text-left',
            'ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            'hover:bg-background hover:text-foreground',
            disabled && 'opacity-60 cursor-not-allowed'
          )}
          disabled={disabled}
        >
          <span className="truncate">{selected ? selected.name || selected.slug : placeholder}</span>
          <Icon name="chevron-down" className={cn('h-4 w-4 opacity-50 shrink-0', open && 'rotate-180')} />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" side="bottom" sideOffset={8} aria-label="Tool options" className={cn('p-0 rounded-lg shadow-frosted-lg text-sm leading-6 w-[min(520px,calc(100vw-40px))]')}>
        <div className="border-b border-border/40 p-2">
          <div className="relative">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4 pointer-events-none" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tools…" className="h-9 pl-10" autoFocus />
          </div>
        </div>

        <div className="p-2 max-h-64 overflow-y-auto custom-scrollbar">
          {tools.length === 0 ? (
            <div className="text-center py-4 text-sm text-muted-foreground">No tools available</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-4 text-sm text-muted-foreground">No tools match your search</div>
          ) : (
            <>
              {filtered.map(tool => (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => {
                    onValueChange(tool.slug)
                    setOpen(false)
                  }}
                  className={cn(
                    // Match conversation AgentSelector item styling
                    'w-full text-left px-3 py-2 rounded-lg transition-colors focus-visible-ring',
                    value === tool.slug ? 'text-primary bg-primary/10 border-transparent' : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-primary/5 hover:shadow-sm'
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 ring-1 ring-border/40 flex-shrink-0">
                      <Icon name="wrench" className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex flex-col">
                      <div className="font-medium leading-5 text-foreground truncate">{tool.name || tool.slug}</div>
                      <div className="mt-0.5 text-xs leading-4 text-muted-foreground line-clamp-1">{tool.description || 'No description'}</div>
                    </div>
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function StarshipToolsDefaultsSection({ starshipId, canEdit }: Props) {
  const queryClient = useQueryClient()
  const [toolToAdd, setToolToAdd] = useState<string>('')

  const { data: starshipTools = [], isLoading: toolsLoading } = useQuery({
    queryKey: ['starship-tools', starshipId] as const,
    queryFn: async (): Promise<ToolModel[]> => {
      if (!starshipId) return []
      const res: FetchResponse<ApiResponse<ToolModel[]>> = await api.get(`/api/v1/starships/${starshipId}/tools`)
      return res.data.data || []
    },
    enabled: Boolean(starshipId),
    staleTime: 30 * 1000,
  })

  const { data: permissionRows = [], isLoading: permsLoading } = useStarshipToolPermissions(starshipId, Boolean(starshipId))

  const permBySlug = useMemo(() => {
    const map = new Map<string, ToolPermission>()
    for (const row of permissionRows) {
      if (row?.toolSlug) map.set(row.toolSlug, row.permission)
    }
    return map
  }, [permissionRows])

  const toolBySlug = useMemo(() => {
    const map = new Map<string, ToolModel>()
    for (const t of starshipTools) {
      if (t?.slug) map.set(t.slug, t)
    }
    return map
  }, [starshipTools])

  // IMPORTANT: Only show tools that are assigned at the starship level
  // (i.e. present in starship_tools via permissionRows).
  const assignedRows = useMemo(() => {
    const list = Array.isArray(permissionRows) ? permissionRows : []
    // Stable + user-friendly ordering: tool name/slug, fallback to slug.
    return list.slice().sort((a, b) => {
      const at = a.toolSlug ? toolBySlug.get(a.toolSlug) : undefined
      const bt = b.toolSlug ? toolBySlug.get(b.toolSlug) : undefined
      const ak = (at?.name || a.toolSlug || '').toLowerCase()
      const bk = (bt?.name || b.toolSlug || '').toLowerCase()
      return ak.localeCompare(bk)
    })
  }, [permissionRows, toolBySlug])

  const addableTools = useMemo(() => {
    const already = new Set(permissionRows.map(r => r.toolSlug).filter(Boolean))
    return starshipTools.filter(t => t?.slug && !already.has(t.slug)).sort((a, b) => (a.name || a.slug || '').localeCompare(b.name || b.slug || ''))
  }, [permissionRows, starshipTools])

  const upsertPermission = useMutation({
    mutationFn: async (args: { toolSlug: string; permission: ToolPermission }) => {
      const res: FetchResponse<ApiResponse<{ ok: true }>> = await api.put(`/api/v1/starships/${starshipId}/starship-tool-permissions`, {
        permissions: [{ toolSlug: args.toolSlug, permission: args.permission }],
      })
      return res.data.data
    },
    onMutate: async ({ toolSlug, permission }) => {
      await queryClient.cancelQueries({ queryKey: STARSHIP_TOOL_PERMISSION_QUERY_KEYS.byStarship(starshipId) })
      const prev = queryClient.getQueryData<StarshipToolPermissionRow[]>(STARSHIP_TOOL_PERMISSION_QUERY_KEYS.byStarship(starshipId))

      queryClient.setQueryData<StarshipToolPermissionRow[]>(STARSHIP_TOOL_PERMISSION_QUERY_KEYS.byStarship(starshipId), old => {
        const next = Array.isArray(old) ? [...old] : []
        const idx = next.findIndex(r => r.toolSlug === toolSlug)
        if (idx >= 0) {
          next[idx] = { ...next[idx], permission }
          return next
        }
        // Insert a minimal row (toolId may not be known client-side; server will resolve actual mapping)
        return [...next, { starshipId, toolId: '', toolSlug, permission }]
      })

      return { prev }
    },
    onError: (err: any, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(STARSHIP_TOOL_PERMISSION_QUERY_KEYS.byStarship(starshipId), ctx.prev)
      const msg = err?.response?.data?.error?.message || err?.message || 'Failed to update starship tool permission'
      toast.error('Update failed', { description: msg })
    },
    onSuccess: () => {
      toast.success('Updated starship tool permission')
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: STARSHIP_TOOL_PERMISSION_QUERY_KEYS.byStarship(starshipId) })
    },
  })

  const removePermission = useMutation({
    mutationFn: async (toolSlug: string) => {
      const res: FetchResponse<ApiResponse<{ ok: true }>> = await api.delete(`/api/v1/starships/${starshipId}/starship-tool-permissions/${encodeURIComponent(toolSlug)}`)
      return res.data.data
    },
    onMutate: async toolSlug => {
      await queryClient.cancelQueries({ queryKey: STARSHIP_TOOL_PERMISSION_QUERY_KEYS.byStarship(starshipId) })
      const prev = queryClient.getQueryData<StarshipToolPermissionRow[]>(STARSHIP_TOOL_PERMISSION_QUERY_KEYS.byStarship(starshipId))
      queryClient.setQueryData<StarshipToolPermissionRow[]>(STARSHIP_TOOL_PERMISSION_QUERY_KEYS.byStarship(starshipId), old => (Array.isArray(old) ? old : []).filter(r => r.toolSlug !== toolSlug))
      return { prev }
    },
    onError: (err: any, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(STARSHIP_TOOL_PERMISSION_QUERY_KEYS.byStarship(starshipId), ctx.prev)
      const msg = err?.response?.data?.error?.message || err?.message || 'Failed to remove starship tool permission'
      toast.error('Update failed', { description: msg })
    },
    onSuccess: () => {
      toast.success('Removed starship tool permission')
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: STARSHIP_TOOL_PERMISSION_QUERY_KEYS.byStarship(starshipId) })
    },
  })

  const isBusy = upsertPermission.isPending || removePermission.isPending
  const loading = toolsLoading || permsLoading

  return (
    <Card className={PROFILE_SECTION_CARD_CLASS}>
      <CardHeader className="pb-4">
        <CardTitle className="text-base flex items-center gap-2">
          <Icon name="wrench" className="h-4 w-4 text-primary" />
          Starship-level tools
        </CardTitle>
        <CardDescription className="text-sm">
          Set default tool permissions that apply to <span className="font-medium">all agents</span> in this starship. Agent-specific permissions can still override these defaults.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {canEdit ? (
          <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-medium text-muted-foreground">Add tool</div>
                <span className="text-[11px] text-muted-foreground">
                  Assigned with: <span className="font-medium">Ask</span>
                </span>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="flex-1 min-w-0">
                  <ToolDropdown
                    value={toolToAdd}
                    onValueChange={setToolToAdd}
                    tools={addableTools}
                    disabled={isBusy || addableTools.length === 0}
                    placeholder={addableTools.length === 0 ? 'No available tools' : 'Select a tool…'}
                  />
                </div>

                <Button
                  type="button"
                  className="h-10"
                  disabled={!toolToAdd || isBusy}
                  onClick={async () => {
                    if (!toolToAdd) return
                    await upsertPermission.mutateAsync({ toolSlug: toolToAdd, permission: 'ask' })
                    setToolToAdd('')
                  }}
                >
                  Add
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading tools…</p>
        ) : permissionRows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 bg-muted/10 p-4 text-sm text-muted-foreground">No starship-level tools assigned yet.</div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {assignedRows.map(row => {
              const tool = row.toolSlug ? toolBySlug.get(row.toolSlug) : undefined
              const toolSlug = row.toolSlug || tool?.slug || ''
              const current = toolSlug ? permBySlug.get(toolSlug) : undefined
              const currentUi: PermissionUIValue = current ?? 'unset'
              const disabled = !canEdit || isBusy || !toolSlug
              const toolSecondary = (tool?.description || '').trim() || toolSlug

              const options: Array<{ value: PermissionUIValue; label: string; description: string; icon: string }> = [
                { value: 'unset', label: PERMISSION_LABEL.unset, description: permissionDescription('unset'), icon: permissionIconName('unset') },
                { value: 'allow', label: PERMISSION_LABEL.allow, description: permissionDescription('allow'), icon: permissionIconName('allow') },
                { value: 'ask', label: PERMISSION_LABEL.ask, description: permissionDescription('ask'), icon: permissionIconName('ask') },
                { value: 'deny', label: PERMISSION_LABEL.deny, description: permissionDescription('deny'), icon: permissionIconName('deny') },
              ]

              return (
                <div key={row.toolId || row.toolSlug} className="group relative rounded-xl border border-border/50 bg-gradient-to-br from-background/50 to-background/30 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="mt-1.5 flex-shrink-0">
                        <div className={cn('h-2 w-2 rounded-full', permissionDotClassName(currentUi))} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold leading-5 text-foreground truncate">{tool?.name || toolSlug || 'Unknown tool'}</div>
                        <div className={cn('mt-1.5 text-xs leading-relaxed text-muted-foreground line-clamp-2', !tool?.description ? 'font-mono' : undefined)}>{toolSecondary}</div>
                      </div>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <span className={cn('inline-flex', disabled && 'cursor-not-allowed')}>
                          <button type="button" disabled={disabled} className={cn('inline-flex items-center', disabled && 'opacity-70')}>
                            <Badge variant="outline" className={cn('whitespace-nowrap border', permissionBadgeClassName(currentUi))}>
                              <span className="inline-flex items-center gap-1.5">
                                <Icon name={permissionIconName(currentUi)} className="h-3.5 w-3.5" />
                                <span>{PERMISSION_LABEL[currentUi]}</span>
                                <Icon name="chevron-down" className="h-3.5 w-3.5 opacity-70" />
                              </span>
                            </Badge>
                          </button>
                        </span>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-64">
                        {options.map(opt => (
                          <DropdownMenuItem
                            key={opt.value}
                            className={cn('cursor-pointer', permissionMenuItemClassName(opt.value), opt.value === currentUi && permissionMenuItemSelectedClassName(opt.value))}
                            onClick={() => {
                              if (disabled) return
                              if (opt.value === 'unset') {
                                removePermission.mutate(toolSlug)
                                return
                              }
                              upsertPermission.mutate({ toolSlug, permission: opt.value })
                            }}
                          >
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-2">
                                <Icon name={opt.icon} className={cn('h-4 w-4', permissionMenuIconClassName(opt.value))} />
                                <span className="text-sm font-medium">{opt.label}</span>
                                <span className="ml-auto" />
                              </div>
                              <div className="text-xs text-muted-foreground">{opt.description}</div>
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
        )}

        {!canEdit ? <div className="rounded-lg border border-border/60 bg-muted/10 p-3 text-xs text-muted-foreground">You don’t have permission to change starship-level tool defaults.</div> : null}
      </CardContent>
    </Card>
  )
}
