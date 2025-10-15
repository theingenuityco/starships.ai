'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { useStarshipDailyUsageList } from '@/hooks/useUsage'

interface DailyUsageCalendarHeatmapProps {
  starshipId: string
  weeks?: number
  cellSize?: number
  className?: string
}

type DayCell = {
  date: Date
  key: string
  cost: number
  tokens: number
}

function toDayKey(date: Date): string {
  // YYYY-MM-DD
  const y = date.getFullYear()
  const m = `${date.getMonth() + 1}`.padStart(2, '0')
  const d = `${date.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${d}`
}

function startOfWeek(date: Date): Date {
  const result = new Date(date)
  const day = result.getDay() // 0 (Sun) - 6 (Sat)
  result.setDate(result.getDate() - day)
  result.setHours(0, 0, 0, 0)
  return result
}

export function DailyUsageCalendarHeatmap({ starshipId, weeks = 8, cellSize = 10, className }: DailyUsageCalendarHeatmapProps): React.JSX.Element | null {
  const validStarshipId = starshipId && starshipId.trim() !== '' ? starshipId : null
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [visibleWeeks, setVisibleWeeks] = useState<number>(weeks)

  const safeLimit = Math.min(weeks * 7, 100)
  const { data, isLoading } = useStarshipDailyUsageList(validStarshipId, {
    limit: safeLimit,
    order: 'ASC',
  })

  const { weekColumns, maxCost, totalCost } = useMemo(() => {
    const end = new Date()
    end.setHours(0, 0, 0, 0)

    const start = startOfWeek(new Date(end))
    start.setDate(start.getDate() - (weeks - 1) * 7)

    const costByDay = new Map<string, number>()
    const tokensByDay = new Map<string, number>()
    if (data?.records) {
      for (const row of data.records) {
        const cost = row.totals.cost || 0
        const tokens = row.totals.totalTokens || 0
        costByDay.set(row.day, cost)
        tokensByDay.set(row.day, tokens)
      }
    }

    let computedMax = 0
    let sum = 0
    for (const value of costByDay.values()) {
      if (value > computedMax) computedMax = value
      sum += value
    }

    const columns: DayCell[][] = []
    for (let w = 0; w < weeks; w++) {
      const col: DayCell[] = []
      for (let d = 0; d < 7; d++) {
        const date = new Date(start)
        date.setDate(start.getDate() + w * 7 + d)
        const key = toDayKey(date)
        const cost = costByDay.get(key) ?? 0
        const tokens = tokensByDay.get(key) ?? 0
        col.push({ date, key, cost, tokens })
      }
      columns.push(col)
    }

    return { weekColumns: columns, maxCost: computedMax, totalCost: sum }
  }, [data, weeks])

  // Dynamically clamp weeks to fit container width without horizontal scroll
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const GAP_PX = 4 // Tailwind gap-1

    const compute = () => {
      const width = el.clientWidth || 0
      const colWidth = cellSize
      const maxCols = Math.max(1, Math.floor((width + GAP_PX) / (colWidth + GAP_PX)))
      setVisibleWeeks(Math.min(weeks, maxCols))
    }

    compute()
    const ro = new ResizeObserver(() => compute())
    ro.observe(el)
    return () => ro.disconnect()
  }, [weeks, cellSize])

  const displayedColumns = useMemo(() => weekColumns.slice(-visibleWeeks), [weekColumns, visibleWeeks])

  const { displayedTotalTokens } = useMemo(() => {
    let sum = 0
    for (const week of displayedColumns) {
      for (const day of week) {
        sum += day.tokens
      }
    }
    return { displayedTotalTokens: sum }
  }, [displayedColumns])

  const daysInRange = visibleWeeks * 7
  const hasUsage = displayedTotalTokens > 0

  const formatTokensShort = (value: number): string => {
    if (value < 1000) return value.toLocaleString()
    if (value < 1_000_000) return `${(value / 1000).toFixed(1)}k`
    return `${(value / 1_000_000).toFixed(1)}m`
  }

  const levelFor = (value: number): number => {
    if (maxCost <= 0) return 0
    const r = value / maxCost
    if (r <= 0) return 0
    if (r < 0.25) return 1
    if (r < 0.5) return 2
    if (r < 0.75) return 3
    return 4
  }

  const levelClass = (level: number): string => {
    switch (level) {
      case 0:
        return 'bg-muted/30'
      case 1:
        return 'bg-primary/20'
      case 2:
        return 'bg-primary/40'
      case 3:
        return 'bg-primary/60'
      default:
        return 'bg-primary'
    }
  }

  return (
    <div ref={containerRef} className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div>
          Last {daysInRange} days: <span className="font-medium text-foreground">{formatTokensShort(displayedTotalTokens)}</span> tokens
        </div>
      </div>
      <div className="grid grid-flow-col auto-cols-max gap-1">
        {isLoading && weekColumns.length === 0
          ? Array.from({ length: visibleWeeks }).map((_, w) => (
              <div key={w} className="grid grid-rows-7 gap-1">
                {Array.from({ length: 7 }).map((__, d) => (
                  <div key={d} className="bg-muted/30 border border-border/30 rounded-[2px]" style={{ width: cellSize, height: cellSize }} />
                ))}
              </div>
            ))
          : displayedColumns.map((week, wIdx) => (
              <div key={wIdx} className="grid grid-rows-7 gap-1">
                {week.map(day => {
                  const level = levelFor(day.cost)
                  const title = `${day.key}: $${(day.cost || 0).toFixed(4)}`
                  return <div key={day.key} className={cn('border border-border/30 rounded-[2px]', levelClass(level))} style={{ width: cellSize, height: cellSize }} title={title} />
                })}
              </div>
            ))}
      </div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <div className={cn(!isLoading && !hasUsage ? '' : 'sr-only')}>No burn recorded in this period.</div>
        <div className="flex items-center gap-1">
          <span>Less</span>
          {[0, 1, 2, 3, 4].map(l => (
            <div key={l} className={cn('border border-border/30 rounded-[2px]', levelClass(l))} style={{ width: cellSize, height: cellSize }} />
          ))}
          <span>More</span>
        </div>
      </div>
    </div>
  )
}

export default DailyUsageCalendarHeatmap
