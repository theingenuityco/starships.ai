'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import type { WidgetInstanceNode } from '@starships/protocol'
import { WIDGET_REGISTRY } from '@/components/widgets/widgetRegistry'
import { getWidgetDefinition } from '@/components/widgets/widgetDefinitions'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import Icon from '@/components/primitives/Icon'

function UnknownWidgetType(props: { type: string }) {
  return (
    <div className="p-4 border border-red-500 rounded-lg bg-red-50 dark:bg-red-950/20">
      <p className="text-sm text-red-600 dark:text-red-400">Unknown widget type: {props.type}</p>
      <p className="text-xs text-muted-foreground mt-1">Available: {Object.keys(WIDGET_REGISTRY).join(', ')}</p>
    </div>
  )
}

export function DesignWidgetTreeRenderer(props: {
  node: WidgetInstanceNode
  selectedId: string
  hoveredId: string | null
  onHover: (id: string | null) => void
  onSelect: (id: string) => void
}) {
  const { node, selectedId, hoveredId, onHover, onSelect } = props
  const Component = WIDGET_REGISTRY[node.type]
  if (!Component) return <UnknownWidgetType type={node.type} />

  const children = Array.isArray(node.children) ? node.children : []
  const acceptsChildren = getWidgetDefinition(node.type)?.acceptsChildren ?? children.length > 0

  const isSelected = String(node.id) === String(selectedId)
  const isHovered = String(node.id) === String(hoveredId)

  const sortableId = `node:${String(node.id)}`
  const sortable = useSortable({
    id: sortableId,
    data: { kind: 'existing', nodeId: String(node.id) },
  })

  const containerDropId = `container:${String(node.id)}`
  const containerDrop = useDroppable({
    id: containerDropId,
    disabled: !acceptsChildren,
    data: { kind: 'container', nodeId: String(node.id) },
  })

  const setNodeRef = sortable.setNodeRef

  const style = {
    transform: sortable.transform ? CSS.Transform.toString(sortable.transform) : undefined,
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.6 : undefined,
  } as React.CSSProperties

  const safeProps: Record<string, unknown> = node.props && typeof node.props === 'object' && !Array.isArray(node.props) ? (node.props as any) : {}

  const renderedChildren = children.length
    ? [
        <SortableContext key="__sortable_ctx__" items={children.map(c => `node:${String(c.id)}`)} strategy={rectSortingStrategy}>
          {children.map(child => (
            <DesignWidgetTreeRenderer
              key={child.id}
              node={child}
              selectedId={selectedId}
              hoveredId={hoveredId}
              onHover={onHover}
              onSelect={onSelect}
            />
          ))}
        </SortableContext>,
      ]
    : acceptsChildren
      ? [
          <div
            key="__empty__"
            className="my-2 rounded-md border border-dashed border-border/70 bg-muted/20 px-3 py-3 text-xs text-muted-foreground"
          >
            Drop widgets here
          </div>,
        ]
      : undefined

  return (
    <div
      ref={setNodeRef}
      data-node-id={String(node.id)}
      className={cn(
        'relative rounded-md',
        isSelected ? 'ring-2 ring-primary/60' : isHovered || containerDrop.isOver ? 'ring-1 ring-border/80' : 'ring-0',
        containerDrop.isOver ? 'bg-primary/[0.03]' : null
      )}
      style={style}
      onMouseEnter={() => onHover(String(node.id))}
      onMouseLeave={() => onHover(null)}
      onClickCapture={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onSelect(String(node.id))
      }}
    >
      {/* Separate droppable surface for container inserts (prevents id conflicts with sortable drops). */}
      <div ref={containerDrop.setNodeRef} className="pointer-events-none absolute inset-0" />

      <button
        ref={sortable.setActivatorNodeRef}
        type="button"
        className="absolute top-1 right-1 z-10 rounded border border-border/60 bg-card/90 p-1 text-muted-foreground hover:text-foreground"
        onClickCapture={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
        {...sortable.listeners}
        {...sortable.attributes}
        title="Drag"
      >
        <Icon name="dots-vertical" className="h-3.5 w-3.5" />
      </button>

      <div
        className={cn(
          'pointer-events-none absolute -top-2 left-2 z-10 rounded border border-border/60 bg-card px-2 py-0.5 text-[10px] font-mono text-muted-foreground shadow-sm',
          isSelected ? 'text-foreground' : null
        )}
      >
        {node.type}
      </div>

      {/* Inner padding keeps the outline away from widget edges */}
      <div className="p-1">
        <Component {...(safeProps as any)}>{renderedChildren}</Component>
      </div>
    </div>
  )
}

