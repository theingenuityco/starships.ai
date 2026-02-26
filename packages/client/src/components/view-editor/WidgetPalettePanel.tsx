'use client'

import React from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { WIDGET_CATALOG, type WidgetCatalogEntry } from '@/components/widgets/widgetCatalog'

function PaletteItem(props: { widget: WidgetCatalogEntry }) {
  const { widget } = props
  const id = `palette:${widget.type}`
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    data: { kind: 'new', widgetType: widget.type },
  })

  // NOTE: We intentionally do not apply the draggable transform styles here.
  // When dragging, translating the original list item can make the ScrollArea think
  // its contents are wider, which introduces an unwanted horizontal scroll.
  // The editor already renders a DragOverlay for "new" drags.
  void transform

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={cn(
        'w-full max-w-full min-w-0 overflow-hidden text-left rounded-md border border-border/60 bg-card px-3 py-2 text-sm hover:bg-muted/40 transition-colors',
        isDragging ? 'opacity-60' : null
      )}
      {...listeners}
      {...attributes}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium truncate">{widget.label}</div>
          <div className="text-[11px] text-muted-foreground font-mono truncate">{widget.type}</div>
        </div>
        <div className="text-[11px] text-muted-foreground">{widget.category}</div>
      </div>
    </button>
  )
}

export function WidgetPalettePanel() {
  const [q, setQ] = React.useState('')

  const widgets = React.useMemo(() => [...WIDGET_CATALOG], [])
  const filtered = React.useMemo((): WidgetCatalogEntry[] => {
    const query = q.trim().toLowerCase()
    if (!query) return widgets
    return widgets.filter(w => w.type.toLowerCase().includes(query) || w.label.toLowerCase().includes(query) || w.category.toLowerCase().includes(query))
  }, [widgets, q])

  const grouped = React.useMemo(() => {
    const m = new Map<string, WidgetCatalogEntry[]>()
    for (const w of filtered) {
      const arr = m.get(w.category) ?? []
      arr.push(w)
      m.set(w.category, arr)
    }
    const entries = Array.from(m.entries())
      .map(([category, items]) => [category, items.slice().sort((a, b) => a.label.localeCompare(b.label))] as const)
      .sort((a, b) => a[0].localeCompare(b[0]))
    return entries
  }, [filtered])

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Drag to canvas</div>
      <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search widgets…" />

      {!filtered.length ? (
        <div className="text-sm text-muted-foreground py-6">No widgets match.</div>
      ) : (
        <ScrollArea className="min-h-0 flex-1 pr-2">
          <div className="flex flex-col gap-4 pb-2">
            {grouped.map(([category, items]) => (
              <div key={category} className="flex flex-col gap-2">
                <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{category}</div>
                <div className="flex flex-col gap-2">
                  {items.map(widget => (
                    <PaletteItem key={widget.type} widget={widget} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}

