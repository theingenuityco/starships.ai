'use client'

import React from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import type { WidgetInstanceNode } from '@starships/protocol'

import { WidgetPalettePanel } from './WidgetPalettePanel'
import { ViewTreePanel } from './ViewTreePanel'

export function LeftSidebarPanel(props: { root: WidgetInstanceNode; selectedId: string; onSelect: (id: string) => void }) {
  const { root, selectedId, onSelect } = props

  return (
    <Card className="h-full min-h-0 border-border/60 flex flex-col">
      <CardHeader className="pb-3 shrink-0">
        <CardTitle className="text-sm">Builder</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 flex-1 min-h-0 overflow-hidden flex flex-col gap-3">
        <div className="flex-1 min-h-0 overflow-hidden">
          <WidgetPalettePanel />
        </div>
        <Separator />
        <div className="flex-1 min-h-0 overflow-auto">
          <ViewTreePanel root={root} selectedId={selectedId} onSelect={onSelect} />
        </div>
      </CardContent>
    </Card>
  )
}

