'use client'

import Icon from '@/components/primitives/Icon'
import { PageLayout } from '@/components/layout/PageLayout'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/hooks/useAuth'
import {
  useAdminConnectorTemplate,
  useAdminConnectorTemplateAction,
  useAdminConnectorTemplateActions,
  useAdminConnectorTemplateLegacyEndpoints,
  useBulkReplaceAdminConnectorTemplateActions,
  useDeleteAdminConnectorTemplateAction,
  useUpdateAdminConnectorTemplate,
  useUpsertAdminConnectorTemplateAction,
} from '@/hooks/useAdminConnectorTemplates'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { ConnectorAuthTypeV2, ConnectorAuthV2, ConnectorEndpointV2, HttpMethod, RequestStyle } from '@starships/protocol'

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

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function defaultAuthForType(authType: ConnectorAuthTypeV2): ConnectorAuthV2 {
  if (authType === 'oauth2') {
    return {
      type: 'oauth2',
      clientIdRef: { type: 'platform_secret', key: 'OAUTH_CLIENT_ID' },
      clientSecretRef: { type: 'platform_secret', key: 'OAUTH_CLIENT_SECRET' },
      authorizationUrl: 'https://example.com/oauth/authorize',
      tokenUrl: 'https://example.com/oauth/token',
      scopes: [],
      accessTokenRef: { type: 'connector_secret', key: 'ACCESS_TOKEN' },
      injection: { style: 'header', headerName: 'Authorization', tokenPrefix: 'Bearer' },
    } as unknown as ConnectorAuthV2
  }
  if (authType === 'api_key') {
    return {
      type: 'api_key',
      apiKeyRef: { type: 'connector_secret', key: 'API_KEY' },
      injection: { style: 'header', headerName: 'Authorization', tokenPrefix: 'Bearer' },
    } as unknown as ConnectorAuthV2
  }
  if (authType === 'basic') {
    return {
      type: 'basic',
      usernameRef: { type: 'connector_secret', key: 'API_KEY' },
    } as unknown as ConnectorAuthV2
  }
  if (authType === 'platform_jwt') {
    return { type: 'platform_jwt', headerName: 'Authorization', tokenPrefix: 'Bearer' } as unknown as ConnectorAuthV2
  }
  return { type: 'none' } as unknown as ConnectorAuthV2
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

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [authType, setAuthType] = useState<ConnectorAuthTypeV2>('oauth2')
  const [isEnabled, setIsEnabled] = useState(true)
  const [version, setVersion] = useState('')
  const [category, setCategory] = useState('')

  const [baseUrl, setBaseUrl] = useState('')
  const [authText, setAuthText] = useState('')
  const [variablesText, setVariablesText] = useState('')
  const [rateLimitText, setRateLimitText] = useState('')
  const [metadataSchemaText, setMetadataSchemaText] = useState('')

  // Actions UI state
  const [actionsQuery, setActionsQuery] = useState('')
  const [selectedActionName, setSelectedActionName] = useState<string | null>(null)
  const [actionDraft, setActionDraft] = useState<Partial<ConnectorEndpointV2> | null>(null)
  const [actionParametersText, setActionParametersText] = useState('')
  const [actionMappingText, setActionMappingText] = useState('')
  const [actionResponseText, setActionResponseText] = useState('')

  const { data: actionsResp } = useAdminConnectorTemplateActions(id, { q: actionsQuery, limit: 50, offset: 0 }, isAuthenticated && isInstanceAdmin)
  const { data: selectedAction } = useAdminConnectorTemplateAction(id, selectedActionName, isAuthenticated && isInstanceAdmin && !!selectedActionName)
  const { data: legacyEndpoints } = useAdminConnectorTemplateLegacyEndpoints(id, isAuthenticated && isInstanceAdmin)

  const provider = connector?.provider
  const slug = connector?.slug

  const parsedAuth = useMemo(() => {
    try {
      const parsed = parseOptionalJson(authText)
      return isRecord(parsed) ? parsed : null
    } catch {
      return null
    }
  }, [authText])

  const updateAuth = (mutate: (auth: Record<string, unknown>) => void) => {
    const base = parsedAuth ? { ...parsedAuth } : (defaultAuthForType(authType) as unknown as Record<string, unknown>)
    mutate(base)
    setAuthText(formatJson(base))
  }

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
    setVariablesText(formatJson(connector.variables || []))
    setRateLimitText(formatJson(connector.rateLimit || undefined))
    setMetadataSchemaText(formatJson(connector.metadataSchema || undefined))
  }, [connector])

  useEffect(() => {
    if (!selectedAction) return
    setActionDraft({
      name: selectedAction.name,
      method: selectedAction.method,
      path: selectedAction.path,
      description: selectedAction.description,
      baseUrlOverride: selectedAction.baseUrlOverride,
      requestStyle: selectedAction.requestStyle,
      timeoutMs: selectedAction.timeoutMs,
    })
    setActionParametersText(formatJson(selectedAction.parameters))
    setActionMappingText(formatJson(selectedAction.mapping))
    setActionResponseText(formatJson(selectedAction.response))
  }, [selectedAction])

  const title = useMemo(() => (provider ? `Connector template: ${provider}` : 'Connector template'), [provider])

  const authTypeBadge = (authType || 'none') as string
  const hasActions = Boolean(actionsResp?.actions?.length)

  const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']
  const REQUEST_STYLES: RequestStyle[] = ['auto', 'query', 'json', 'form', 'multipart']

  const parseOptionalJsonObject = (label: string, text: string): Record<string, unknown> | undefined => {
    const trimmed = text.trim()
    if (!trimmed) return undefined
    const parsed = JSON.parse(trimmed)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`${label} must be a JSON object`)
    }
    return parsed as Record<string, unknown>
  }

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
              <div className="flex items-center gap-2">
                <Button
                  onClick={async () => {
                    if (!id) return
                    try {
                      const auth = parseOptionalJson(authText) as any
                      const variables = parseOptionalJson(variablesText) as any
                      const rateLimit = parseOptionalJson(rateLimitText) as any
                      const metadataSchema = parseOptionalJson(metadataSchemaText) as any

                      if (auth !== undefined && (auth === null || typeof auth !== 'object' || Array.isArray(auth))) {
                        toast.error('auth must be a JSON object')
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
                  {updateMutation.isPending ? 'Saving…' : 'Save changes'}
                </Button>
              </div>
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
                  <div className="rounded-lg border border-border/60 bg-background/70 p-5">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="font-mono text-sm text-muted-foreground truncate">{provider}</div>
                          <Badge variant="outline" className="font-mono">
                            {authTypeBadge}
                          </Badge>
                          {hasActions ? <Badge variant="connected">actions ready</Badge> : <Badge variant="secondary">no actions</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          <span className="font-mono">id={connector.id}</span>
                          {slug ? <span className="font-mono">{` • slug=${slug}`}</span> : null}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
                          <span className="text-xs font-mono text-muted-foreground">{isEnabled ? 'enabled' : 'disabled'}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Overview */}
                  <div className="rounded-lg border border-border/60 bg-background/70 p-5 space-y-4">
                    <div className="flex items-center gap-2">
                      <Icon name="file-text" className="h-4 w-4 text-muted-foreground" />
                      <div className="text-sm font-medium">Overview</div>
                    </div>
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

                  {/* Runtime */}
                  <div className="rounded-lg border border-border/60 bg-background/70 p-5 space-y-4">
                    <div className="flex items-center gap-2">
                      <Icon name="link" className="h-4 w-4 text-muted-foreground" />
                      <div className="text-sm font-medium">Runtime</div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Base URL</label>
                      <Input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} spellCheck={false} placeholder="https://api.example.com" />
                      <div className="text-xs text-muted-foreground">
                        Used as the default base URL for all actions unless an action has <span className="font-mono">baseUrlOverride</span>.
                      </div>
                    </div>
                  </div>

                  {/* Auth */}
                  <div className="rounded-lg border border-border/60 bg-background/70 p-5 space-y-4">
                    <div className="flex items-center gap-2">
                      <Icon name="shield" className="h-4 w-4 text-muted-foreground" />
                      <div className="text-sm font-medium">Auth</div>
                    </div>
                    <div className="flex flex-col md:flex-row md:items-end gap-4">
                      <div className="space-y-2 min-w-[240px]">
                        <label className="text-sm font-medium">Auth type</label>
                        <Select
                          value={authType}
                          onValueChange={v => {
                            const next = v as ConnectorAuthTypeV2
                            setAuthType(next)
                            setAuthText(formatJson(defaultAuthForType(next)))
                          }}
                        >
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
                      <div className="text-xs text-muted-foreground">Structured editor for common fields. Raw auth JSON is available in Advanced.</div>
                    </div>

                    {!parsedAuth ? (
                      <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-muted-foreground">
                        Auth JSON is invalid or not an object. Fix it in the Advanced section below.
                      </div>
                    ) : null}

                    {authType === 'oauth2' ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Authorization URL</label>
                          <Input value={String(parsedAuth?.authorizationUrl ?? '')} onChange={e => updateAuth(a => (a.authorizationUrl = e.target.value))} spellCheck={false} />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Token URL</label>
                          <Input value={String(parsedAuth?.tokenUrl ?? '')} onChange={e => updateAuth(a => (a.tokenUrl = e.target.value))} spellCheck={false} />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <label className="text-sm font-medium">Scopes</label>
                          <Input
                            value={Array.isArray(parsedAuth?.scopes) ? (parsedAuth?.scopes as any[]).join(', ') : ''}
                            onChange={e =>
                              updateAuth(a => {
                                const raw = e.target.value
                                a.scopes = raw
                                  .split(',')
                                  .map(x => x.trim())
                                  .filter(Boolean)
                              })
                            }
                            placeholder="scope1, scope2"
                            spellCheck={false}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Client ID secret key</label>
                          <Input
                            value={String((parsedAuth?.clientIdRef as any)?.key ?? '')}
                            onChange={e =>
                              updateAuth(a => {
                                a.clientIdRef = { type: 'platform_secret', key: e.target.value }
                              })
                            }
                            spellCheck={false}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Client secret key</label>
                          <Input
                            value={String((parsedAuth?.clientSecretRef as any)?.key ?? '')}
                            onChange={e =>
                              updateAuth(a => {
                                a.clientSecretRef = { type: 'platform_secret', key: e.target.value }
                              })
                            }
                            spellCheck={false}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Access token secret key</label>
                          <Input
                            value={String((parsedAuth?.accessTokenRef as any)?.key ?? '')}
                            onChange={e =>
                              updateAuth(a => {
                                a.accessTokenRef = { type: 'connector_secret', key: e.target.value }
                              })
                            }
                            spellCheck={false}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Injection header name</label>
                          <Input
                            value={String((parsedAuth?.injection as any)?.headerName ?? 'Authorization')}
                            onChange={e =>
                              updateAuth(a => {
                                a.injection = { ...(isRecord(a.injection) ? a.injection : {}), style: 'header', headerName: e.target.value }
                              })
                            }
                            spellCheck={false}
                          />
                        </div>
                      </div>
                    ) : null}

                    {authType === 'api_key' ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">API key secret key</label>
                          <Input
                            value={String((parsedAuth?.apiKeyRef as any)?.key ?? '')}
                            onChange={e =>
                              updateAuth(a => {
                                a.apiKeyRef = { type: 'connector_secret', key: e.target.value }
                              })
                            }
                            spellCheck={false}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Injection header name</label>
                          <Input
                            value={String((parsedAuth?.injection as any)?.headerName ?? 'Authorization')}
                            onChange={e =>
                              updateAuth(a => {
                                a.injection = { ...(isRecord(a.injection) ? a.injection : {}), style: 'header', headerName: e.target.value }
                              })
                            }
                            spellCheck={false}
                          />
                        </div>
                      </div>
                    ) : null}

                    {authType === 'basic' ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Username/API key secret key</label>
                          <Input
                            value={String((parsedAuth?.usernameRef as any)?.key ?? '')}
                            onChange={e =>
                              updateAuth(a => {
                                a.usernameRef = { type: 'connector_secret', key: e.target.value }
                              })
                            }
                            spellCheck={false}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Password secret key (optional)</label>
                          <Input
                            value={String((parsedAuth?.passwordRef as any)?.key ?? '')}
                            onChange={e =>
                              updateAuth(a => {
                                const key = e.target.value.trim()
                                if (!key) {
                                  delete (a as any).passwordRef
                                } else {
                                  a.passwordRef = { type: 'connector_secret', key }
                                }
                              })
                            }
                            spellCheck={false}
                          />
                        </div>
                      </div>
                    ) : null}

                    {authType === 'platform_jwt' ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Header name</label>
                          <Input value={String(parsedAuth?.headerName ?? 'Authorization')} onChange={e => updateAuth(a => (a.headerName = e.target.value))} />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Token prefix</label>
                          <Input value={String(parsedAuth?.tokenPrefix ?? 'Bearer')} onChange={e => updateAuth(a => (a.tokenPrefix = e.target.value))} />
                        </div>
                      </div>
                    ) : null}

                    {authType === 'none' ? <div className="text-sm text-muted-foreground">No auth configuration required.</div> : null}

                    <div className="pt-2 border-t border-border/60 space-y-2">
                      <label className="text-sm font-medium">Auth JSON (advanced)</label>
                      <div className="text-xs text-muted-foreground">If you need fields not in the structured editor, edit the raw JSON here.</div>
                      <Textarea value={authText} onChange={e => setAuthText(e.target.value)} className="min-h-[240px] font-mono text-xs" spellCheck={false} />
                    </div>
                  </div>

                  {/* Actions */}
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
                            const legacy = legacyEndpoints ?? []
                            if (!Array.isArray(legacy) || legacy.length === 0) {
                              toast.error('No legacy endpoints to migrate')
                              return
                            }
                            if (!confirm('Migrate LEGACY_endpoints into actions? This will REPLACE all existing actions.')) return
                            try {
                              await bulkReplaceMutation.mutateAsync({ id, payload: { actions: legacy as any } })
                              toast.success('Migrated legacy endpoints → actions', { description: `${legacy.length} actions` })
                            } catch (e: any) {
                              toast.error('Migration failed', { description: e?.message || 'Please try again.' })
                            }
                          }}
                          disabled={bulkReplaceMutation.isPending || !(legacyEndpoints?.length ?? 0)}
                        >
                          {bulkReplaceMutation.isPending ? 'Migrating…' : 'Migrate legacy → actions'}
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Search</label>
                      <Input value={actionsQuery} onChange={e => setActionsQuery(e.target.value)} placeholder="Search by name, path, description" />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch h-[65vh] lg:h-[70vh] min-h-0 overflow-hidden">
                      <div className="rounded-md border border-border/60 flex flex-col min-h-0 h-full">
                        <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border/60">{actionsResp?.actions?.length ? `${actionsResp.actions.length} actions` : 'No actions'}</div>
                        <div className="flex-1 min-h-0 overflow-auto divide-y divide-border/60">
                          {(actionsResp?.actions || []).map(a => (
                            <button
                              key={`${a.templateId}:${a.actionName}`}
                              className={`w-full text-left px-3 py-2 hover:bg-muted/40 ${selectedActionName === a.actionName ? 'bg-muted/50' : ''}`}
                              onClick={() => setSelectedActionName(a.actionName)}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="font-mono text-xs truncate">{a.actionName}</div>
                                <Badge variant="outline" className="font-mono text-[10px] px-2 py-0.5">
                                  {a.method}
                                </Badge>
                              </div>
                              <div className="text-xs text-muted-foreground truncate font-mono mt-1">{a.path}</div>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-md border border-border/60 flex flex-col min-h-0 h-full">
                        <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border/60 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs font-medium text-muted-foreground">Selected action</span>
                            {selectedActionName ? <span className="font-mono text-xs text-muted-foreground truncate">{selectedActionName}</span> : null}
                          </div>
                        </div>

                        <div className="flex-1 min-h-0 overflow-auto p-3 space-y-3">
                          {!selectedActionName ? (
                            <div className="rounded-md border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">Select an action from the list to edit it.</div>
                          ) : (
                            <div className="space-y-3">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div className="space-y-2">
                                  <label className="text-xs font-medium text-muted-foreground">Action name</label>
                                  <Input value={selectedActionName} readOnly className="font-mono h-9 text-sm" />
                                </div>
                                <div className="space-y-2">
                                  <label className="text-xs font-medium text-muted-foreground">HTTP method</label>
                                  <Select
                                    value={String(actionDraft?.method ?? '')}
                                    onValueChange={v =>
                                      setActionDraft(prev => ({
                                        ...(prev ?? {}),
                                        method: v as HttpMethod,
                                      }))
                                    }
                                  >
                                    <SelectTrigger className="h-9 text-sm">
                                      <SelectValue placeholder="Select method" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {HTTP_METHODS.map(m => (
                                        <SelectItem key={m} value={m}>
                                          <span className="font-mono">{m}</span>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                  <label className="text-xs font-medium text-muted-foreground">Path</label>
                                  <Input
                                    value={String(actionDraft?.path ?? '')}
                                    onChange={e => setActionDraft(prev => ({ ...(prev ?? {}), path: e.target.value }))}
                                    placeholder="/v1/items/{id}"
                                    spellCheck={false}
                                    className="font-mono h-9 text-sm"
                                  />
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                  <label className="text-xs font-medium text-muted-foreground">Description</label>
                                  <Textarea
                                    value={String(actionDraft?.description ?? '')}
                                    onChange={e => setActionDraft(prev => ({ ...(prev ?? {}), description: e.target.value }))}
                                    className="min-h-[72px] text-sm"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <label className="text-xs font-medium text-muted-foreground">Request style</label>
                                  <Select
                                    value={String(actionDraft?.requestStyle ?? '')}
                                    onValueChange={v =>
                                      setActionDraft(prev => ({
                                        ...(prev ?? {}),
                                        requestStyle: v as RequestStyle,
                                      }))
                                    }
                                  >
                                    <SelectTrigger className="h-9 text-sm">
                                      <SelectValue placeholder="(optional)" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {REQUEST_STYLES.map(s => (
                                        <SelectItem key={s} value={s}>
                                          <span className="font-mono">{s}</span>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-2">
                                  <label className="text-xs font-medium text-muted-foreground">Timeout (ms)</label>
                                  <Input
                                    value={actionDraft?.timeoutMs === undefined ? '' : String(actionDraft.timeoutMs)}
                                    onChange={e =>
                                      setActionDraft(prev => {
                                        const raw = e.target.value.trim()
                                        return { ...(prev ?? {}), timeoutMs: raw ? Number(raw) : undefined }
                                      })
                                    }
                                    placeholder="e.g. 5000"
                                    inputMode="numeric"
                                    className="h-9 text-sm"
                                  />
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                  <label className="text-xs font-medium text-muted-foreground">Base URL override</label>
                                  <Input
                                    value={String(actionDraft?.baseUrlOverride ?? '')}
                                    onChange={e => setActionDraft(prev => ({ ...(prev ?? {}), baseUrlOverride: e.target.value }))}
                                    placeholder="(optional) https://api.example.com"
                                    spellCheck={false}
                                    className="font-mono h-9 text-sm"
                                  />
                                </div>
                              </div>

                              <div className="pt-2 border-t border-border/60 space-y-3">
                                <div className="text-xs font-medium text-muted-foreground">Advanced JSON</div>
                                <div className="grid grid-cols-1 gap-3">
                                  <div className="space-y-2">
                                    <label className="text-xs font-medium text-muted-foreground">parameters (JSON schema object)</label>
                                    <Textarea
                                      value={actionParametersText}
                                      onChange={e => setActionParametersText(e.target.value)}
                                      className="min-h-[120px] font-mono text-xs"
                                      spellCheck={false}
                                      placeholder='e.g. { "type": "object", "properties": {} }'
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-xs font-medium text-muted-foreground">mapping (JSON object)</label>
                                    <Textarea
                                      value={actionMappingText}
                                      onChange={e => setActionMappingText(e.target.value)}
                                      className="min-h-[120px] font-mono text-xs"
                                      spellCheck={false}
                                      placeholder='e.g. { "query": { "q": "{{ String(args.q) }}" } }'
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-xs font-medium text-muted-foreground">response (JSON object)</label>
                                    <Textarea
                                      value={actionResponseText}
                                      onChange={e => setActionResponseText(e.target.value)}
                                      className="min-h-[96px] font-mono text-xs"
                                      spellCheck={false}
                                      placeholder='e.g. { "select": "{{ body.items }}" }'
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="px-3 py-2 border-t border-border/60 flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              if (!id || !selectedActionName) return
                              if (!confirm(`Delete action "${selectedActionName}"?`)) return
                              await deleteActionMutation.mutateAsync({ id, actionName: selectedActionName })
                              setSelectedActionName(null)
                              setActionDraft(null)
                              setActionParametersText('')
                              setActionMappingText('')
                              setActionResponseText('')
                            }}
                            disabled={!selectedActionName || deleteActionMutation.isPending}
                          >
                            Delete
                          </Button>
                          <Button
                            size="sm"
                            onClick={async () => {
                              if (!id || !selectedActionName) return
                              try {
                                const method = String(actionDraft?.method ?? '')
                                  .trim()
                                  .toUpperCase()
                                const path = String(actionDraft?.path ?? '').trim()
                                if (!method) {
                                  toast.error('method is required')
                                  return
                                }
                                if (!path) {
                                  toast.error('path is required')
                                  return
                                }

                                const timeoutMs =
                                  actionDraft?.timeoutMs === undefined || actionDraft.timeoutMs === null || Number.isNaN(Number(actionDraft.timeoutMs))
                                    ? undefined
                                    : Math.max(0, Math.floor(Number(actionDraft.timeoutMs)))

                                const endpoint: ConnectorEndpointV2 = {
                                  name: selectedActionName,
                                  method: method as HttpMethod,
                                  path,
                                  ...(String(actionDraft?.description ?? '').trim() ? { description: String(actionDraft?.description ?? '').trim() } : {}),
                                  ...(String(actionDraft?.baseUrlOverride ?? '').trim() ? { baseUrlOverride: String(actionDraft?.baseUrlOverride ?? '').trim() } : {}),
                                  ...(actionDraft?.requestStyle ? { requestStyle: actionDraft.requestStyle } : {}),
                                  ...(timeoutMs !== undefined ? { timeoutMs } : {}),
                                  ...(parseOptionalJsonObject('parameters', actionParametersText) ? { parameters: parseOptionalJsonObject('parameters', actionParametersText) as any } : {}),
                                  ...(parseOptionalJsonObject('mapping', actionMappingText) ? { mapping: parseOptionalJsonObject('mapping', actionMappingText) as any } : {}),
                                  ...(parseOptionalJsonObject('response', actionResponseText) ? { response: parseOptionalJsonObject('response', actionResponseText) as any } : {}),
                                }

                                await upsertActionMutation.mutateAsync({
                                  id,
                                  actionName: selectedActionName,
                                  payload: { action: endpoint },
                                })
                              } catch (e: any) {
                                toast.error('Failed to save action', { description: e?.message || 'Please verify fields.' })
                              }
                            }}
                            disabled={!selectedActionName || upsertActionMutation.isPending}
                          >
                            {upsertActionMutation.isPending ? 'Saving…' : 'Save action'}
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-border/60 opacity-60">
                      <label className="text-sm font-medium">LEGACY_endpoints (read-only)</label>
                      <div className="text-xs text-muted-foreground">This is the raw legacy `connector_templates.endpoints_json` value. It is not used by runtime and cannot be edited here.</div>
                      <Textarea value={formatJson({ LEGACY_endpoints: legacyEndpoints ?? [] })} readOnly className="min-h-[180px] font-mono text-xs" spellCheck={false} />
                    </div>
                  </div>

                  {/* Advanced */}
                  <div className="rounded-lg border border-border/60 bg-background/70 p-5 space-y-4">
                    <div className="flex items-center gap-2">
                      <Icon name="settings" className="h-4 w-4 text-muted-foreground" />
                      <div className="text-sm font-medium">Advanced</div>
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
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </PageLayout>
  )
}
