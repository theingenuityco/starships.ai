'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useHotkeys } from 'react-hotkeys-hook'
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'

import Icon from '@/components/primitives/Icon'
import { Button } from '@/components/ui/button'
import type { ViewModel, WidgetInstanceNode } from '@starships/protocol'
import { useUpdateView } from '@/hooks/useViews'
import { generateId } from '@/lib/utils'
import { WIDGET_CATALOG_BY_TYPE, getWidgetCatalogEntry } from '@/components/widgets/widgetCatalog'
import { toast } from 'sonner'

import { DesignCanvas } from './DesignCanvas'
import { InspectorPanel } from './InspectorPanel/InspectorPanel'
import { LeftSidebarPanel } from './LeftSidebarPanel'
import { useViewEditorStore } from './store/viewEditorStore'
import { countNodes, findNode, getChildIndex, getParentId, maxDepth } from './treeOps'

const WIDGET_INSTANCE_ID_RE = /^[a-z0-9_-]{10,30}$/i

function makeId(): string {
  // Match server-side IdSchema: 10-30 chars, url-safe (nanoid-like).
  let id = String(generateId() || '').trim()
  if (id.length > 30) id = id.slice(0, 30)
  if (id.length < 10) id = id.padEnd(10, '0')
  if (WIDGET_INSTANCE_ID_RE.test(id)) return id

  id = id.replace(/[^a-z0-9_-]/gi, '')
  if (id.length > 30) id = id.slice(0, 30)
  if (id.length < 10) id = (id + String(generateId() || '')).replace(/[^a-z0-9_-]/gi, '').slice(0, 10).padEnd(10, '0')
  return id || '0000000000'
}

