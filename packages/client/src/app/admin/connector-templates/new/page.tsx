'use client'

import Icon from '@/components/primitives/Icon'
import { PageLayout } from '@/components/layout/PageLayout'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/hooks/useAuth'
import { useCreateAdminConnectorTemplate } from '@/hooks/useAdminConnectorTemplates'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
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

function defaultAuthForType(authType: ConnectorAuthTypeV2): any {
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
    }
  }
  if (authType === 'api_key') {
    return {
      type: 'api_key',
      apiKeyRef: { type: 'connector_secret', key: 'API_KEY' },
      injection: { style: 'header', headerName: 'Authorization', tokenPrefix: 'Bearer' },
    }
  }
  if (authType === 'basic') {
    return {
      type: 'basic',
      // Common API-key-only case: put the key in usernameRef and omit passwordRef.
      usernameRef: { type: 'connector_secret', key: 'API_KEY' },
    }
  }
  if (authType === 'platform_jwt') {
    return { type: 'platform_jwt', headerName: 'Authorization', tokenPrefix: 'Bearer' }
  }
  return { type: 'none' }
}

export default function AdminConnectorTemplateNewPage(): React.JSX.Element {
  const { isAuthenticated, isInstanceAdmin } = useAuth()
  const router = useRouter()
  const createMutation = useCreateAdminConnectorTemplate()

  const [id, setId] = useState('')
  const [slug, setSlug] = useState('')
  const [provider, setProvider] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [authType, setAuthType] = useState<ConnectorAuthTypeV2>('oauth2')
  const [isEnabled, setIsEnabled] = useState(true)
  const [version, setVersion] = useState('1.0.0')
  const [category, setCategory] = useState('connector')

  const [baseUrl, setBaseUrl] = useState('')
  const [authText, setAuthText] = useState(formatJson(defaultAuthForType('oauth2')))
  const [endpointsText, setEndpointsText] = useState(formatJson([]))
  const [variablesText, setVariablesText] = useState(formatJson([]))
  const [rateLimitText, setRateLimitText] = useState('')
  const [metadataSchemaText, setMetadataSchemaText] = useState('')

  // When authType changes, keep auth JSON aligned unless the user has already edited it.
  const authTextLooksDefault = useMemo(() => {
    const trimmed = authText.trim()
    return trimmed === formatJson(defaultAuthForType(authType)).trim()
  }, [authText, authType])

  useEffect(() => {
    // If user hasn't edited authText (still default for some type), replace with new default skeleton.
    if (authTextLooksDefault) {
      setAuthText(formatJson(defaultAuthForType(authType)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authType])

  const title = 'New connector template'

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
              </div>
              <p className="text-muted-foreground mt-3">Create a new connector template. Values are stored in `connector_templates`.</p>
            </div>

            <div className="flex items-center justify-between gap-3">
              <Button variant="outline" onClick={() => router.push('/admin/connector-templates')}>
                <Icon name="chevron-left" className="h-4 w-4 mr-1" />
                Back
              </Button>
              <Button
                onClick={async () => {
                  try {
                    const auth = parseOptionalJson(authText) as any
                    const endpoints = parseOptionalJson(endpointsText) as any
                    const variables = parseOptionalJson(variablesText) as any
                    const rateLimit = parseOptionalJson(rateLimitText) as any
                    const metadataSchema = parseOptionalJson(metadataSchemaText) as any

                    if (!provider.trim()) {
                      toast.error('provider is required')
                      return
                    }
                    if (!name.trim()) {
                      toast.error('name is required')
                      return
                    }
                    if (!description.trim()) {
                      toast.error('description is required')
                      return
                    }
                    if (!baseUrl.trim()) {
                      toast.error('baseUrl is required')
                      return
                    }

                    if (auth === undefined || auth === null || typeof auth !== 'object' || Array.isArray(auth)) {
                      toast.error('auth must be a JSON object')
                      return
                    }
                    if (endpoints === undefined || !Array.isArray(endpoints)) {
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

                    const created = await createMutation.mutateAsync({
                      id: id.trim() || undefined,
                      slug: slug.trim() || undefined,
                      provider: provider.trim(),
                      name: name.trim(),
                      description: description.trim(),
                      isEnabled,
                      version: version.trim() || undefined,
                      category: category.trim() || undefined,
                      baseUrl: baseUrl.trim(),
                      auth: auth as any,
                      endpoints: endpoints as any,
                      variables: variables === undefined ? undefined : (variables as any),
                      rateLimit: rateLimit === undefined ? undefined : (rateLimit as any),
                      metadataSchema: metadataSchema === undefined ? undefined : (metadataSchema as any),
                    })

                    router.push(`/admin/connector-templates/${created.id}`)
                  } catch (e: any) {
                    toast.error('Failed to create connector template', { description: e?.message || 'Please verify your inputs.' })
                  }
                }}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? 'Creating…' : 'Create'}
              </Button>
            </div>

            <section className="space-y-6">
              <div className="rounded-lg border border-border/60 bg-background/70 p-5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Provider *</label>
                    <Input value={provider} onChange={e => setProvider(e.target.value)} placeholder="example" spellCheck={false} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Name *</label>
                    <Input value={name} onChange={e => setName(e.target.value)} placeholder="Example" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">ID (optional)</label>
                    <Input value={id} onChange={e => setId(e.target.value)} placeholder="Defaults to provider" spellCheck={false} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Slug (optional)</label>
                    <Input value={slug} onChange={e => setSlug(e.target.value)} placeholder="Auto-generated if empty" spellCheck={false} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Auth type *</label>
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
                    <Input value={version} onChange={e => setVersion(e.target.value)} placeholder="1.0.0" spellCheck={false} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Category</label>
                    <Input value={category} onChange={e => setCategory(e.target.value)} placeholder="connector" spellCheck={false} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium">Description *</label>
                    <Textarea value={description} onChange={e => setDescription(e.target.value)} className="min-h-[110px]" />
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border/60 bg-background/70 p-5 space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Base URL *</label>
                  <Input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} spellCheck={false} placeholder="https://example.com" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">auth (JSON) *</label>
                  <Textarea value={authText} onChange={e => setAuthText(e.target.value)} className="min-h-[240px] font-mono text-xs" spellCheck={false} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">endpoints (JSON array) *</label>
                  <Textarea value={endpointsText} onChange={e => setEndpointsText(e.target.value)} className="min-h-[240px] font-mono text-xs" spellCheck={false} />
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
            </section>
          </div>
        </div>
      </div>
    </PageLayout>
  )
}


