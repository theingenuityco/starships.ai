import React from 'react'
import { Avatar } from '@/components/ui/avatar'
import AgentAvatar from '@/components/animated/AgentAvatar'
import { cn } from '@/lib/utils'

export type MonthCalendarCell = {
  date: Date
  key: string
}

export type MonthCalendarRun = {
  id: string
  runAt?: string
  agentName: string
  agentAvatarSeed?: string
  agentAvatarUrl?: string
  prompt?: string
}

export type MonthScheduleCalendarProps = {
  currentMonth: Date
  monthCells: MonthCalendarCell[]
  todayKey?: string
  runsByDay: Map<string, MonthCalendarRun[]> | Record<string, MonthCalendarRun[]>
  onDayClick?: (date: Date) => void
  className?: string
}

function getRunsForDay(
  runsByDay: Map<string, MonthCalendarRun[]> | Record<string, MonthCalendarRun[]>,
  key: string
): MonthCalendarRun[] {
  if (runsByDay instanceof Map) return runsByDay.get(key) ?? []
  return runsByDay[key] ?? []
}

export function MonthScheduleCalendar({ currentMonth, monthCells, todayKey, runsByDay, onDayClick, className }: MonthScheduleCalendarProps) {
  const CellTag: any = onDayClick ? 'button' : 'div'

  return (
    <div className={cn('space-y-3', className)}>
      <div className="grid grid-cols-7 gap-1 text-xs text-muted-foreground mb-1">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} className="px-2 py-1 text-center font-medium">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 text-xs">
        {monthCells.map(cell => {
          const cellKey = cell.key
          const inCurrentMonth = cell.date.getMonth() === currentMonth.getMonth()
          const dayRuns = getRunsForDay(runsByDay, cellKey)
          const isToday = todayKey ? cellKey === todayKey : false

          const sortedDayRuns = dayRuns.slice().sort((a, b) => {
            const ta = a.runAt ? new Date(a.runAt).getTime() : 0
            const tb = b.runAt ? new Date(b.runAt).getTime() : 0
            return ta - tb
          })

          const latest = sortedDayRuns.length ? sortedDayRuns[sortedDayRuns.length - 1] : null
          const extraCount = Math.max(0, sortedDayRuns.length - 1)
          const stackLayers = Math.min(sortedDayRuns.length, 3)

          return (
            <CellTag
              key={cell.key}
              type={onDayClick ? 'button' : undefined}
              onClick={onDayClick ? () => onDayClick(cell.date) : undefined}
              className={cn(
                'relative group min-h-[104px] rounded-lg border p-2 flex flex-col gap-1 bg-card/80 text-left transition-colors',
                onDayClick && 'hover:border-primary/60 hover:bg-primary/5 cursor-pointer',
                inCurrentMonth ? 'border-border/60' : 'border-dashed border-border/40 opacity-60',
                isToday && 'ring-1 ring-primary/60 border-primary/60'
              )}
            >
              <div className="flex items-center justify-between">
                <span className={cn('text-[11px] font-medium', inCurrentMonth ? 'text-foreground' : 'text-muted-foreground')}>{cell.date.getDate()}</span>
                {sortedDayRuns.length > 0 && (
                  <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] font-medium">
                    {sortedDayRuns.length} run{sortedDayRuns.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {sortedDayRuns.length > 0 && latest ? (
                <div className="relative mt-1 min-h-[56px]">
                  {/* Collapsed stacked view */}
                  <div className="pointer-events-none group-hover:hidden">
                    {Array.from({ length: stackLayers }).map((_, i) => {
                      const isTop = i === stackLayers - 1
                      const depth = stackLayers - 1 - i
                      const offsetY = depth * 3
                      const offsetX = depth * 2
                      const zIndex = 10 + i
                      const transform = isTop ? 'translate(0, 0)' : `translate(${offsetX}px, ${offsetY}px)`

                      return (
                        <div
                          // index is fine: purely visual stack
                          key={i}
                          className={cn(
                            'absolute inset-x-0 h-14 rounded-md px-1.5 py-0.5 text-[10px] leading-tight overflow-hidden transition-transform',
                            isTop ? 'border border-border/60 bg-muted shadow-sm' : 'border border-border/40 bg-muted/80 shadow-sm'
                          )}
                          style={{ top: 0, zIndex, transform }}
                        >
                          {isTop && (
                            <>
                              <div className="flex items-center gap-1 mb-1">
                                <Avatar className="h-4 w-4 ring-1 ring-border/40">
                                  <AgentAvatar seed={latest.agentAvatarSeed || latest.agentName} imageUrl={latest.agentAvatarUrl} size={16} rounded />
                                </Avatar>
                                <span className="font-medium truncate">{latest.agentName}</span>
                                {extraCount > 0 && <span className="ml-auto text-[9px] text-muted-foreground">+{extraCount}</span>}
                              </div>
                              {latest.prompt && <div className="text-[10px] text-muted-foreground line-clamp-2">{String(latest.prompt)}</div>}
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Expanded ordered list on hover */}
                  <div className="hidden group-hover:flex flex-col gap-1 h-full">
                    {sortedDayRuns.map(run => (
                      <div key={run.id} className="w-full h-14 rounded-md border border-border/60 bg-muted px-1.5 py-0.5 text-[10px] leading-tight shadow-sm overflow-hidden">
                        <div className="flex items-center gap-1 mb-1">
                          <Avatar className="h-4 w-4 ring-1 ring-border/40">
                            <AgentAvatar seed={run.agentAvatarSeed || run.agentName} imageUrl={run.agentAvatarUrl} size={16} rounded />
                          </Avatar>
                          <span className="font-medium truncate">{run.agentName}</span>
                        </div>
                        {run.prompt && <div className="text-[10px] text-muted-foreground line-clamp-2">{String(run.prompt)}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </CellTag>
          )
        })}
      </div>
    </div>
  )
}


