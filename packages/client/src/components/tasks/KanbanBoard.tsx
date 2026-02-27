'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import type { TaskCardModel, TaskColumnModel } from '@starships/protocol'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

function computeNewPos(list: TaskCardModel[], newIndex: number): number {
  const prev = newIndex > 0 ? list[newIndex - 1] : null
  const next = newIndex < list.length - 1 ? list[newIndex + 1] : null
  const prevPos = prev && Number.isFinite(prev.pos) ? prev.pos : null
  const nextPos = next && Number.isFinite(next.pos) ? next.pos : null

  if (prevPos == null && nextPos == null) return 1
  if (prevPos == null && nextPos != null) return nextPos - 1
  if (prevPos != null && nextPos == null) return prevPos + 1
  if (prevPos != null && nextPos != null) return (prevPos + nextPos) / 2
  return 1
}

function KanbanCard({
  card,
  onArchive,
}: {
  card: TaskCardModel
  onArchive?: (cardId: string) => void
}): React.JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'rounded-md border border-border/60 bg-card/90 px-3 py-2 text-sm shadow-sm',
        isDragging && 'opacity-70'
      )}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate" {...attributes} {...listeners}>
            {card.title}
          </div>
          {card.description ? <div className="mt-1 text-xs text-muted-foreground line-clamp-3">{card.description}</div> : null}
        </div>
        {onArchive ? (
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => onArchive(card.id)}
            aria-label="Archive card"
          >
            ×
          </button>
        ) : null}
      </div>
    </div>
  )
}

function KanbanColumn({
  column,
  cards,
  onCreateCard,
  onArchiveCard,
}: {
  column: TaskColumnModel
  cards: TaskCardModel[]
  onCreateCard?: (columnName: string, title: string) => Promise<void> | void
  onArchiveCard?: (cardId: string) => Promise<void> | void
}): React.JSX.Element {
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const items = useMemo(() => cards.map((c) => c.id), [cards])
  const { setNodeRef, isOver } = useDroppable({ id: column.id })

  return (
    <Card
      ref={setNodeRef}
      className={cn('w-[320px] shrink-0 bg-background/60 border-border/50', isOver && 'ring-2 ring-primary/40')}
    >
      <div className="px-3 py-2 border-b border-border/50">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{column.title}</div>
            {typeof column.wipLimit === 'number' ? (
              <div className="text-[11px] text-muted-foreground">
                {cards.length}/{column.wipLimit}
              </div>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setAdding((v) => !v)}
            className="h-7 px-2"
          >
            Add
          </Button>
        </div>

        {adding ? (
          <form
            className="mt-2 flex items-center gap-2"
            onSubmit={async (e) => {
              e.preventDefault()
              const t = title.trim()
              if (!t) return
              setTitle('')
              setAdding(false)
              await onCreateCard?.(column.title, t)
            }}
          >
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Card title" className="h-8" />
            <Button type="submit" size="sm" className="h-8">
              Create
            </Button>
          </form>
        ) : null}
      </div>

      <div className="p-3">
        <SortableContext items={items} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2 min-h-[24px]">
            {cards.map((card) => (
              <KanbanCard key={card.id} card={card} onArchive={onArchiveCard} />
            ))}
          </div>
        </SortableContext>
      </div>
    </Card>
  )
}

export function KanbanBoard({
  columns,
  cards,
  onMoveCard,
  onCreateCard,
  onArchiveCard,
  className,
}: {
  columns: TaskColumnModel[]
  cards: TaskCardModel[]
  onMoveCard?: (args: { cardId: string; toColumnName: string; toPos: number }) => Promise<void> | void
  onCreateCard?: (columnName: string, title: string) => Promise<void> | void
  onArchiveCard?: (cardId: string) => Promise<void> | void
  className?: string
}): React.JSX.Element {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const sortedColumns = useMemo(() => [...columns].sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0)), [columns])
  const columnTitleById = useMemo(() => new Map(sortedColumns.map((c) => [c.id, c.title] as const)), [sortedColumns])
  const cardsByColumn = useMemo(() => {
    const map = new Map<string, TaskCardModel[]>()
    for (const c of sortedColumns) map.set(c.id, [])
    for (const card of cards) {
      const arr = map.get(card.columnId) ?? []
      arr.push(card)
      map.set(card.columnId, arr)
    }
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0))
      map.set(k, arr)
    }
    return map
  }, [cards, sortedColumns])

  // Local state for optimistic drag/drop reordering.
  const [localCardsByColumn, setLocalCardsByColumn] = useState<Map<string, TaskCardModel[]>>(cardsByColumn)
  useEffect(() => {
    setLocalCardsByColumn(cardsByColumn)
  }, [cardsByColumn])

  const cardById = useMemo(() => {
    const m = new Map<string, TaskCardModel>()
    for (const arr of localCardsByColumn.values()) for (const c of arr) m.set(c.id, c)
    return m
  }, [localCardsByColumn])

  const columnIdByCardId = useMemo(() => {
    const m = new Map<string, string>()
    for (const [colId, arr] of localCardsByColumn.entries()) {
      for (const c of arr) m.set(c.id, colId)
    }
    return m
  }, [localCardsByColumn])

  const onDragStart = (_evt: DragStartEvent) => {}

  const onDragEnd = async (evt: DragEndEvent) => {
    const activeId = String(evt.active.id || '')
    const overId = evt.over?.id ? String(evt.over.id) : ''
    if (!activeId || !overId) return
    if (!cardById.has(activeId)) return

    const fromColumnId = columnIdByCardId.get(activeId)
    if (!fromColumnId) return

    const overIsCard = cardById.has(overId)
    const toColumnId = overIsCard ? columnIdByCardId.get(overId) : overId
    if (!toColumnId) return

    if (!localCardsByColumn.has(toColumnId)) return

    let moveInfo: { cardId: string; toColumnName: string; toPos: number } | null = null

    setLocalCardsByColumn((prev) => {
      const next = new Map(prev)
      const fromList = [...(next.get(fromColumnId) ?? [])]
      const toList = fromColumnId === toColumnId ? [...fromList] : [...(next.get(toColumnId) ?? [])]

      const fromIndex = fromList.findIndex((c) => c.id === activeId)
      if (fromIndex === -1) return prev
      const moving = fromList[fromIndex]

      // Remove from origin
      fromList.splice(fromIndex, 1)

      // Insert into destination
      let insertIndex = toList.length
      if (overIsCard) {
        const overIndex = toList.findIndex((c) => c.id === overId)
        insertIndex = overIndex === -1 ? toList.length : overIndex
      }
      toList.splice(insertIndex, 0, { ...moving, columnId: toColumnId })

      if (fromColumnId === toColumnId) {
        next.set(toColumnId, toList)
      } else {
        next.set(fromColumnId, fromList)
        next.set(toColumnId, toList)
      }

      const newIndex = toList.findIndex((c) => c.id === activeId)
      const toPos = computeNewPos(toList, newIndex)
      const toColumnName = String(columnTitleById.get(toColumnId) || '').trim()
      if (!toColumnName) return prev
      moveInfo = { cardId: activeId, toColumnName, toPos }

      return next
    })

    if (moveInfo) {
      await onMoveCard?.(moveInfo)
    }
  }

  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex items-start gap-4 py-2">
          {sortedColumns.map((col) => (
            <KanbanColumn
              key={col.id}
              column={col}
              cards={localCardsByColumn.get(col.id) ?? []}
              onCreateCard={onCreateCard}
              onArchiveCard={onArchiveCard}
            />
          ))}
        </div>
      </DndContext>
    </div>
  )
}

export default KanbanBoard

