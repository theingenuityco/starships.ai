'use client'

import React from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { WIDGET_DEFINITIONS, type WidgetDefinition } from '@/components/widgets/widgetDefinitions'

function PaletteItem(props: { def: WidgetDefinition }) {
  const { def } = props
  const id = `palette:${def.type}`
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    data: { kind: 'new', widgetType: def.type },
  })

  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={cn(
        'w-full text-left rounded-md border border-border/60 bg-card px-3 py-2 text-sm hover:bg-muted/40 transition-colors',
        isDragging ? 'opacity-60' : null
      )}
      style={style}
      {...listeners}
      {...attributes}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium truncate">{def.label}</div>
          <div className="text-[11px] text-muted-foreground font-mono truncate">{def.type}</div>
        </div>
        <div className="text-[11px] text-muted-foreground">{def.category}</div>
      </div>
    </button>
  )
}

export function WidgetPalettePanel() {
  const [q, setQ] = React.useState('')

  const defs = React.useMemo(() => Object.values(WIDGET_DEFINITIONS), [])
  const filtered = React.useMemo(() => {
    const query = q.trim().toLowerCase()
    if (!query) return defs
    return defs.filter(d => d.type.toLowerCase().includes(query) || d.label.toLowerCase().includes(query) || d.category.toLowerCase().includes(query))
  }, [defs, q])

  const grouped = React.useMemo(() => {
    const m = new Map<string, WidgetDefinition[]>()
    for (const d of filtered) {
      const arr = m.get(d.category) ?? []
      arr.push(d)
      m.set(d.category, arr)
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [filtered])

  return (
    <div className="flex min-h-0 flex-col gap-3">
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
                  {items
                    .slice()
                    .sort((a, b) => a.label.localeCompare(b.label))
                    .map(def => (
                      <PaletteItem key={def.type} def={def} />
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

