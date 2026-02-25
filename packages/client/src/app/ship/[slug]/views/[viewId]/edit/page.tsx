'use client'

import React from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'

import Icon from '@/components/primitives/Icon'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { WidgetTreeRenderer } from '@/components/widgets'
import { DynamicViewRenderer } from '@/components/views/DynamicViewRenderer'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { useUpdateView, useView } from '@/hooks/useViews'
import { generateId } from '@/lib/utils'
import type { ViewRuntimeConfig, WidgetInstanceNode } from '@starships/protocol'

const WIDGET_INSTANCE_ID_RE = /^[a-z0-9_-]{10,30}$/i

function makeId(): string {
  // Match server-side IdSchema: 10-30 chars, url-safe (nanoid-like).
  // `generateId()` already yields lowercase base36 + timestamp; clamp just in case.
  let id = String(generateId() || '').trim()
  if (id.length > 30) id = id.slice(0, 30)
  if (id.length < 10) id = id.padEnd(10, '0')
  if (WIDGET_INSTANCE_ID_RE.test(id)) return id

  // Fallback: strip any unexpected chars and re-clamp.
  id = id.replace(/[^a-z0-9_-]/gi, '')
  if (id.length > 30) id = id.slice(0, 30)
  if (id.length < 10) id = (id + String(generateId() || '')).replace(/[^a-z0-9_-]/gi, '').slice(0, 10).padEnd(10, '0')
  return id || '0000000000'
}

function findNode(root: WidgetInstanceNode, id: string): WidgetInstanceNode | null {
  if (!root || !id) return null
  if (String(root.id) === String(id)) return root
  const children = Array.isArray(root.children) ? root.children : []
  for (const c of children) {
    const found = findNode(c, id)
    if (found) return found
  }
  return null
}

function updateNode(root: WidgetInstanceNode, id: string, updater: (n: WidgetInstanceNode) => WidgetInstanceNode): WidgetInstanceNode {
  if (String(root.id) === String(id)) return updater(root)
  const children = Array.isArray(root.children) ? root.children : []
  if (!children.length) return root
  return {
    ...root,
    children: children.map(c => updateNode(c, id, updater)),
  }
}

function removeNode(root: WidgetInstanceNode, id: string): WidgetInstanceNode {
  const children = Array.isArray(root.children) ? root.children : []
  const nextChildren = children
    .filter(c => String(c.id) !== String(id))
    .map(c => removeNode(c, id))
  return { ...root, ...(children.length ? { children: nextChildren } : null) }
}

