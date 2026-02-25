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
    <Card className="h-full border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Builder</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 min-h-0 overflow-hidden flex flex-col gap-3">
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

