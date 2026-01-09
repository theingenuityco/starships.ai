'use client'

import Icon from '@/components/primitives/Icon'
import { PageLayout } from '@/components/layout/PageLayout'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useAuth } from '@/hooks/useAuth'
import Link from 'next/link'
import React, { useMemo, useState } from 'react'
import {
  useAdminCreateLlmModel,
  useAdminDeleteLlmProviderRoute,
  useAdminLlmModelProviders,
  useAdminLlmModels,
  useAdminSyncOpenRouterModels,
  useAdminUpdateLlmModel,
  useAdminUpsertLlmProviderRoute,
} from '@/hooks/useAdminLlmModels'

function AdminNav() {
  return (
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
  )
}

function ProvidersRow({ model }: { model: string }) {
  const [show, setShow] = useState(false)
  const { data: providers = [], isLoading } = useAdminLlmModelProviders(model, show)
  const upsert = useAdminUpsertLlmProviderRoute()
  const del = useAdminDeleteLlmProviderRoute()

  const [provider, setProvider] = useState('openrouter')
  const [providerModelId, setProviderModelId] = useState(model)
  const [priority, setPriority] = useState<number>(0)
  const [enabled, setEnabled] = useState(true)

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="text-xs font-medium text-muted-foreground underline underline-offset-4"
          onClick={() => setShow(v => !v)}
        >
          {show ? 'Hide provider routes' : 'Show provider routes'}
        </button>
      </div>

      {show && (
        <div className="mt-3 space-y-3">
          <div className="rounded-md border overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted/40">
                <tr>
                  <th className="border-b px-3 py-2 text-left text-xs font-medium">Provider</th>
                  <th className="border-b px-3 py-2 text-left text-xs font-medium">Provider model id</th>
                  <th className="border-b px-3 py-2 text-left text-xs font-medium">Priority</th>
                  <th className="border-b px-3 py-2 text-left text-xs font-medium">Enabled</th>
                  <th className="border-b px-3 py-2 text-right text-xs font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={5} className="px-3 py-3 text-xs text-muted-foreground">
                      Loading…
                    </td>
                  </tr>
                )}
                {!isLoading && providers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-3 text-xs text-muted-foreground">
                      No provider routes.
                    </td>
                  </tr>
                )}
                {!isLoading &&
                  providers.map(p => (
                    <tr key={`${p.provider}:${p.providerModelId}`} className="border-b last:border-0">
                      <td className="px-3 py-2 text-xs font-mono">{p.provider}</td>
                      <td className="px-3 py-2 text-xs font-mono">{p.providerModelId}</td>
                      <td className="px-3 py-2 text-xs font-mono">{p.priority}</td>
                      <td className="px-3 py-2 text-xs">
                        <span className="font-mono text-muted-foreground">{p.isEnabled ? 'enabled' : 'disabled'}</span>
                      </td>
                      <td className="px-3 py-2 text-xs text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2"
                          disabled={del.isPending}
                          onClick={() => del.mutate({ model, provider: p.provider, providerModelId: p.providerModelId })}
                        >
                          Delete
                        </Button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-md border p-3">
            <div className="text-xs font-medium mb-2">Add / update provider route</div>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
              <div className="md:col-span-1">
                <label className="text-[11px] text-muted-foreground">provider</label>
                <Input value={provider} onChange={e => setProvider(e.target.value)} className="h-8 font-mono text-xs" spellCheck={false} />
              </div>
              <div className="md:col-span-2">
                <label className="text-[11px] text-muted-foreground">providerModelId</label>
                <Input value={providerModelId} onChange={e => setProviderModelId(e.target.value)} className="h-8 font-mono text-xs" spellCheck={false} />
              </div>
              <div className="md:col-span-1">
                <label className="text-[11px] text-muted-foreground">priority</label>
                <Input
                  value={String(priority)}
                  onChange={e => setPriority(Number(e.target.value) || 0)}
                  className="h-8 font-mono text-xs"
                  inputMode="numeric"
                />
              </div>
              <div className="md:col-span-1 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Switch checked={enabled} onCheckedChange={setEnabled} />
                  <span className="text-xs font-mono text-muted-foreground">{enabled ? 'enabled' : 'disabled'}</span>
                </div>
              </div>
            </div>
            <div className="mt-2 flex justify-end">
              <Button
                type="button"
                size="sm"
                disabled={upsert.isPending || !provider.trim() || !providerModelId.trim()}
                onClick={() =>
                  upsert.mutate({
                    model,
                    provider: provider.trim(),
                    providerModelId: providerModelId.trim(),
                    priority,
                    isEnabled: enabled,
                  })
                }
              >
                Save route
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AdminLlmModelsPage(): React.JSX.Element {
  const { isAuthenticated, isInstanceAdmin } = useAuth()

  const { data: models = [], isLoading, isError, error } = useAdminLlmModels(isAuthenticated && isInstanceAdmin)
  const create = useAdminCreateLlmModel()
  const update = useAdminUpdateLlmModel()
  const sync = useAdminSyncOpenRouterModels()

  const [newModel, setNewModel] = useState('')
  const sorted = useMemo(() => {
    return (Array.isArray(models) ? models : []).slice().sort((a, b) => String(a.model).localeCompare(String(b.model)))
  }, [models])

  if (!isAuthenticated) {
    return (
      <PageLayout title="LLM models" description="Sign in to manage the LLM model catalog." showHeader>
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">You must be signed in to view this page.</p>
        </div>
      </PageLayout>
    )
  }

  if (!isInstanceAdmin) {
    return (
      <PageLayout title="LLM models" description="Instance admin tools for managing the LLM model catalog." showHeader>
        <div className="flex items-center justify-center h-full">
          <Card className="max-w-md w-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icon name="shield-alert" className="h-5 w-5 text-amber-500" />
                Instance admin access required
              </CardTitle>
              <CardDescription>Only instance admins can view and manage the LLM model catalog.</CardDescription>
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
              <AdminNav />
              <p className="text-muted-foreground mt-3">Manage the canonical model catalog (what agents reference) and per-model provider routes.</p>
            </div>

            <section className="space-y-4">
              <div className="flex flex-col md:flex-row items-stretch md:items-end justify-between gap-3">
                <div className="flex-1">
                  <label className="text-xs font-medium text-muted-foreground">Add canonical model</label>
                  <div className="flex items-center gap-2 mt-1">
                    <Input
                      value={newModel}
                      onChange={e => setNewModel(e.target.value)}
                      placeholder="e.g. openai/gpt-4o"
                      className="font-mono"
                      spellCheck={false}
                    />
                    <Button
                      type="button"
                      disabled={create.isPending || !newModel.trim()}
                      onClick={() => {
                        create.mutate({ model: newModel.trim() })
                        setNewModel('')
                      }}
                    >
                      <Icon name="plus" className="h-4 w-4 mr-1" />
                      Add
                    </Button>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <Button type="button" variant="outline" disabled={sync.isPending} onClick={() => sync.mutate()}>
                    <Icon name="refresh" className="h-4 w-4 mr-1" />
                    {sync.isPending ? 'Syncing…' : 'Sync OpenRouter metadata'}
                  </Button>
                </div>
              </div>

              <div className="w-full rounded-md border overflow-visible">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="border-b px-4 py-3 text-left text-sm font-medium whitespace-nowrap">Model</th>
                      <th className="border-b px-4 py-3 text-left text-sm font-medium whitespace-nowrap">Enabled</th>
                      <th className="border-b px-4 py-3 text-left text-sm font-medium whitespace-nowrap">Deprecated</th>
                      <th className="border-b px-4 py-3 text-left text-sm font-medium whitespace-nowrap">Context</th>
                      <th className="border-b px-4 py-3 text-left text-sm font-medium whitespace-nowrap">Updated</th>
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
                          {(error as any)?.message || 'Failed to load models.'}
                        </td>
                      </tr>
                    )}
                    {!isLoading && !isError && sorted.length === 0 && (
                      <tr>
                        <td className="px-4 py-6 text-sm text-muted-foreground" colSpan={5}>
                          No models found.
                        </td>
                      </tr>
                    )}
                    {!isLoading &&
                      !isError &&
                      sorted.map(m => (
                        <tr key={m.model} className="border-b last:border-0">
                          <td className="px-4 py-3 text-sm">
                            <div className="font-mono">{m.model}</div>
                            <ProvidersRow model={m.model} />
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <div className="inline-flex items-center gap-2">
                              <Switch
                                size="sm"
                                checked={m.isEnabled}
                                disabled={update.isPending}
                                onCheckedChange={checked => update.mutate({ model: m.model, updates: { isEnabled: checked } as any })}
                              />
                              <span className="text-xs font-mono text-muted-foreground">{m.isEnabled ? 'enabled' : 'disabled'}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <div className="inline-flex items-center gap-2">
                              <Switch
                                size="sm"
                                checked={m.isDeprecated}
                                disabled={update.isPending}
                                onCheckedChange={checked => update.mutate({ model: m.model, updates: { isDeprecated: checked } as any })}
                              />
                              <span className="text-xs font-mono text-muted-foreground">{m.isDeprecated ? 'deprecated' : 'active'}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm font-mono">{typeof m.contextLength === 'number' ? m.contextLength.toLocaleString() : '—'}</td>
                          <td className="px-4 py-3 text-sm">{m.updatedAt ? new Date(m.updatedAt).toLocaleString() : '—'}</td>
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

