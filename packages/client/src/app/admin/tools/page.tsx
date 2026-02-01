'use client'

import Icon from '@/components/primitives/Icon'
import { PageLayout } from '@/components/layout/PageLayout'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
import { ADMIN_TOOLS_QUERY_KEYS, useAdminTools, type AdminToolRow } from '@/hooks/useAdminTools'
import { useUserStarships } from '@/hooks/useStarships'
import api from '@/lib/api'
import type { ApiResponse, ImportExportContainerV1, StarshipImportResponse } from '@starships/protocol'
import type { FetchResponse } from '@/lib/types'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import React, { useRef, useState } from 'react'
import { toast } from 'sonner'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ToolModel } from '@starships/protocol'

type DeleteTarget = { id: string; name: string; slug: string }

export default function AdminToolsPage(): React.JSX.Element {
  const router = useRouter()
  const { isAuthenticated, isInstanceAdmin, user } = useAuth()
  const queryClient = useQueryClient()
  const { data: tools = [], isLoading, isError, error } = useAdminTools(isAuthenticated && isInstanceAdmin)
  const { data: userStarships = [] } = useUserStarships(user?.id ?? '', isAuthenticated && isInstanceAdmin)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [isExportingId, setIsExportingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [importStarshipId, setImportStarshipId] = useState<string>('')
  const [showImportModal, setShowImportModal] = useState(false)

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

  const handleOpenImportModal = () => {
    setImportStarshipId(userStarships[0]?.id ?? '')
    setShowImportModal(true)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleFileSelected = async (file: File | null) => {
    if (!file || !importStarshipId) return
    setIsImporting(true)
    try {
      const text = await file.text()
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        throw new Error('Invalid JSON file')
      }
      const resp: FetchResponse<ApiResponse<StarshipImportResponse>> = await api.post(
        `/api/v1/starships/${importStarshipId}/import`,
        parsed
      )
      const result = resp.data.data
      if (!result) throw new Error('Import failed: empty response')
      await queryClient.invalidateQueries({ queryKey: ADMIN_TOOLS_QUERY_KEYS.all })
      setShowImportModal(false)
      if (Array.isArray(result.warnings) && result.warnings.length > 0) {
        toast.success('Imported with warnings', { description: result.warnings.join('\n') })
      } else {
        toast.success('Tool imported')
      }
      if (result.kind === 'tool' && result.tool?.slug) {
        const ship = userStarships.find(s => s.id === importStarshipId)
        if (ship?.slug) router.push(`/ship/${ship.slug}/tool/${encodeURIComponent(result.tool.slug)}`)
      }
    } catch (e: any) {
      toast.error('Import failed', { description: e?.message || 'Unknown error' })
    } finally {
      setIsImporting(false)
    }
  }

  const exportToolJson = async (tool: AdminToolRow) => {
    setIsExportingId(tool.id)
    try {
      const resp: FetchResponse<ApiResponse<ImportExportContainerV1>> = await api.get(`/api/v1/tools/${tool.id}/export`)
      const container = resp.data.data
      if (!container) throw new Error('Export failed: empty response')
      const base = tool.slug ? `tool-${tool.slug}` : `tool-${tool.id}`
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      downloadJson(`${base}__${stamp}.json`, container)
      toast.success('Exported JSON')
    } catch (e: any) {
      toast.error('Export failed', { description: e?.message || 'Unknown error' })
    } finally {
      setIsExportingId(null)
    }
  }

  const deleteMutation = useMutation({
    mutationFn: async (tool: ToolModel) => {
      const response: FetchResponse<ApiResponse<unknown>> = await api.delete(`/api/v1/tools/${tool.id}`)
      return response.data.data
    },
    onSuccess: (_data, tool) => {
      toast.success('Tool deleted', { description: `${tool.name} has been removed.` })
      void queryClient.invalidateQueries({ queryKey: ADMIN_TOOLS_QUERY_KEYS.all })
      setDeleteTarget(null)
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error?.message ?? err?.message ?? 'Failed to delete tool'
      toast.error('Delete failed', { description: msg })
    },
  })

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    await deleteMutation.mutateAsync(deleteTarget as ToolModel)
  }

  if (!isAuthenticated) {
    return (
      <PageLayout title="Manage Tools" description="Sign in to manage tools." showHeader>
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">You must be signed in to view this page.</p>
        </div>
      </PageLayout>
    )
  }

  if (!isInstanceAdmin) {
    return (
      <PageLayout title="Manage Tools" description="Instance admin tools for managing tools." showHeader>
        <div className="flex items-center justify-center h-full">
          <Card className="max-w-md w-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icon name="shield-alert" className="h-5 w-5 text-amber-500" />
                Instance admin access required
              </CardTitle>
              <CardDescription>Only instance admins can view and manage tools.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </PageLayout>
    )
  }

  return (
    <PageLayout>
      <div className="bg-background">
        <div className="flex flex-col items-center px-6 py-8">
          <div className="w-full max-w-6xl mx-auto space-y-8">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Icon name="shield-check" className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold">Admin</h1>
              </div>
              <div className="flex items-center justify-center gap-3 mt-2">
                <Link href="/admin/connector-templates" className="text-sm font-medium underline underline-offset-4">
                  Connector templates
                </Link>
                <span className="text-muted-foreground">·</span>
                <Link href="/admin/tools" className="text-sm font-medium underline underline-offset-4">
                  Tools
                </Link>
                <span className="text-muted-foreground">·</span>
                <Link href="/admin/agents/pending" className="text-sm font-medium underline underline-offset-4">
                  Agent approvals
                </Link>
                <span className="text-muted-foreground">·</span>
                <Link href="/admin/platform-secrets" className="text-sm font-medium underline underline-offset-4">
                  Platform secrets
                </Link>
                <span className="text-muted-foreground">·</span>
                <Link href="/admin/llm-models" className="text-sm font-medium underline underline-offset-4">
                  LLM models
                </Link>
              </div>
              <p className="text-muted-foreground mt-3">Manage tools (import/export) for this instance.</p>
            </div>

            <section className="space-y-4">
              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="outline" onClick={handleOpenImportModal} disabled={isImporting || userStarships.length === 0}>
                  <Icon name="upload" className="h-4 w-4 mr-1" />
                  {isImporting ? 'Importing…' : 'Import JSON'}
                </Button>
              </div>
              <div className="w-full rounded-md border overflow-visible">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="border-b px-4 py-3 text-left text-sm font-medium whitespace-nowrap">Name</th>
                      <th className="border-b px-4 py-3 text-left text-sm font-medium whitespace-nowrap">Slug</th>
                      <th className="border-b px-4 py-3 text-left text-sm font-medium whitespace-nowrap">Starship</th>
                      <th className="border-b px-4 py-3 text-left text-sm font-medium whitespace-nowrap">Updated</th>
                      <th className="border-b px-4 py-3 text-right text-sm font-medium whitespace-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading && (
                      <tr>
                        <td className="px-4 py-6 text-sm text-muted-foreground" colSpan={5}>
                          Loading…
                        </td>
                      </tr>
                    )}
                    {isError && !isLoading && (
                      <tr>
                        <td className="px-4 py-6 text-sm text-muted-foreground" colSpan={5}>
                          {(error as Error)?.message ?? 'Failed to load tools.'}
                        </td>
                      </tr>
                    )}
                    {!isLoading && !isError && tools.length === 0 && (
                      <tr>
                        <td className="px-4 py-6 text-sm text-muted-foreground" colSpan={5}>
                          No tools found.
                        </td>
                      </tr>
                    )}
                    {!isLoading &&
                      !isError &&
                      tools.map(tool => {
                        const starshipLabel = tool.starship?.name ?? tool.starship?.slug ?? tool.starshipId
                        const starshipSlug = tool.starship?.slug
                        return (
                          <tr
                            key={tool.id}
                            className="border-b last:border-0 transition-colors hover:bg-muted/30"
                          >
                            <td className="px-4 py-3 text-sm font-medium">{tool.name}</td>
                            <td className="px-4 py-3 text-sm font-mono text-muted-foreground">{tool.slug}</td>
                            <td className="px-4 py-3 text-sm">
                              {starshipSlug ? (
                                <Link href={`/ship/${starshipSlug}/tools`} className="text-primary hover:underline">
                                  {starshipLabel}
                                </Link>
                              ) : (
                                starshipLabel
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">{new Date(tool.updatedAt).toLocaleString()}</td>
                            <td className="px-4 py-3 text-sm text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 w-8 p-0"
                                    disabled={isExportingId === tool.id}
                                    title="Tool actions"
                                  >
                                    <Icon name="dots-vertical" className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-44">
                                  <DropdownMenuItem
                                    onClick={() => exportToolJson(tool)}
                                    className="flex items-center gap-2 cursor-pointer"
                                  >
                                    <Icon name="download" className="h-4 w-4 text-muted-foreground" />
                                    {isExportingId === tool.id ? 'Exporting…' : 'Export JSON'}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => setDeleteTarget({ id: tool.id, name: tool.name, slug: tool.slug ?? '' })}
                                    className="flex items-center gap-2 cursor-pointer text-destructive"
                                  >
                                    <Icon name="trash" className="h-4 w-4" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* Import modal: select starship + file */}
      <Dialog open={showImportModal} onOpenChange={setShowImportModal}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Import Tool JSON</DialogTitle>
            <DialogDescription>Select the starship to add the tool to, then choose a JSON file exported from this instance.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Starship</label>
              <Select value={importStarshipId} onValueChange={setImportStarshipId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select starship" />
                </SelectTrigger>
                <SelectContent>
                  {userStarships.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name ?? s.slug}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">JSON file</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                className="w-full text-sm text-muted-foreground file:mr-2 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-primary-foreground"
                onChange={e => void handleFileSelected(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImportModal(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Icon name="trash" className="h-4 w-4" />
              Delete tool
            </DialogTitle>
            <DialogDescription>This action cannot be undone. The tool will be removed from its starship.</DialogDescription>
          </DialogHeader>
          {deleteTarget && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm space-y-2">
              <div className="font-medium">{deleteTarget.name}</div>
              <p className="text-muted-foreground font-mono">{deleteTarget.slug}</p>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleteMutation.isPending}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={handleConfirmDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? 'Deleting…' : 'Delete tool'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  )
}
