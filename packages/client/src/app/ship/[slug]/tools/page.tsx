'use client'

import Icon from '@/components/primitives/Icon'

import React, { useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { PageLayout } from '@/components/layout/PageLayout'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import type { ApiResponse } from '@starships/protocol'
import type { FetchResponse } from '@/lib/types'
import type { ToolModel } from '@starships/protocol'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { JsonImportExportButtons } from '@/components/importExport/JsonImportExportButtons'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'

export default function StarshipToolsPage(): React.JSX.Element {
  const router = useRouter()
  const { slug } = useParams<{ slug: string }>()
  const { data: starship } = useStarshipBySlug(slug, true)
  const starshipId = starship?.id || ''
  const [search, setSearch] = useState('')
  const queryClient = useQueryClient()
  const { isInstanceAdmin } = useAuth()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [toolToDelete, setToolToDelete] = useState<ToolModel | null>(null)

  const downloadJson = (filename: string, data: unknown) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const exportToolJson = async (tool: ToolModel) => {
    try {
      const resp: FetchResponse<ApiResponse<any>> = await api.get(`/api/v1/tools/${tool.id}/export`)
      const container = resp.data.data
      if (!container) throw new Error('Export failed: empty response')
      const base = tool.slug ? `tool-${tool.slug}` : `tool-${tool.id}`
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      downloadJson(`${base}__${stamp}.json`, container)
      toast.success('Exported JSON')
    } catch (e: any) {
      toast.error('Export failed', { description: e?.message || 'Unknown error' })
    }
  }

  const deleteToolMutation = useMutation({
    mutationFn: async (tool: ToolModel) => {
      const response: FetchResponse<ApiResponse<any>> = await api.delete(`/api/v1/tools/${tool.id}`)
      return response.data.data
    },
    onMutate: async tool => {
      await queryClient.cancelQueries({ queryKey: ['starship-tools', starshipId] as const })

      const prevTools = queryClient.getQueryData<ToolModel[]>(['starship-tools', starshipId] as const)

      queryClient.setQueryData<ToolModel[]>(['starship-tools', starshipId] as const, old => {
        const next = Array.isArray(old) ? old : []
        return next.filter(t => t.id !== tool.id)
      })

      return { prevTools }
    },
    onSuccess: (_data, tool) => {
      toast.success('Tool deleted successfully!', {
        description: `${tool.name} has been removed from the starship.`,
      })
    },
    onError: (error: any, _tool, ctx) => {
      if (ctx?.prevTools) queryClient.setQueryData(['starship-tools', starshipId] as const, ctx.prevTools)

      // Extract error message - handle both object and string formats (match agent delete pattern)
      let errorMessage = 'Failed to delete tool'
      if (error?.response?.data?.error) {
        const errorObj = error.response.data.error
        errorMessage = typeof errorObj === 'string' ? errorObj : errorObj?.message || 'Failed to delete tool'
      } else if (error?.message) {
        errorMessage = error.message
      }

      toast.error('Failed to delete tool', { description: errorMessage })
    },
    onSettled: async () => {
      setShowDeleteConfirm(false)
      setToolToDelete(null)
      await queryClient.invalidateQueries({ queryKey: ['starship-tools', starshipId] as const })
    },
  })

  const handleRequestDeleteTool = (tool: ToolModel) => {
    setToolToDelete(tool)
    setShowDeleteConfirm(true)
  }

  const handleCancelDeleteTool = () => {
    setShowDeleteConfirm(false)
    setToolToDelete(null)
  }

  const handleConfirmDeleteTool = async () => {
    if (!toolToDelete) return
    await deleteToolMutation.mutateAsync(toolToDelete)
  }

  const { data: starshipTools = [], isLoading: starshipToolsLoading } = useQuery({
    queryKey: ['starship-tools', starshipId] as const,
    queryFn: async (): Promise<ToolModel[]> => {
      if (!starshipId) return []
      const response: FetchResponse<ApiResponse<ToolModel[]>> = await api.get(`/api/v1/starships/${starshipId}/tools`)
      return response.data.data || []
    },
    enabled: !!starshipId,
    staleTime: 30 * 1000,
  })

  const filteredTools = useMemo(() => {
    const q = (search || '').trim().toLowerCase()
    if (!q) return starshipTools
    return starshipTools.filter(t => {
      const name = (t.name || '').toLowerCase()
      const slugv = (t.slug || '').toLowerCase()
      const desc = (t.description || '').toLowerCase()
      return name.includes(q) || slugv.includes(q) || desc.includes(q)
    })
  }, [starshipTools, search])

  return (
    <PageLayout>
      <div className="bg-background">
        <div className="flex flex-col items-center px-6 py-8">
          <div className="w-full max-w-6xl mx-auto space-y-8">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Icon name="magic-wand" className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold">Tools</h1>
              </div>
              <p className="text-muted-foreground mt-2">Installed tools available to your agents</p>
            </div>

            {isInstanceAdmin && starshipId && (
              <div className="flex items-center justify-center">
                <JsonImportExportButtons
                  kind="tool"
                  starshipId={starshipId}
                  onImported={result => {
                    if (result.kind === 'tool' && result.tool?.slug) {
                      router.push(`/ship/${slug}/tool/${encodeURIComponent(result.tool.slug)}`)
                    }
                  }}
                />
              </div>
            )}

            <section aria-labelledby="tools-list">
              {starshipToolsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : starshipTools.length === 0 ? (
                <div className="text-center py-10 bg-muted/5 border border-dashed border-muted rounded-lg">
                  <div className="w-16 h-16 bg-muted/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Icon name="magic-wand" className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <p className="text-base text-muted-foreground mb-3">No tools installed</p>
                  <p className="text-sm text-muted-foreground">Install tools from Explore to get started.</p>
                </div>
              ) : (
                <>
                  <div className="mb-8 sticky top-6 z-30">
                    <div className="relative max-w-md mb-6 mx-auto">
                      <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4 z-10 pointer-events-none" />
                      <Input
                        type="text"
                        placeholder="Search tools..."
                        value={search}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
                        className="pl-10 pr-3 w-full frosted-glass-card shadow-frosted-lg rounded-2xl border border-border/40 bg-transparent"
                      />
                    </div>
                  </div>

                  {filteredTools.length > 0 ? (
                    <div className="rounded-2xl border border-border/40 frosted-glass-card shadow-frosted-lg overflow-hidden">
                      <div className="divide-y divide-border/30">
                        {filteredTools.map(tool => (
                          <div key={tool.id} className="flex items-start justify-between gap-4 px-4 py-4">
                            <div className="min-w-0">
                              <button
                                type="button"
                                className="text-sm font-semibold text-foreground text-left hover:underline truncate"
                                onClick={() => router.push(`/ship/${slug}/tool/${tool.slug}`)}
                                title={`Open tool: ${tool.name}`}
                              >
                                {tool.name}
                              </button>
                              <div className="mt-1 text-xs font-mono text-muted-foreground truncate">{tool.slug}</div>
                              {tool.description ? <div className="mt-2 text-xs text-muted-foreground line-clamp-2">{tool.description}</div> : null}
                            </div>

                            {isInstanceAdmin ? (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button type="button" size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-full" title="Tool actions">
                                    <Icon name="dots-vertical" className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-40">
                                  <DropdownMenuItem
                                    onClick={() => {
                                      void exportToolJson(tool)
                                    }}
                                    className="flex items-center gap-2 cursor-pointer hover:bg-primary/10 focus:bg-primary/10"
                                  >
                                    <Icon name="download" className="w-4 h-4 text-muted-foreground" />
                                    <span>Export JSON</span>
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => {
                                      handleRequestDeleteTool(tool)
                                    }}
                                    className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive hover:bg-destructive/10 focus:bg-destructive/10"
                                  >
                                    <Icon name="trash" className="w-4 h-4" />
                                    <span>Delete tool</span>
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-10 bg-muted/5 border border-dashed border-muted rounded-lg">
                      <div className="w-16 h-16 bg-muted/20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Icon name="search" className="w-8 h-8 text-muted-foreground" />
                      </div>
                      <p className="text-base text-muted-foreground mb-3">No tools match your search</p>
                      <p className="text-sm text-muted-foreground">Try a different keyword.</p>
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog (mirrors agents page flow) */}
      <Dialog
        open={showDeleteConfirm}
        onOpenChange={open => {
          setShowDeleteConfirm(open)
          if (!open) setToolToDelete(null)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon name="alert-triangle" className="h-5 w-5 text-destructive" />
              Delete Tool
            </DialogTitle>
            <DialogDescription className="text-left">
              Are you sure you want to delete <strong>&ldquo;{toolToDelete?.name}&rdquo;</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={handleCancelDeleteTool}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDeleteTool} disabled={deleteToolMutation.isPending}>
              {deleteToolMutation.isPending ? (
                <>
                  <Icon name="loading" className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Icon name="trash" className="w-4 h-4 mr-2" />
                  Delete Tool
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  )
}
