'use client'

import React from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DynamicViewRenderer } from '@/components/views/DynamicViewRenderer'
import type { ViewModel, ViewRuntimeConfig, WidgetInstanceNode } from '@starships/protocol'
import { DesignWidgetTreeRenderer } from './DesignWidgetTreeRenderer'

export function DesignCanvas(props: {
  mode: 'design' | 'preview'
  view: ViewModel | null
  draftRoot: WidgetInstanceNode
  draftRuntimeConfig: ViewRuntimeConfig
  selectedId: string
  onSelect: (id: string) => void
}) {
  const { mode, view, draftRoot, draftRuntimeConfig, selectedId, onSelect } = props
  const [hoveredId, setHoveredId] = React.useState<string | null>(null)

  return (
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
          <DesignWidgetTreeRenderer node={draftRoot} selectedId={selectedId} hoveredId={hoveredId} onHover={setHoveredId} onSelect={onSelect} />
        )}
      </CardContent>
    </Card>
  )
}