function TreeNode(props: { node: WidgetInstanceNode; selectedId: string; onSelect: (id: string) => void; depth?: number }) {
  const { node, selectedId, onSelect, depth = 0 } = props
  const isSelected = String(node.id) === String(selectedId)
  const children = Array.isArray(node.children) ? node.children : []
  return (
    <div className="min-w-0">
      <button
        type="button"
        className={[
          'w-full text-left rounded-md px-2 py-1 text-xs font-mono border transition-colors',
          isSelected ? 'bg-primary/10 border-primary/30 text-foreground' : 'bg-transparent border-border/40 text-muted-foreground hover:text-foreground hover:bg-muted/40',
        ].join(' ')}
        style={{ marginLeft: depth * 10 }}
        onClick={() => onSelect(String(node.id))}
        title={String(node.id)}
      >
        <span className="font-semibold">{node.type}</span>
        <span className="ml-2 opacity-70">{String(node.id).slice(0, 10)}</span>
      </button>
      {children.length ? (
        <div className="mt-1 flex flex-col gap-1">
          {children.map(c => (
            <TreeNode key={c.id} node={c} selectedId={selectedId} onSelect={onSelect} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export default function ViewEditorPage() {
  const router = useRouter()
  const { slug: slugParam, viewId: viewIdParam } = useParams<{ slug: string; viewId: string }>()
  const slug = typeof slugParam === 'string' ? slugParam : ''
  const viewId = typeof viewIdParam === 'string' ? viewIdParam : ''

  const { data: starship } = useStarshipBySlug(slug, Boolean(slug))
  void starship

  const viewQuery = useView(viewId, Boolean(viewId))
  const view = viewQuery.data
  const updateView = useUpdateView(viewId)

  const [mode, setMode] = React.useState<'design' | 'preview'>('design')
  const [draftRoot, setDraftRoot] = React.useState<WidgetInstanceNode | null>(null)
  const [draftRuntimeConfig, setDraftRuntimeConfig] = React.useState<ViewRuntimeConfig>({})
  const [selectedId, setSelectedId] = React.useState<string>('root')

  // Initialize drafts from loaded view
  React.useEffect(() => {
    if (!view?.root) return
    setDraftRoot(view.root)
    setDraftRuntimeConfig(view.runtimeConfig ?? {})
    setSelectedId(String(view.root.id || 'root'))
  }, [view?.id])

  const selectedNode = React.useMemo(() => (draftRoot && selectedId ? findNode(draftRoot, selectedId) : null), [draftRoot, selectedId])

  const propsJson = React.useMemo(() => {
    try {
      return JSON.stringify(selectedNode?.props ?? {}, null, 2)
    } catch {
      return '{}'
    }
  }, [selectedNode?.id])

  async function onSave() {
    if (!draftRoot) return
    await updateView.mutateAsync({ root: draftRoot as any, runtimeConfig: draftRuntimeConfig as any, version: view?.version })
  }

  function onAddChild() {
    if (!draftRoot || !selectedNode) return
    const child: WidgetInstanceNode = { id: makeId(), type: 'Text', props: { text: 'New node' }, children: [] }
    setDraftRoot(updateNode(draftRoot, selectedNode.id, n => ({ ...n, children: [...(Array.isArray(n.children) ? n.children : []), child] })))
  }

  function onDeleteSelected() {
    if (!draftRoot || !selectedId) return
    if (String(draftRoot.id) === String(selectedId)) return
    setDraftRoot(removeNode(draftRoot, selectedId))
    setSelectedId(String(draftRoot.id))
  }

  function onChangeSelectedType(nextType: string) {
    if (!draftRoot || !selectedNode) return
    setDraftRoot(updateNode(draftRoot, selectedNode.id, n => ({ ...n, type: nextType })))
  }

  function onChangeSelectedProps(nextJson: string) {
    if (!draftRoot || !selectedNode) return
    try {
      const parsed = JSON.parse(nextJson)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return
      setDraftRoot(updateNode(draftRoot, selectedNode.id, n => ({ ...n, props: parsed })))
    } catch {
      // ignore invalid JSON while typing
    }
  }

  const headerHref = `/ship/${encodeURIComponent(slug)}/views/${encodeURIComponent(viewId)}`

  return (
    <div className="relative flex flex-col min-h-full min-w-0">
      <div className="sticky top-0 z-10 border-b border-border/60 bg-card">
        <div className="px-4 pt-3.5 pb-2 md:py-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex items-center gap-2">
              <Button asChild variant="ghost" size="sm">
                <Link href={headerHref}>
                  <Icon name="arrow-left" className="h-4 w-4 mr-1.5" />
                  Back
                </Link>
              </Button>
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">Edit view</div>
                <div className="text-xs text-muted-foreground truncate">{view?.name ?? viewId}</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant={mode === 'design' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMode('design')}
                disabled={mode === 'design'}
              >
                Design
              </Button>
              <Button
                variant={mode === 'preview' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMode('preview')}
                disabled={mode === 'preview'}
              >
                Preview
              </Button>
              <Button onClick={onSave} size="sm" disabled={!draftRoot || updateView.isPending}>
                <Icon name="save" className="h-4 w-4 mr-1.5" />
                Save
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden px-4 py-4">
        {viewQuery.isLoading ? (
          <div className="flex items-center justify-center py-10">
            <p className="text-sm text-muted-foreground">Loading…</p>
          </div>
        ) : !draftRoot ? (
          <div className="flex items-center justify-center py-10">
            <p className="text-sm text-muted-foreground">View not found.</p>
          </div>
        ) : (
          <div className="h-full grid grid-cols-12 gap-4 min-h-0">
            <div className="col-span-3 min-h-0">
              <Card className="h-full border-border/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Tree</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 min-h-0 overflow-auto flex flex-col gap-2">
                  <TreeNode node={draftRoot} selectedId={selectedId} onSelect={setSelectedId} />
                  <div className="pt-2 flex flex-col gap-2">
                    <Button variant="outline" size="sm" onClick={onAddChild}>
                      <Icon name="plus" className="h-4 w-4 mr-1.5" />
                      Add child
                    </Button>
                    <Button variant="outline" size="sm" onClick={onDeleteSelected} disabled={String(selectedId) === String(draftRoot.id)}>
                      <Icon name="trash" className="h-4 w-4 mr-1.5" />
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="col-span-6 min-h-0">
              <Card className="h-full border-border/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">{mode === 'preview' ? 'Preview' : 'Canvas'}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 min-h-0 overflow-auto">
                  {mode === 'preview' ? (
                    view ? (
                      <DynamicViewRenderer view={{ ...view, root: draftRoot, runtimeConfig: draftRuntimeConfig }} />
                    ) : (
                      <div className="py-6 text-sm text-muted-foreground">Preview unavailable (view not loaded).</div>
                    )
                  ) : (
                    <WidgetTreeRenderer node={draftRoot} className="w-full min-w-0" />
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="col-span-3 min-h-0">
              <Card className="h-full border-border/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Inspector</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 min-h-0 overflow-auto flex flex-col gap-3">
                  <div className="text-xs text-muted-foreground">
                    Selected: <code className="font-mono">{selectedNode?.id ?? '—'}</code>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-medium">Type</label>
                    <Input value={selectedNode?.type ?? ''} onChange={e => onChangeSelectedType(e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-medium">Props (JSON)</label>
                    <Textarea value={propsJson} onChange={e => onChangeSelectedProps(e.target.value)} className="font-mono text-xs min-h-[280px]" />
                    <div className="text-[11px] text-muted-foreground">
                      Tip: primitives available: <code className="font-mono">Box</code>, <code className="font-mono">Stack</code>, <code className="font-mono">Grid</code>, <code className="font-mono">Text</code>, <code className="font-mono">Button</code>, <code className="font-mono">Tabs</code>.
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 pt-2">
                    <Button variant="outline" size="sm" onClick={() => router.push(headerHref)}>
                      Open view
                      <Icon name="chevron-right" className="h-4 w-4 ml-1.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

