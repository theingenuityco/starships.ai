'use client'

import Icon from '@/components/primitives/Icon'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import api from '@/lib/api'
import type { FetchResponse } from '@/lib/types'
import type { ApiResponse, ToolModel } from '@starships/protocol'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import React, { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  STARSHIP_TOOL_PERMISSION_QUERY_KEYS,
  type StarshipToolPermissionRow,
  type ToolPermission,
  useStarshipToolPermissions,
} from '@/hooks/useStarshipToolPermissions'

type Props = {
  starshipId: string
  canEdit: boolean
}

type PermissionUIValue = ToolPermission | 'unset'

const PERMISSION_LABEL: Record<PermissionUIValue, string> = {
  unset: 'Not set',
  allow: 'Allow',
  ask: 'Ask',
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

export function StarshipToolsDefaultsSection({ starshipId, canEdit }: Props) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [toolToAdd, setToolToAdd] = useState<string>('')
  const [permissionToAdd, setPermissionToAdd] = useState<ToolPermission>('ask')

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
  const filteredAssigned = useMemo(() => {
    const q = (search || '').trim().toLowerCase()
    const list = Array.isArray(permissionRows) ? permissionRows : []
    if (!q) return list
    return list.filter(r => {
      const slug = (r.toolSlug || '').toLowerCase()
      const tool = r.toolSlug ? toolBySlug.get(r.toolSlug) : undefined
      const name = (tool?.name || '').toLowerCase()
      const desc = (tool?.description || '').toLowerCase()
      return slug.includes(q) || name.includes(q) || desc.includes(q)
    })
  }, [permissionRows, search, toolBySlug])

  const addableTools = useMemo(() => {
    const already = new Set(permissionRows.map(r => r.toolSlug).filter(Boolean))
    return starshipTools
      .filter(t => t?.slug && !already.has(t.slug))
      .sort((a, b) => (a.name || a.slug || '').localeCompare(b.name || b.slug || ''))
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
      const res: FetchResponse<ApiResponse<{ ok: true }>> = await api.delete(
        `/api/v1/starships/${starshipId}/starship-tool-permissions/${encodeURIComponent(toolSlug)}`
      )
      return res.data.data
    },
    onMutate: async toolSlug => {
      await queryClient.cancelQueries({ queryKey: STARSHIP_TOOL_PERMISSION_QUERY_KEYS.byStarship(starshipId) })
      const prev = queryClient.getQueryData<StarshipToolPermissionRow[]>(STARSHIP_TOOL_PERMISSION_QUERY_KEYS.byStarship(starshipId))
      queryClient.setQueryData<StarshipToolPermissionRow[]>(STARSHIP_TOOL_PERMISSION_QUERY_KEYS.byStarship(starshipId), old =>
        (Array.isArray(old) ? old : []).filter(r => r.toolSlug !== toolSlug)
      )
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
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base flex items-center gap-2">
          <Icon name="wrench" className="h-4 w-4 text-primary" />
          Starship-level tools
        </CardTitle>
        <CardDescription className="text-sm">
          Set default tool permissions that apply to <span className="font-medium">all agents</span> in this starship. Agent-specific permissions can still override these
          defaults.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {canEdit ? (
          <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div className="grid w-full grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">Add tool</div>
                  <Select value={toolToAdd} onValueChange={v => setToolToAdd(v)} disabled={isBusy || addableTools.length === 0}>
                    <SelectTrigger>
                      <SelectValue placeholder={addableTools.length === 0 ? 'No available tools' : 'Select a tool…'} />
                    </SelectTrigger>
                    <SelectContent>
                      {addableTools.map(t => (
                        <SelectItem key={t.id} value={t.slug}>
                          {t.name || t.slug}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">Default permission</div>
                  <Select value={permissionToAdd} onValueChange={v => setPermissionToAdd(v as ToolPermission)} disabled={isBusy}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="allow">{PERMISSION_LABEL.allow}</SelectItem>
                      <SelectItem value="ask">{PERMISSION_LABEL.ask}</SelectItem>
                      <SelectItem value="deny">{PERMISSION_LABEL.deny}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={!toolToAdd || isBusy}
                  onClick={async () => {
                    if (!toolToAdd) return
                    await upsertPermission.mutateAsync({ toolSlug: toolToAdd, permission: permissionToAdd })
                    setToolToAdd('')
                    setPermissionToAdd('ask')
                  }}
                >
                  Add
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-md">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4 pointer-events-none" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tools…" className="pl-10" />
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!starshipId || isBusy}
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ['starship-tools', starshipId] as const })
              queryClient.invalidateQueries({ queryKey: STARSHIP_TOOL_PERMISSION_QUERY_KEYS.byStarship(starshipId) })
            }}
          >
            Refresh
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading tools…</p>
        ) : permissionRows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 bg-muted/10 p-4 text-sm text-muted-foreground">
            No starship-level tools assigned yet.
          </div>
        ) : (
          <div className="rounded-xl border border-border/60 overflow-hidden">
            <div className="divide-y divide-border/40">
              {filteredAssigned.map(row => {
                const tool = row.toolSlug ? toolBySlug.get(row.toolSlug) : undefined
                const toolSlug = row.toolSlug || tool?.slug || ''
                const current = toolSlug ? permBySlug.get(toolSlug) : undefined
                const currentUi: PermissionUIValue = current ?? 'unset'
                return (
                  <div key={row.toolId || row.toolSlug} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-semibold truncate">{tool?.name || toolSlug || 'Unknown tool'}</div>
                        <PermissionBadge value={currentUi} />
                      </div>
                      <div className="mt-1 text-xs font-mono text-muted-foreground truncate">{toolSlug}</div>
                      {tool?.description ? <div className="mt-2 text-xs text-muted-foreground line-clamp-2">{tool.description}</div> : null}
                    </div>

                    <div className="flex items-center gap-2 sm:justify-end">
                      <Select
                        value={currentUi}
                        onValueChange={async v => {
                          if (!toolSlug) return
                          if (!canEdit) return
                          if (v === 'unset') {
                            await removePermission.mutateAsync(toolSlug)
                            return
                          }
                          await upsertPermission.mutateAsync({ toolSlug, permission: v })
                        }}
                        disabled={!canEdit || isBusy || !toolSlug}
                      >
                        <SelectTrigger className="w-[150px]">
                          <SelectValue placeholder="Not set" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unset">{PERMISSION_LABEL.unset}</SelectItem>
                          <SelectItem value="allow">{PERMISSION_LABEL.allow}</SelectItem>
                          <SelectItem value="ask">{PERMISSION_LABEL.ask}</SelectItem>
                          <SelectItem value="deny">{PERMISSION_LABEL.deny}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )
              })}

              {filteredAssigned.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">No tools match your search.</div>
              ) : null}
            </div>
          </div>
        )}

        {!canEdit ? (
          <div className="rounded-lg border border-border/60 bg-muted/10 p-3 text-xs text-muted-foreground">
            You don’t have permission to change starship-level tool defaults.
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

