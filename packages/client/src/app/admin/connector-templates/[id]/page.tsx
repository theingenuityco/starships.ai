'use client'

import Icon from '@/components/primitives/Icon'
import { PageLayout } from '@/components/layout/PageLayout'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/hooks/useAuth'
import {
  useAdminConnectorTemplate,
  useAdminConnectorTemplateAction,
  useAdminConnectorTemplateActions,
  useBulkReplaceAdminConnectorTemplateActions,
  useDeleteAdminConnectorTemplateAction,
  useMigrateAdminConnectorTemplateActionsFromLegacy,
  useUpdateAdminConnectorTemplate,
  useUpsertAdminConnectorTemplateAction,
} from '@/hooks/useAdminConnectorTemplates'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { ConnectorAuthTypeV2 } from '@starships/protocol'

function formatJson(value: unknown): string {
  if (value === undefined) return ''
  if (value === null) return 'null'
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return ''
  }
}

function parseOptionalJson(value: string): unknown | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return JSON.parse(trimmed)
}

export default function AdminConnectorTemplateDetailPage(): React.JSX.Element {
  const { isAuthenticated, isInstanceAdmin } = useAuth()
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = params?.id

  const { data: connector, isLoading, isError, error } = useAdminConnectorTemplate(id, isAuthenticated && isInstanceAdmin)
  const updateMutation = useUpdateAdminConnectorTemplate()
  const upsertActionMutation = useUpsertAdminConnectorTemplateAction()
  const deleteActionMutation = useDeleteAdminConnectorTemplateAction()
  const bulkReplaceMutation = useBulkReplaceAdminConnectorTemplateActions()
  const migrateLegacyMutation = useMigrateAdminConnectorTemplateActionsFromLegacy()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [authType, setAuthType] = useState<ConnectorAuthTypeV2>('oauth2')
  const [isEnabled, setIsEnabled] = useState(true)
  const [version, setVersion] = useState('')
  const [category, setCategory] = useState('')

  const [baseUrl, setBaseUrl] = useState('')
  const [authText, setAuthText] = useState('')
  const [endpointsText, setEndpointsText] = useState('')
  const [variablesText, setVariablesText] = useState('')
  const [rateLimitText, setRateLimitText] = useState('')
  const [metadataSchemaText, setMetadataSchemaText] = useState('')

  // Actions UI state
  const [actionsQuery, setActionsQuery] = useState('')
  const [selectedActionName, setSelectedActionName] = useState<string | null>(null)
  const [selectedActionText, setSelectedActionText] = useState('')
  const [bulkEndpointsText, setBulkEndpointsText] = useState('')
  const [showBulkReplace, setShowBulkReplace] = useState(false)

  const { data: actionsResp } = useAdminConnectorTemplateActions(id, { q: actionsQuery, limit: 50, offset: 0 }, isAuthenticated && isInstanceAdmin)
  const { data: selectedAction } = useAdminConnectorTemplateAction(
    id,
    selectedActionName,
    isAuthenticated && isInstanceAdmin && !!selectedActionName
  )

  const provider = connector?.provider
  const slug = connector?.slug

  useEffect(() => {
    if (!connector) return
    setName(connector.name || '')
    setDescription(connector.description || '')
    setAuthType((connector.auth?.type as ConnectorAuthTypeV2 | undefined) || 'none')
    setIsEnabled(connector.isEnabled !== false)
    setVersion(connector.version || '')
    setCategory(connector.category || '')

    setBaseUrl(connector.baseUrl || '')
    setAuthText(formatJson(connector.auth || { type: 'none' }))
    setEndpointsText(formatJson((connector as any).endpoints || []))
    setVariablesText(formatJson(connector.variables || []))
    setRateLimitText(formatJson(connector.rateLimit || undefined))
    setMetadataSchemaText(formatJson(connector.metadataSchema || undefined))
  }, [connector])

  useEffect(() => {
    if (!selectedAction) return
    setSelectedActionText(formatJson(selectedAction))
  }, [selectedAction])

  const title = useMemo(() => (provider ? `Connector template: ${provider}` : 'Connector template'), [provider])

  if (!isAuthenticated) {
    return (
      <PageLayout title={title} description="Sign in to manage connector templates." showHeader>
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">You must be signed in to view this page.</p>
        </div>
      </PageLayout>
    )
  }

  if (!isInstanceAdmin) {
    return (
      <PageLayout title={title} description="Instance admin tools for managing connector templates." showHeader>
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
                <span className="text-muted-foreground">·</span>
                <Link href="/admin/llm-models" className="text-sm font-medium underline underline-offset-4">
                  LLM models
                </Link>
              </div>
              <p className="text-muted-foreground mt-3">Edit connector template configuration. Values are stored in `connector_templates`.</p>
            </div>

            <div className="flex items-center justify-between gap-3">
              <Button variant="outline" onClick={() => router.push('/admin/connector-templates')}>
                <Icon name="chevron-left" className="h-4 w-4 mr-1" />
                Back
              </Button>
              <Button
                onClick={async () => {
                  if (!id) return
                  try {
                    const auth = parseOptionalJson(authText) as any
                    const endpoints = parseOptionalJson(endpointsText) as any
                    const variables = parseOptionalJson(variablesText) as any
                    const rateLimit = parseOptionalJson(rateLimitText) as any
                    const metadataSchema = parseOptionalJson(metadataSchemaText) as any

                    if (auth !== undefined && (auth === null || typeof auth !== 'object' || Array.isArray(auth))) {
                      toast.error('auth must be a JSON object')
                      return
                    }
                    if (endpoints !== undefined && !Array.isArray(endpoints)) {
                      toast.error('endpoints must be a JSON array')
                      return
                    }
                    if (variables !== undefined && !Array.isArray(variables)) {
                      toast.error('variables must be a JSON array')
                      return
                    }
                    if (rateLimit !== undefined && (rateLimit === null || typeof rateLimit !== 'object' || Array.isArray(rateLimit))) {
                      toast.error('rateLimit must be a JSON object')
                      return
                    }
                    if (metadataSchema !== undefined && (metadataSchema === null || typeof metadataSchema !== 'object' || Array.isArray(metadataSchema))) {
                      toast.error('metadataSchema must be a JSON object')
                      return
                    }

                    await updateMutation.mutateAsync({
                      id,
                      updates: {
                        name,
                        description,
                        isEnabled,
                        version,
                        category,
                        baseUrl,
                        auth: auth === undefined ? undefined : (auth as any),
                        endpoints: endpoints === undefined ? undefined : (endpoints as any),
                        variables: variables === undefined ? undefined : (variables as any),
                        rateLimit: rateLimit === undefined ? undefined : (rateLimit as any),
                        metadataSchema: metadataSchema === undefined ? undefined : (metadataSchema as any),
                      },
                    })
                  } catch (e: any) {
                    toast.error('Invalid JSON', { description: e?.message || 'Please fix JSON fields.' })
                  }
                }}
                disabled={updateMutation.isPending || isLoading}
              >
                {updateMutation.isPending ? 'Saving…' : 'Save'}
              </Button>
            </div>

            <section className="space-y-6">
              {isLoading && (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <Icon name="loading" className="h-5 w-5 animate-spin mr-2" />
                  Loading…
                </div>
              )}

              {isError && !isLoading && <div className="flex items-center justify-center py-12 text-muted-foreground">{(error as any)?.message || 'Failed to load connector template.'}</div>}

              {!isLoading && !isError && connector && (
                <div className="grid gap-6">
                  <div className="rounded-lg border border-border/60 bg-background/70 p-5 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Provider</label>
                        <Input value={provider || ''} readOnly />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Slug</label>
                        <Input value={slug || ''} readOnly />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Name</label>
                        <Input value={name} onChange={e => setName(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Auth type</label>
                        <Select value={authType} onValueChange={v => setAuthType(v as ConnectorAuthTypeV2)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select auth type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="oauth2">oauth2</SelectItem>
                            <SelectItem value="api_key">api_key</SelectItem>
                            <SelectItem value="basic">basic</SelectItem>
                            <SelectItem value="platform_jwt">platform_jwt</SelectItem>
                            <SelectItem value="none">none</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Enabled</label>
                        <Select value={isEnabled ? 'enabled' : 'disabled'} onValueChange={v => setIsEnabled(v === 'enabled')}>
                          <SelectTrigger>
                            <SelectValue placeholder="Enabled" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="enabled">enabled</SelectItem>
                            <SelectItem value="disabled">disabled</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Version</label>
                        <Input value={version} onChange={e => setVersion(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Category</label>
                        <Input value={category} onChange={e => setCategory(e.target.value)} />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <label className="text-sm font-medium">Description</label>
                        <Textarea value={description} onChange={e => setDescription(e.target.value)} className="min-h-[110px]" />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border/60 bg-background/70 p-5 space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Base URL</label>
                      <Input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} spellCheck={false} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">auth (JSON)</label>
                      <Textarea value={authText} onChange={e => setAuthText(e.target.value)} className="min-h-[220px] font-mono text-xs" spellCheck={false} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">endpoints_json (legacy JSON array)</label>
                      <div className="text-xs text-muted-foreground">
                        This is the old storage location. Runtime does not use it; click “Migrate legacy → actions” below to populate the new table.
                      </div>
                      <Textarea value={endpointsText} onChange={e => setEndpointsText(e.target.value)} className="min-h-[220px] font-mono text-xs" spellCheck={false} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">variables (JSON array)</label>
                      <Textarea value={variablesText} onChange={e => setVariablesText(e.target.value)} className="min-h-[220px] font-mono text-xs" spellCheck={false} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">rateLimit (JSON)</label>
                      <Textarea value={rateLimitText} onChange={e => setRateLimitText(e.target.value)} className="min-h-[180px] font-mono text-xs" spellCheck={false} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">metadataSchema (JSON)</label>
                      <Textarea value={metadataSchemaText} onChange={e => setMetadataSchemaText(e.target.value)} className="min-h-[180px] font-mono text-xs" spellCheck={false} />
                    </div>
                  </div>

                  <div className="rounded-lg border border-border/60 bg-background/70 p-5 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium">Actions</div>
                        <div className="text-xs text-muted-foreground">Stored in `connector_template_actions`. Edit actions individually to avoid huge template payloads.</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          onClick={async () => {
                            if (!id) return
                            if (!confirm('Migrate legacy endpoints_json into the new actions table? This will REPLACE all existing actions.')) return
                            await migrateLegacyMutation.mutateAsync({ id })
                          }}
                          disabled={migrateLegacyMutation.isPending || !endpointsText.trim()}
                        >
                          {migrateLegacyMutation.isPending ? 'Migrating…' : 'Migrate legacy → actions'}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setShowBulkReplace(v => !v)}
                          disabled={bulkReplaceMutation.isPending}
                        >
                          {showBulkReplace ? 'Hide bulk replace' : 'Bulk replace'}
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Search</label>
                      <Input value={actionsQuery} onChange={e => setActionsQuery(e.target.value)} placeholder="Search by name, path, description" />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="rounded-md border border-border/60">
                        <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border/60">
                          {actionsResp?.actions?.length ? `${actionsResp.actions.length} actions` : 'No actions'}
                        </div>
                        <div className="max-h-[420px] overflow-auto divide-y divide-border/60">
                          {(actionsResp?.actions || []).map(a => (
                            <button
                              key={`${a.templateId}:${a.actionName}`}
                              className={`w-full text-left px-3 py-2 hover:bg-muted/40 ${
                                selectedActionName === a.actionName ? 'bg-muted/50' : ''
                              }`}
                              onClick={() => setSelectedActionName(a.actionName)}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="font-mono text-xs truncate">{a.actionName}</div>
                                <div className="text-[10px] text-muted-foreground shrink-0">{a.method}</div>
                              </div>
                              <div className="text-xs text-muted-foreground truncate font-mono mt-1">{a.path}</div>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium">Selected action {selectedActionName ? <span className="font-mono text-xs text-muted-foreground">{selectedActionName}</span> : null}</label>
                        <Textarea
                          value={selectedActionText}
                          onChange={e => setSelectedActionText(e.target.value)}
                          className="min-h-[420px] font-mono text-xs"
                          spellCheck={false}
                          placeholder="Select an action to edit, or paste a ConnectorEndpointV2 JSON object and set its name via the action route."
                        />
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            onClick={async () => {
                              if (!id || !selectedActionName) return
                              if (!confirm(`Delete action "${selectedActionName}"?`)) return
                              await deleteActionMutation.mutateAsync({ id, actionName: selectedActionName })
                              setSelectedActionName(null)
                              setSelectedActionText('')
                            }}
                            disabled={!selectedActionName || deleteActionMutation.isPending}
                          >
                            Delete
                          </Button>
                          <Button
                            onClick={async () => {
                              if (!id || !selectedActionName) return
                              try {
                                const parsed = parseOptionalJson(selectedActionText)
                                if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                                  toast.error('Action must be a JSON object')
                                  return
                                }
                                await upsertActionMutation.mutateAsync({
                                  id,
                                  actionName: selectedActionName,
                                  payload: { endpoint: parsed as any },
                                })
                              } catch (e: any) {
                                toast.error('Invalid JSON', { description: e?.message || 'Please fix action JSON.' })
                              }
                            }}
                            disabled={!selectedActionName || upsertActionMutation.isPending}
                          >
                            {upsertActionMutation.isPending ? 'Saving…' : 'Save action'}
                          </Button>
                        </div>
                      </div>
                    </div>

                    {showBulkReplace ? (
                      <div className="space-y-2 pt-2 border-t border-border/60">
                        <label className="text-sm font-medium">Bulk replace actions (JSON array of endpoints)</label>
                        <Textarea
                          value={bulkEndpointsText}
                          onChange={e => setBulkEndpointsText(e.target.value)}
                          className="min-h-[220px] font-mono text-xs"
                          spellCheck={false}
                          placeholder='[ { "name": "list-tools", "method": "GET", "path": "/tools" } ]'
                        />
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            onClick={() => setBulkEndpointsText('')}
                            disabled={bulkReplaceMutation.isPending}
                          >
                            Clear
                          </Button>
                          <Button
                            onClick={async () => {
                              if (!id) return
                              try {
                                const parsed = parseOptionalJson(bulkEndpointsText)
                                if (!Array.isArray(parsed)) {
                                  toast.error('Bulk replace payload must be a JSON array')
                                  return
                                }
                                await bulkReplaceMutation.mutateAsync({ id, payload: { endpoints: parsed as any } })
                              } catch (e: any) {
                                toast.error('Invalid JSON', { description: e?.message || 'Please fix JSON.' })
                              }
                            }}
                            disabled={bulkReplaceMutation.isPending || !bulkEndpointsText.trim()}
                          >
                            {bulkReplaceMutation.isPending ? 'Replacing…' : 'Replace all actions'}
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </PageLayout>
  )
}
