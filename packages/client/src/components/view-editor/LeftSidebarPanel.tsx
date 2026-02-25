'use client'

import React from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
        <Tabs defaultValue="catalog" className="flex flex-1 min-h-0 flex-col">
          <TabsList className="w-fit self-start justify-start">
            <TabsTrigger value="catalog">Catalog</TabsTrigger>
            <TabsTrigger value="hierarchy">Hierarchy</TabsTrigger>
          </TabsList>

          <TabsContent value="catalog" className="flex-1 min-h-0 overflow-hidden">
            <WidgetPalettePanel />
          </TabsContent>

          <TabsContent value="hierarchy" className="flex-1 min-h-0 overflow-auto">
            <ViewTreePanel root={root} selectedId={selectedId} onSelect={onSelect} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