export function ViewEditorShell(props: { slug: string; viewId: string; view: ViewModel }) {
  const { slug, viewId, view } = props
  const router = useRouter()
  const updateView = useUpdateView(viewId)

  const mode = useViewEditorStore(s => s.mode)
  const draftRoot = useViewEditorStore(s => s.draftRoot)
  const draftRuntimeConfig = useViewEditorStore(s => s.draftRuntimeConfig)
  const selectedId = useViewEditorStore(s => s.selectedId)
  const dirty = useViewEditorStore(s => s.dirty)
  const canUndo = useViewEditorStore(s => s.historyPast.length > 0)
  const canRedo = useViewEditorStore(s => s.historyFuture.length > 0)

  const initFromView = useViewEditorStore(s => s.initFromView)
  const setMode = useViewEditorStore(s => s.setMode)
  const setSelectedId = useViewEditorStore(s => s.setSelectedId)
  const undo = useViewEditorStore(s => s.undo)
  const redo = useViewEditorStore(s => s.redo)
  const markSaved = useViewEditorStore(s => s.markSaved)

  const setSelectedType = useViewEditorStore(s => s.setSelectedType)
  const setSelectedProp = useViewEditorStore(s => s.setSelectedProp)
  const setSelectedPropsFromJson = useViewEditorStore(s => s.setSelectedPropsFromJson)
  const setSelectedBinding = useViewEditorStore(s => s.setSelectedBinding)
  const setSelectedHandler = useViewEditorStore(s => s.setSelectedHandler)
  const setSelectedActionsHandlerFromJson = useViewEditorStore(s => s.setSelectedActionsHandlerFromJson)
  const ensureScript = useViewEditorStore(s => s.ensureScript)
  const upsertScript = useViewEditorStore(s => s.upsertScript)
  const insertChild = useViewEditorStore(s => s.insertChild)
  const moveExistingNode = useViewEditorStore(s => s.moveExistingNode)
  const reorderChildren = useViewEditorStore(s => s.reorderChildren)
  const deleteSelected = useViewEditorStore(s => s.deleteSelected)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const [activeDrag, setActiveDrag] = React.useState<{ kind: 'new'; widgetType: string } | { kind: 'existing'; nodeId: string } | null>(null)

  React.useEffect(() => {
    if (!view?.root) return
    initFromView(view)
  }, [view?.id, initFromView])

  useHotkeys(
    'mod+z',
    (e) => {
      e.preventDefault()
      if (canUndo) undo()
    },
    { enableOnFormTags: true },
    [canUndo, undo]
  )

  useHotkeys(
    'mod+shift+z',
    (e) => {
      e.preventDefault()
      if (canRedo) redo()
    },
    { enableOnFormTags: true },
    [canRedo, redo]
  )

  useHotkeys(
    'backspace,delete',
    (e) => {
      const target = e.target as any
      const tag = typeof target?.tagName === 'string' ? target.tagName.toLowerCase() : ''
      const isEditable = tag === 'input' || tag === 'textarea' || Boolean(target?.isContentEditable)
      if (isEditable) return
      e.preventDefault()
      deleteSelected()
    },
    {},
    [deleteSelected]
  )

  const selectedNode = React.useMemo(() => (draftRoot && selectedId ? findNode(draftRoot, selectedId) : null), [draftRoot, selectedId])

  const propsJson = React.useMemo(() => {
    try {
      return JSON.stringify(selectedNode?.props ?? {}, null, 2)
    } catch {
      return '{}'
    }
  }, [selectedNode?.id])

  function cloneDefaults<T>(v: T): T {
    const sc = (globalThis as any).structuredClone as undefined | ((x: any) => any)
    if (typeof sc === 'function') return sc(v)
    return JSON.parse(JSON.stringify(v)) as T
  }

  function onDragStart(ev: DragStartEvent) {
    const data = ev.active.data.current as any
    if (data?.kind === 'new' && typeof data.widgetType === 'string') {
      setActiveDrag({ kind: 'new', widgetType: data.widgetType })
      return
    }
    if (data?.kind === 'existing' && typeof data.nodeId === 'string') {
      setActiveDrag({ kind: 'existing', nodeId: data.nodeId })
    }
  }

  function onDragEnd(ev: DragEndEvent) {
    const data = ev.active.data.current as any
    const overData = ev.over?.data.current as any

    try {
      if (data?.kind === 'new' && typeof data.widgetType === 'string' && draftRoot) {
        const widgetType = String(data.widgetType)
        const meta = getWidgetCatalogEntry(widgetType)
        const child: WidgetInstanceNode = {
          id: makeId(),
          type: widgetType,
          props: cloneDefaults(meta?.defaultProps ?? {}),
          ...(meta?.acceptsChildren ? { children: [] } : null),
        }

        // Preferred: drop directly onto a container droppable.
        if (overData?.kind === 'container') {
          const parentId = String(overData.nodeId || '')
          if (!parentId) return
          insertChild(parentId, child)
          return
        }

        // Common case: we are "over" an existing node (sortable droppable).
        if (overData?.kind === 'existing' && typeof overData.nodeId === 'string') {
          const overNodeId = String(overData.nodeId || '')
          if (!overNodeId) return

          const overNode = findNode(draftRoot, overNodeId)
          const overMeta = getWidgetCatalogEntry(overNode?.type)

          // If the node under cursor is a container, append into it.
          if (overNode && (overMeta?.acceptsChildren ?? Array.isArray(overNode.children))) {
            insertChild(overNodeId, child)
            return
          }

          // Otherwise insert into its parent, before the hovered node.
          const parentId = getParentId(draftRoot, overNodeId)
          if (!parentId) return
          const idx = getChildIndex(draftRoot, parentId, overNodeId)
          insertChild(parentId, child, idx >= 0 ? idx : undefined)
          return
        }

        // If we couldn't resolve a target, ignore.
        return
      }

      if (data?.kind === 'existing' && typeof data.nodeId === 'string' && draftRoot) {
        const nodeId = String(data.nodeId)
        if (String(draftRoot.id) === nodeId) return

        // Drop onto a container: append.
        if (overData?.kind === 'container') {
          const toParentId = String(overData.nodeId || '')
          if (!toParentId) return
          const parent = findNode(draftRoot, toParentId)
          const toIndex = Array.isArray(parent?.children) ? parent!.children!.length : 0
          moveExistingNode(nodeId, toParentId, toIndex)
          return
        }

        // Drop onto another node: insert before that node in its parent (or reorder within same parent).
        if (overData?.kind === 'existing' && typeof overData.nodeId === 'string') {
          const overNodeId = String(overData.nodeId)
          if (!overNodeId) return
          const toParentId = getParentId(draftRoot, overNodeId)
          if (!toParentId) return

          const fromParentId = getParentId(draftRoot, nodeId)
          const toIndex = getChildIndex(draftRoot, toParentId, overNodeId)
          if (toIndex < 0) return

          if (fromParentId && String(fromParentId) === String(toParentId)) {
            const fromIndex = getChildIndex(draftRoot, toParentId, nodeId)
            if (fromIndex < 0) return
            reorderChildren(toParentId, fromIndex, toIndex)
            return
          }

          moveExistingNode(nodeId, toParentId, toIndex)
          return
        }
      }
    } finally {
      setActiveDrag(null)
    }
  }

  function onDragCancel() {
    setActiveDrag(null)
  }

  async function onSave() {
    if (!draftRoot) return
    const errors: string[] = []
    try {
      const n = countNodes(draftRoot)
      const d = maxDepth(draftRoot)
      if (n > 2000) errors.push(`Too many nodes (${n}). Max is 2000.`)
      if (d > 32) errors.push(`View tree too deep (${d}). Max depth is 32.`)

      const stack: WidgetInstanceNode[] = [draftRoot]
      while (stack.length) {
        const cur = stack.pop()!
        if (!WIDGET_CATALOG_BY_TYPE[cur.type]) errors.push(`Unknown widget type: ${cur.type}`)
        const children = Array.isArray(cur.children) ? cur.children : []
        const meta = getWidgetCatalogEntry(cur.type)
        if (children.length && meta && !meta.acceptsChildren) {
          errors.push(`Widget type ${cur.type} cannot have children (node ${String(cur.id).slice(0, 10)}).`)
        }
        for (const c of children) stack.push(c)
      }
    } catch {
      errors.push('Failed to validate view tree.')
    }
    if (errors.length) {
      toast.error('Cannot save view', { description: errors.slice(0, 4).join('\n') })
      return
    }
    await updateView.mutateAsync({ root: draftRoot as any, runtimeConfig: draftRuntimeConfig as any, version: view?.version })
    markSaved()
  }

  const headerHref = `/ship/${encodeURIComponent(slug)}/views/${encodeURIComponent(viewId)}`

  if (!draftRoot) {
    return (
      <div className="flex items-center justify-center py-10">
        <p className="text-sm text-muted-foreground">View not found.</p>
      </div>
    )
  }

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-col">
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
                <div className="text-xs text-muted-foreground truncate">
                  {view?.name ?? viewId}
                  {dirty ? <span className="ml-2 text-[11px] text-primary">• unsaved</span> : null}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => undo()} disabled={!canUndo} title="Undo (Cmd/Ctrl+Z)">
                <Icon name="rotate-ccw" className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => redo()} disabled={!canRedo} title="Redo (Shift+Cmd/Ctrl+Z)">
                <Icon name="repeat" className="h-4 w-4" />
              </Button>
              <Button variant={mode === 'design' ? 'default' : 'outline'} size="sm" onClick={() => setMode('design')} disabled={mode === 'design'}>
                Design
              </Button>
              <Button variant={mode === 'preview' ? 'default' : 'outline'} size="sm" onClick={() => setMode('preview')} disabled={mode === 'preview'}>
                Preview
              </Button>
              <Button onClick={onSave} size="sm" disabled={!draftRoot || updateView.isPending || !dirty}>
                <Icon name="save" className="h-4 w-4 mr-1.5" />
                Save
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden px-4 py-4">
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={onDragCancel}>
          <div className="h-full grid grid-cols-12 gap-4 min-h-0">
            <div className="col-span-3 min-h-0">
              <LeftSidebarPanel root={draftRoot} selectedId={selectedId} onSelect={setSelectedId} />
            </div>

            <div className="col-span-6 min-h-0">
              <DesignCanvas
                mode={mode}
                view={view}
                draftRoot={draftRoot}
                draftRuntimeConfig={draftRuntimeConfig}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            </div>

            <div className="col-span-3 min-h-0">
              <InspectorPanel
                selectedNode={selectedNode}
                propsJson={propsJson}
                onChangeSelectedType={setSelectedType}
                onChangeSelectedPropsJson={setSelectedPropsFromJson}
                onSetProp={setSelectedProp}
                runtimeConfig={draftRuntimeConfig}
                onSetBinding={setSelectedBinding}
                onSetHandler={setSelectedHandler}
                onSetActionsHandlerJson={setSelectedActionsHandlerFromJson}
                onEnsureScript={ensureScript}
                onUpsertScript={upsertScript}
                onOpenView={() => router.push(headerHref)}
              />
            </div>
          </div>

          <DragOverlay>
            {activeDrag?.kind === 'new' ? (
              <div className="rounded-md border border-border/60 bg-card px-3 py-2 text-sm shadow-md">
                Add <span className="font-mono">{activeDrag.widgetType}</span>
              </div>
            ) : activeDrag?.kind === 'existing' ? (
              <div className="rounded-md border border-border/60 bg-card px-3 py-2 text-sm shadow-md">
                Move <span className="font-mono">{String(activeDrag.nodeId).slice(0, 10)}</span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  )
}

