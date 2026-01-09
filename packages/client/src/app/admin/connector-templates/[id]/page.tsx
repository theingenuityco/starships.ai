'use client'

import Icon from '@/components/primitives/Icon'
import { PageLayout } from '@/components/layout/PageLayout'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/hooks/useAuth'
import { useAdminConnectorTemplate, useUpdateAdminConnectorTemplate } from '@/hooks/useAdminConnectorTemplates'
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
    setEndpointsText(formatJson(connector.endpoints || []))
    setVariablesText(formatJson(connector.variables || []))
    setRateLimitText(formatJson(connector.rateLimit || undefined))
    setMetadataSchemaText(formatJson(connector.metadataSchema || undefined))
  }, [connector])

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
                      <label className="text-sm font-medium">endpoints (JSON array)</label>
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
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </PageLayout>
  )
}
