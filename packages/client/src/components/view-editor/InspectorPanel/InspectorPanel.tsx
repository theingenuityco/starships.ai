'use client'

import React from 'react'
import dynamic from 'next/dynamic'

import Icon from '@/components/primitives/Icon'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getAtPath } from '@/lib/objectPath'
import { getWidgetCatalogEntry, type WidgetField } from '@/components/widgets/widgetCatalog'
import type { BindingSpec, HandlerSpec, ViewRuntimeActionRequest, ViewRuntimeConfig, WidgetInstanceNode } from '@starships/protocol'

const MonacoEditor = dynamic(() => import('@monaco-editor/react').then(m => m.default), {
  ssr: false,
  loading: () => <div className="h-[240px] w-full rounded-md bg-muted/20" />,
})

export function InspectorPanel(props: {
  selectedNode: WidgetInstanceNode | null
  propsJson: string
  onChangeSelectedType: (nextType: string) => void
  onChangeSelectedPropsJson: (nextJson: string) => void
  onSetProp: (path: string, value: unknown) => void
  runtimeConfig: ViewRuntimeConfig
  onSetBinding: (propPath: string, spec: BindingSpec | null) => void
  onSetHandler: (eventName: string, spec: HandlerSpec | null) => void
  onSetActionsHandlerJson: (eventName: string, json: string) => void
  onEnsureScript: (scriptId: string) => void
  onUpsertScript: (scriptId: string, source: string) => void
  onOpenView: () => void
}) {
  const {
    selectedNode,
    propsJson,
    onChangeSelectedType,
    onChangeSelectedPropsJson,
    onSetProp,
    runtimeConfig,
    onSetBinding,
    onSetHandler,
    onSetActionsHandlerJson,
    onEnsureScript,
    onUpsertScript,
    onOpenView,
  } = props

  const widget = React.useMemo(() => getWidgetCatalogEntry(selectedNode?.type), [selectedNode?.type])
  const fields = widget?.fields ?? []
  const events = widget?.events ?? []

  const [newBindingPropPath, setNewBindingPropPath] = React.useState('')
  const [newBindingKind, setNewBindingKind] = React.useState<'state' | 'query'>('state')
  const [newBindingStatePath, setNewBindingStatePath] = React.useState('')
  const [newBindingQueryId, setNewBindingQueryId] = React.useState('')
  const [newBindingQueryPath, setNewBindingQueryPath] = React.useState('')

  const [actionsJsonDraft, setActionsJsonDraft] = React.useState<Record<string, string>>({})
  const [scriptDraftByEvent, setScriptDraftByEvent] = React.useState<Record<string, { scriptId: string; entrypoint: string; source: string }>>({})

  // Reset event-specific drafts when selection changes.
  React.useEffect(() => {
    setActionsJsonDraft({})
    setScriptDraftByEvent({})
  }, [selectedNode?.id])

  function defaultScriptId(eventName: string): string {
    const base = String(selectedNode?.id ?? 'node')
      .slice(0, 10)
      .replace(/[^a-z0-9_-]/gi, '')
    const ev = String(eventName || 'event').replace(/[^a-z0-9_-]/gi, '_')
    return `script_${base}_${ev}`.slice(0, 30)
  }

  function getExistingHandler(eventName: string): HandlerSpec | null {
    const h = selectedNode?.handlers && typeof selectedNode.handlers === 'object' && !Array.isArray(selectedNode.handlers) ? (selectedNode.handlers as any) : null
    const v = h ? h[eventName] : null
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null
    return v as HandlerSpec
  }

  function renderField(field: WidgetField) {
    const raw = getAtPath(selectedNode?.props ?? {}, field.path)

    if (field.kind === 'string') {
      return (
        <div key={field.path} className="flex flex-col gap-2">
          <label className="text-xs font-medium">{field.label}</label>
          <Input value={raw == null ? '' : String(raw)} placeholder={field.placeholder} onChange={e => onSetProp(field.path, e.target.value)} />
        </div>
      )
    }

    if (field.kind === 'textarea') {
      return (
        <div key={field.path} className="flex flex-col gap-2">
          <label className="text-xs font-medium">{field.label}</label>
          <Textarea value={raw == null ? '' : String(raw)} placeholder={field.placeholder} rows={field.rows ?? 4} onChange={e => onSetProp(field.path, e.target.value)} />
        </div>
      )
    }

    if (field.kind === 'number') {
      const v = typeof raw === 'number' ? raw : raw == null || raw === '' ? '' : Number(raw)
      return (
        <div key={field.path} className="flex flex-col gap-2">
          <label className="text-xs font-medium">{field.label}</label>
          <Input
            type="number"
            value={Number.isFinite(v as any) ? String(v) : v === '' ? '' : ''}
            min={field.min}
            max={field.max}
            step={field.step}
            onChange={e => {
              const next = e.target.value
              if (next === '') return onSetProp(field.path, undefined)
              const n = Number(next)
              if (Number.isFinite(n)) onSetProp(field.path, n)
            }}
          />
        </div>
      )
    }

    if (field.kind === 'boolean') {
      return (
        <div key={field.path} className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2">
          <div className="min-w-0">
            <div className="text-xs font-medium">{field.label}</div>
            <div className="text-[11px] text-muted-foreground">{field.path}</div>
          </div>
          <Switch checked={Boolean(raw)} onCheckedChange={checked => onSetProp(field.path, checked)} />
        </div>
      )
    }

    if (field.kind === 'select') {
      const hasDefault = field.options.some(o => o.value === '__default__')
      const cur = raw == null ? (hasDefault ? '__default__' : '') : String(raw)
      return (
        <div key={field.path} className="flex flex-col gap-2">
          <label className="text-xs font-medium">{field.label}</label>
          <Select
            value={cur}
            onValueChange={val => {
              if (val === '' || val === '__default__') return onSetProp(field.path, undefined)
              onSetProp(field.path, val)
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              {field.options.map(o => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )
    }

    return null
  }

  return (
    <Card className="h-full min-h-0 border-border/60 flex flex-col">
      <CardHeader className="pb-3 shrink-0">
        <CardTitle className="text-sm">Inspector</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 flex-1 min-h-0 overflow-auto flex flex-col gap-3">
        {!selectedNode ? (
          <div className="py-6 text-sm text-muted-foreground">Select a node to edit.</div>
        ) : (
          <>
            <div className="text-xs text-muted-foreground">
              Selected: <code className="font-mono">{selectedNode?.id ?? '—'}</code>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium">Type</label>
              <Input value={selectedNode?.type ?? ''} onChange={e => onChangeSelectedType(e.target.value)} />
            </div>

            <Tabs defaultValue="props" className="w-full">
              <TabsList className="w-full justify-start">
                <TabsTrigger value="props">Props</TabsTrigger>
                <TabsTrigger value="bindings">Bindings</TabsTrigger>
                <TabsTrigger value="events">Events</TabsTrigger>
                <TabsTrigger value="advanced">Advanced</TabsTrigger>
              </TabsList>

              <TabsContent value="props">
                {widget ? (
                  <div className="flex flex-col gap-3">
                    <div className="text-[11px] text-muted-foreground">
                      {widget.label} • <span className="font-mono">{widget.type}</span>
                    </div>
                    {fields.length ? fields.map(renderField) : <div className="text-sm text-muted-foreground">No editable fields defined yet.</div>}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">No structured editor yet for this widget. Use Advanced JSON.</div>
                )}
              </TabsContent>

              <TabsContent value="bindings">
                <div className="flex flex-col gap-3">
                  <div className="text-[11px] text-muted-foreground">
                    Bindings override props at runtime. Keyed by a dot-path into props (e.g. <span className="font-mono">title</span> or <span className="font-mono">data.rows</span>).
                  </div>

                  <div className="flex flex-col gap-2">
                    {(selectedNode?.bindings && typeof selectedNode.bindings === 'object' && !Array.isArray(selectedNode.bindings)
                      ? Object.entries(selectedNode.bindings as Record<string, any>)
                      : []
                    ).map(([propPath, spec]) => (
                      <div key={propPath} className="rounded-md border border-border/60 px-3 py-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-xs font-medium font-mono truncate">{propPath}</div>
                            <pre className="mt-1 text-[11px] text-muted-foreground overflow-auto">{JSON.stringify(spec, null, 2)}</pre>
                          </div>
                          <Button variant="outline" size="sm" onClick={() => onSetBinding(propPath, null)}>
                            <Icon name="trash" className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {!selectedNode?.bindings || !Object.keys(selectedNode.bindings as any).length ? <div className="text-sm text-muted-foreground">No bindings.</div> : null}
                  </div>

                  <div className="rounded-md border border-border/60 p-3 flex flex-col gap-3">
                    <div className="text-xs font-medium">Add binding</div>
                    <div className="flex flex-col gap-2">
                      <label className="text-[11px] text-muted-foreground">Prop path</label>
                      <Input value={newBindingPropPath} onChange={e => setNewBindingPropPath(e.target.value)} placeholder="e.g. text" />
                    </div>

                    <div className="flex flex-col gap-2">
                      <label className="text-[11px] text-muted-foreground">Kind</label>
                      <Select value={newBindingKind} onValueChange={v => setNewBindingKind(v === 'query' ? 'query' : 'state')}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="state">state</SelectItem>
                          <SelectItem value="query">query</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {newBindingKind === 'state' ? (
                      <div className="flex flex-col gap-2">
                        <label className="text-[11px] text-muted-foreground">State path</label>
                        <Input value={newBindingStatePath} onChange={e => setNewBindingStatePath(e.target.value)} placeholder="e.g. user.name" />
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-col gap-2">
                          <label className="text-[11px] text-muted-foreground">Query id</label>
                          <Input value={newBindingQueryId} onChange={e => setNewBindingQueryId(e.target.value)} placeholder="e.g. q_users" />
                          <div className="text-[11px] text-muted-foreground">
                            Known: {Object.keys(runtimeConfig?.queries ?? {}).length ? Object.keys(runtimeConfig?.queries ?? {}).join(', ') : '—'}
                          </div>
                        </div>
                        <div className="flex flex-col gap-2">
                          <label className="text-[11px] text-muted-foreground">Optional query path</label>
                          <Input value={newBindingQueryPath} onChange={e => setNewBindingQueryPath(e.target.value)} placeholder="e.g. data.rows" />
                        </div>
                      </>
                    )}

                    <Button
                      size="sm"
                      onClick={() => {
                        const propPath = newBindingPropPath.trim()
                        if (!propPath) return
                        const spec: BindingSpec =
                          newBindingKind === 'state'
                            ? { kind: 'state', path: newBindingStatePath.trim() }
                            : { kind: 'query', queryId: newBindingQueryId.trim(), ...(newBindingQueryPath.trim() ? { path: newBindingQueryPath.trim() } : null) }
                        onSetBinding(propPath, spec)
                        setNewBindingPropPath('')
                        setNewBindingStatePath('')
                        setNewBindingQueryId('')
                        setNewBindingQueryPath('')
                      }}
                    >
                      Add binding
                    </Button>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="events">
                <div className="flex flex-col gap-3">
                  {!events.length ? (
                    <div className="text-sm text-muted-foreground">No events defined for this widget yet.</div>
                  ) : (
                    events.map(eventName => {
                      const cur = getExistingHandler(eventName)
                      const kind = cur?.kind === 'actions' || cur?.kind === 'script' ? cur.kind : 'none'

                      const actions = kind === 'actions' ? (((cur as any).actions as ViewRuntimeActionRequest[]) ?? []) : []
                      const defaultActionsJson = JSON.stringify(actions, null, 2)
                      const actionsJson = actionsJsonDraft[eventName] ?? defaultActionsJson

                      const scriptId = kind === 'script' ? String((cur as any).scriptId || '') : ''
                      const entrypoint = kind === 'script' ? String((cur as any).entrypoint || '') : ''
                      const script = scriptId ? (runtimeConfig?.scripts?.[scriptId] as any) : null
                      const source = typeof script?.source === 'string' ? script.source : ''

                      const draft = scriptDraftByEvent[eventName] ?? { scriptId: scriptId || defaultScriptId(eventName), entrypoint: entrypoint || '', source }

                      return (
                        <div key={eventName} className="rounded-md border border-border/60 p-3 flex flex-col gap-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-xs font-medium">
                              Event: <span className="font-mono">{eventName}</span>
                            </div>
                            <Select
                              value={kind}
                              onValueChange={v => {
                                if (v === 'none') return onSetHandler(eventName, null)
                                if (v === 'actions') return onSetHandler(eventName, { kind: 'actions', actions: [] })
                                if (v === 'script') {
                                  const sid = defaultScriptId(eventName)
                                  onEnsureScript(sid)
                                  return onSetHandler(eventName, { kind: 'script', scriptId: sid })
                                }
                              }}
                            >
                              <SelectTrigger className="w-[160px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">none</SelectItem>
                                <SelectItem value="actions">actions</SelectItem>
                                <SelectItem value="script">script</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {kind === 'actions' ? (
                            <div className="flex flex-col gap-2">
                              <label className="text-[11px] text-muted-foreground">Actions (JSON array)</label>
                              <Textarea
                                value={actionsJson}
                                onChange={e => setActionsJsonDraft(s => ({ ...s, [eventName]: e.target.value }))}
                                onBlur={() => onSetActionsHandlerJson(eventName, actionsJsonDraft[eventName] ?? defaultActionsJson)}
                                className="font-mono text-xs min-h-[160px]"
                              />
                              <div className="text-[11px] text-muted-foreground">
                                Supported action types: <span className="font-mono">set_state</span>, <span className="font-mono">run_workflow</span>, <span className="font-mono">patch_props</span>,{' '}
                                <span className="font-mono">patch_root</span>.
                              </div>
                            </div>
                          ) : null}

                          {kind === 'script' ? (
                            <div className="flex flex-col gap-3">
                              <div className="grid grid-cols-2 gap-2">
                                <div className="flex flex-col gap-2">
                                  <label className="text-[11px] text-muted-foreground">Script id</label>
                                  <Input
                                    value={draft.scriptId}
                                    onChange={e =>
                                      setScriptDraftByEvent(s => ({
                                        ...s,
                                        [eventName]: { ...draft, scriptId: e.target.value },
                                      }))
                                    }
                                  />
                                </div>
                                <div className="flex flex-col gap-2">
                                  <label className="text-[11px] text-muted-foreground">Entrypoint (optional)</label>
                                  <Input
                                    value={draft.entrypoint}
                                    onChange={e =>
                                      setScriptDraftByEvent(s => ({
                                        ...s,
                                        [eventName]: { ...draft, entrypoint: e.target.value },
                                      }))
                                    }
                                    placeholder="e.g. onClick"
                                  />
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    const sid = draft.scriptId.trim()
                                    if (!sid) return
                                    onEnsureScript(sid)
                                    onSetHandler(eventName, {
                                      kind: 'script',
                                      scriptId: sid,
                                      ...(draft.entrypoint.trim() ? { entrypoint: draft.entrypoint.trim() } : null),
                                    })
                                  }}
                                >
                                  Apply handler
                                </Button>
                                <div className="text-[11px] text-muted-foreground">Script source is stored in view runtime config.</div>
                              </div>

                              <div className="flex flex-col gap-2">
                                <label className="text-[11px] text-muted-foreground">Script source</label>
                                <div className="rounded-md border border-border/60 overflow-hidden">
                                  <MonacoEditor
                                    height="240px"
                                    defaultLanguage="javascript"
                                    value={draft.source}
                                    onChange={v =>
                                      setScriptDraftByEvent(s => ({
                                        ...s,
                                        [eventName]: { ...draft, source: String(v ?? '') },
                                      }))
                                    }
                                    options={{
                                      minimap: { enabled: false },
                                      fontSize: 12,
                                      scrollBeyondLastLine: false,
                                    }}
                                  />
                                </div>
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    const sid = draft.scriptId.trim()
                                    if (!sid) return
                                    onUpsertScript(sid, draft.source)
                                  }}
                                >
                                  Save script
                                </Button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      )
                    })
                  )}
                </div>
              </TabsContent>

              <TabsContent value="advanced">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-medium">Props (JSON)</label>
                  <Textarea value={propsJson} onChange={e => onChangeSelectedPropsJson(e.target.value)} className="font-mono text-xs min-h-[280px]" />
                  <div className="text-[11px] text-muted-foreground">Tip: widget type is the node’s `type` string from the catalog.</div>
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}

        <div className="flex flex-col gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onOpenView}>
            Open view
            <Icon name="chevron-right" className="h-4 w-4 ml-1.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
