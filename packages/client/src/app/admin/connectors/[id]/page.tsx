'use client'

import Icon from '@/components/primitives/Icon'
import { PageLayout } from '@/components/layout/PageLayout'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/hooks/useAuth'
import { useAdminConnectorTemplate, useUpdateAdminConnectorTemplate } from '@/hooks/useAdminConnectors'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

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

export default function AdminConnectorDetailPage(): React.JSX.Element {
  const { isAuthenticated, isInstanceAdmin } = useAuth()
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = params?.id

  const { data: connector, isLoading, isError, error } = useAdminConnectorTemplate(id, isAuthenticated && isInstanceAdmin)
  const updateMutation = useUpdateAdminConnectorTemplate()

  const [displayName, setDisplayName] = useState('')
  const [description, setDescription] = useState('')
  const [authType, setAuthType] = useState<'oauth2' | 'api_key' | 'custom' | 'none'>('oauth2')
  const [isEnabled, setIsEnabled] = useState(true)
  const [version, setVersion] = useState('')
  const [category, setCategory] = useState('')

  const [runtimeConfigText, setRuntimeConfigText] = useState('')
  const [connectBlueprintText, setConnectBlueprintText] = useState('')
  const [refreshBlueprintText, setRefreshBlueprintText] = useState('')
  const [testBlueprintText, setTestBlueprintText] = useState('')

  const provider = connector?.provider
  const slug = connector?.slug

  useEffect(() => {
    if (!connector) return
    setDisplayName(connector.displayName || '')
    setDescription(connector.description || '')
    setAuthType((connector.authType as any) || 'oauth2')
    setIsEnabled((connector as any).isEnabled !== false)
    setVersion(connector.version || '')
    setCategory(connector.category || '')

    setRuntimeConfigText(formatJson(connector.runtimeConfig || {}))
    setConnectBlueprintText(formatJson(connector.connectBlueprint))
    setRefreshBlueprintText(formatJson(connector.refreshBlueprint))
    setTestBlueprintText(formatJson(connector.testBlueprint))
  }, [connector])

  const title = useMemo(() => (provider ? `Connector: ${provider}` : 'Connector'), [provider])

  if (!isAuthenticated) {
    return (
      <PageLayout title={title} description="Sign in to manage connectors." showHeader>
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">You must be signed in to view this page.</p>
        </div>
      </PageLayout>
    )
  }

  if (!isInstanceAdmin) {
    return (
      <PageLayout title={title} description="Instance admin tools for managing connectors." showHeader>
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
                <a href="/admin/connectors" className="text-sm font-medium underline underline-offset-4">
                  Connectors
                </a>
                <span className="text-muted-foreground">·</span>
                <a href="/admin/agents/pending" className="text-sm font-medium underline underline-offset-4">
                  Agent approvals
                </a>
                <span className="text-muted-foreground">·</span>
                <a href="/admin/platform-secrets" className="text-sm font-medium underline underline-offset-4">
                  Platform secrets
                </a>
              </div>
              <p className="text-muted-foreground mt-3">Edit connector template configuration. Values are stored in `connector_templates`.</p>
            </div>

            <div className="flex items-center justify-between gap-3">
              <Button variant="outline" onClick={() => router.push('/admin/connectors')}>
                <Icon name="chevron-left" className="h-4 w-4 mr-1" />
                Back
              </Button>
              <Button
                onClick={async () => {
                  if (!id) return
                  try {
                    const runtimeConfig = parseOptionalJson(runtimeConfigText) as any
                    const connectBlueprint = parseOptionalJson(connectBlueprintText) as any
                    const refreshBlueprint = parseOptionalJson(refreshBlueprintText) as any
                    const testBlueprint = parseOptionalJson(testBlueprintText) as any

                    if (runtimeConfig !== undefined && (runtimeConfig === null || typeof runtimeConfig !== 'object' || Array.isArray(runtimeConfig))) {
                      toast.error('runtimeConfig must be a JSON object')
                      return
                    }
                    for (const [name, v] of [
                      ['connectBlueprint', connectBlueprint],
                      ['refreshBlueprint', refreshBlueprint],
                      ['testBlueprint', testBlueprint],
                    ] as const) {
                      if (v !== undefined && v !== null && (typeof v !== 'object' || Array.isArray(v))) {
                        toast.error(`${name} must be a JSON object or null`)
                        return
                      }
                    }

                    await updateMutation.mutateAsync({
                      id,
                      updates: {
                        displayName,
                        description,
                        authType,
                        isEnabled,
                        version,
                        category,
                        runtimeConfig: runtimeConfig === undefined ? undefined : (runtimeConfig as any),
                        connectBlueprint: connectBlueprint === undefined ? undefined : (connectBlueprint as any),
                        refreshBlueprint: refreshBlueprint === undefined ? undefined : (refreshBlueprint as any),
                        testBlueprint: testBlueprint === undefined ? undefined : (testBlueprint as any),
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

              {isError && !isLoading && <div className="flex items-center justify-center py-12 text-muted-foreground">{(error as any)?.message || 'Failed to load connector.'}</div>}

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
                        <label className="text-sm font-medium">Display name</label>
                        <Input value={displayName} onChange={e => setDisplayName(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Auth type</label>
                        <Select value={authType} onValueChange={v => setAuthType(v as any)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select auth type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="oauth2">oauth2</SelectItem>
                            <SelectItem value="api_key">api_key</SelectItem>
                            <SelectItem value="custom">custom</SelectItem>
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
                      <label className="text-sm font-medium">runtimeConfig (JSON)</label>
                      <Textarea value={runtimeConfigText} onChange={e => setRuntimeConfigText(e.target.value)} className="min-h-[220px] font-mono text-xs" spellCheck={false} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">connectBlueprint (JSON or null)</label>
                      <Textarea value={connectBlueprintText} onChange={e => setConnectBlueprintText(e.target.value)} className="min-h-[220px] font-mono text-xs" spellCheck={false} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">refreshBlueprint (JSON or null)</label>
                      <Textarea value={refreshBlueprintText} onChange={e => setRefreshBlueprintText(e.target.value)} className="min-h-[220px] font-mono text-xs" spellCheck={false} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">testBlueprint (JSON or null)</label>
                      <Textarea value={testBlueprintText} onChange={e => setTestBlueprintText(e.target.value)} className="min-h-[220px] font-mono text-xs" spellCheck={false} />
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
