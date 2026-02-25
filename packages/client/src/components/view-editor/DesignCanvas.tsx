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
    <Card className="h-full min-h-0 border-border/60 flex flex-col">
      <CardHeader className="pb-3 shrink-0">
        <CardTitle className="text-sm">{mode === 'preview' ? 'Preview' : 'Canvas'}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 flex-1 min-h-0 overflow-hidden">
        {mode === 'preview' ? (
          view ? (
            <div className="h-full min-h-0 overflow-hidden">
              <DynamicViewRenderer view={{ ...view, root: draftRoot, runtimeConfig: draftRuntimeConfig }} />
            </div>
          ) : (
            <div className="py-6 text-sm text-muted-foreground">Preview unavailable (view not loaded).</div>
          )
        ) : (
          <div className="h-full min-h-0 overflow-auto">
            <DesignWidgetTreeRenderer node={draftRoot} selectedId={selectedId} hoveredId={hoveredId} onHover={setHoveredId} onSelect={onSelect} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

