'use client'

import React from 'react'

import Icon from '@/components/primitives/Icon'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { WidgetInstanceNode } from '@starships/protocol'

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

export function ViewTreePanel(props: {
  root: WidgetInstanceNode
  selectedId: string
  onSelect: (id: string) => void
  onAddChild: () => void
  onDeleteSelected: () => void
  disableDelete: boolean
}) {
  const { root, selectedId, onSelect, onAddChild, onDeleteSelected, disableDelete } = props

  return (
    <Card className="h-full border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Tree</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 min-h-0 overflow-auto flex flex-col gap-2">
        <TreeNode node={root} selectedId={selectedId} onSelect={onSelect} />
        <div className="pt-2 flex flex-col gap-2">
          <Button variant="outline" size="sm" onClick={onAddChild}>
            <Icon name="plus" className="h-4 w-4 mr-1.5" />
            Add child
          </Button>
          <Button variant="outline" size="sm" onClick={onDeleteSelected} disabled={disableDelete}>
            <Icon name="trash" className="h-4 w-4 mr-1.5" />
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

