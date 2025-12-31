'use client'

import Icon from '@/components/primitives/Icon'
import { PageLayout } from '@/components/layout/PageLayout'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useAuth } from '@/hooks/useAuth'
import { ADMIN_CONNECTOR_TEMPLATES_QUERY_KEYS, useAdminConnectorTemplates, useUpdateAdminConnectorTemplate } from '@/hooks/useAdminConnectorTemplates'
import api from '@/lib/api'
import type { ApiResponse, AdminConnectorTemplateImportResponse, ImportExportContainerV1 } from '@starships/protocol'
import type { FetchResponse } from '@/lib/types'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import React, { useRef, useState } from 'react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

export default function AdminConnectorTemplatesPage(): React.JSX.Element {
  const router = useRouter()
  const { isAuthenticated, isInstanceAdmin } = useAuth()
  const queryClient = useQueryClient()
  const { data: connectors = [], isLoading, isError, error } = useAdminConnectorTemplates(isAuthenticated && isInstanceAdmin)
  const updateMutation = useUpdateAdminConnectorTemplate()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [isExportingId, setIsExportingId] = useState<string | null>(null)

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

  const handlePickFile = () => {
    if (!fileInputRef.current) return
    fileInputRef.current.value = ''
    fileInputRef.current.click()
  }

  const handleFileSelected = async (file: File | null) => {
    if (!file) return
    setIsImporting(true)
    try {
      const text = await file.text()
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        throw new Error('Invalid JSON file')
      }

      const resp: FetchResponse<ApiResponse<AdminConnectorTemplateImportResponse>> = await api.post('/api/v1/admin/connector-templates/import', parsed)
      const result = resp.data.data
      if (!result?.connector) throw new Error('Import failed: empty response')

      await queryClient.invalidateQueries({ queryKey: ADMIN_CONNECTOR_TEMPLATES_QUERY_KEYS.all })

      const action = result.created ? 'Created' : 'Updated'
      const provider = result.connector.provider
      if (Array.isArray(result.warnings) && result.warnings.length > 0) {
        toast.success(`${action} ${provider}`, { description: result.warnings.join('\n') })
      } else {
        toast.success(`${action} ${provider}`)
      }
    } catch (e: any) {
      toast.error('Import failed', { description: e?.message || 'Unknown error' })
    } finally {
      setIsImporting(false)
    }
  }

  const exportConnectorTemplateJson = async (id: string, provider?: string) => {
    setIsExportingId(id)
    try {
      const resp: FetchResponse<ApiResponse<ImportExportContainerV1>> = await api.get(`/api/v1/admin/connector-templates/${id}/export`)
      const container = resp.data.data
      if (!container) throw new Error('Export failed: empty response')

      const base = provider ? `connector-template-${provider}` : `connector-template-${id}`
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      downloadJson(`${base}__${stamp}.json`, container)
      toast.success('Exported JSON')
    } catch (e: any) {
      toast.error('Export failed', { description: e?.message || 'Unknown error' })
    } finally {
      setIsExportingId(null)
    }
  }

  if (!isAuthenticated) {
    return (
      <PageLayout title="Connector templates" description="Sign in to manage connector templates." showHeader>
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">You must be signed in to view this page.</p>
        </div>
      </PageLayout>
    )
  }

  if (!isInstanceAdmin) {
    return (
      <PageLayout title="Connector templates" description="Instance admin tools for managing connector templates." showHeader>
        <div className="flex items-center justify-center h-full">
          <Card className="max-w-md w-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icon name="shield-alert" className="h-5 w-5 text-amber-500" />
                Instance admin access required
              </CardTitle>
              <CardDescription>Only instance admins can view and manage connector templates.</CardDescription>
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
                <Link href="/admin/agents/pending" className="text-sm font-medium underline underline-offset-4">
                  Agent approvals
                </Link>
                <span className="text-muted-foreground">·</span>
                <Link href="/admin/platform-secrets" className="text-sm font-medium underline underline-offset-4">
                  Platform secrets
                </Link>
              </div>
              <p className="text-muted-foreground mt-3">Manage connector templates (enabled/disabled, runtime fields like auth/baseUrl/endpoints) for this instance.</p>
            </div>

            <section className="space-y-4">
              <div className="flex items-center justify-end gap-2">
                <input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={e => void handleFileSelected(e.target.files?.[0] ?? null)} />
                <Button type="button" variant="outline" onClick={handlePickFile} disabled={isImporting}>
                  <Icon name="upload" className="h-4 w-4 mr-1" />
                  {isImporting ? 'Importing…' : 'Import JSON'}
                </Button>
                <Button onClick={() => router.push('/admin/connector-templates/new')}>
                  <Icon name="plus" className="h-4 w-4 mr-1" />
                  New connector template
                </Button>
              </div>
              <div className="w-full rounded-md border overflow-visible">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="border-b px-4 py-3 text-left text-sm font-medium whitespace-nowrap">Provider</th>
                      <th className="border-b px-4 py-3 text-left text-sm font-medium whitespace-nowrap">Name</th>
                      <th className="border-b px-4 py-3 text-left text-sm font-medium whitespace-nowrap">Auth type</th>
                      <th className="border-b px-4 py-3 text-left text-sm font-medium whitespace-nowrap">Enabled</th>
                      <th className="border-b px-4 py-3 text-left text-sm font-medium whitespace-nowrap">Version</th>
                      <th className="border-b px-4 py-3 text-left text-sm font-medium whitespace-nowrap">Updated</th>
                      <th className="border-b px-4 py-3 text-right text-sm font-medium whitespace-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading && (
                      <tr>
                        <td className="px-4 py-6 text-sm text-muted-foreground" colSpan={7}>
                          Loading…
                        </td>
                      </tr>
                    )}
                    {isError && !isLoading && (
                      <tr>
                        <td className="px-4 py-6 text-sm text-muted-foreground" colSpan={7}>
                          {(error as any)?.message || 'Failed to load connector templates.'}
                        </td>
                      </tr>
                    )}
                    {!isLoading && !isError && connectors.length === 0 && (
                      <tr>
                        <td className="px-4 py-6 text-sm text-muted-foreground" colSpan={7}>
                          No connector templates found.
                        </td>
                      </tr>
                    )}
                    {!isLoading &&
                      !isError &&
                      connectors.map(c => (
                        <tr key={c.id} className="border-b last:border-0 transition-colors hover:bg-muted/30 cursor-pointer" onClick={() => router.push(`/admin/connector-templates/${c.id}`)}>
                          <td className="px-4 py-3 text-sm font-mono">{c.provider}</td>
                          <td className="px-4 py-3 text-sm">{c.name}</td>
                          <td className="px-4 py-3 text-sm font-mono">{c.auth?.type}</td>
                          <td className="px-4 py-3 text-sm">
                            <div
                              className="inline-flex items-center gap-2"
                              onClick={e => {
                                // Prevent row navigation when toggling.
                                e.stopPropagation()
                              }}
                            >
                              <Switch
                                size="sm"
                                checked={c.isEnabled}
                                disabled={updateMutation.isPending}
                                onCheckedChange={async checked => {
                                  await updateMutation.mutateAsync({
                                    id: c.id,
                                    updates: { isEnabled: checked },
                                  })
                                }}
                              />
                              <span className="text-xs font-mono text-muted-foreground">{c.isEnabled ? 'enabled' : 'disabled'}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm font-mono">{c.version}</td>
                          <td className="px-4 py-3 text-sm">{new Date(c.updatedAt).toLocaleString()}</td>
                          <td className="px-4 py-3 text-sm text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0"
                                  disabled={isExportingId === c.id}
                                  onClick={e => e.stopPropagation()}
                                  title="Connector template actions"
                                >
                                  <Icon name="dots-vertical" className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44" onClick={e => e.stopPropagation()}>
                                <DropdownMenuItem
                                  onClick={e => {
                                    e.stopPropagation()
                                    void exportConnectorTemplateJson(c.id, c.provider)
                                  }}
                                  className="flex items-center gap-2 cursor-pointer hover:bg-primary/10 focus:bg-primary/10"
                                >
                                  <Icon name="download" className="w-4 h-4 text-muted-foreground" />
                                  <span>{isExportingId === c.id ? 'Exporting…' : 'Export JSON'}</span>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      </div>
    </PageLayout>
  )
}
