import React from 'react'
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
  taskType?: 'inbox' | 'report' | 'research' | 'content'
}

export type MonthScheduleCalendarProps = {
  currentMonth: Date
  monthCells: MonthCalendarCell[]
  todayKey?: string
  runsByDay: Map<string, MonthCalendarRun[]> | Record<string, MonthCalendarRun[]>
  onDayClick?: (date: Date) => void
  className?: string
}

function getRunsForDay(runsByDay: Map<string, MonthCalendarRun[]> | Record<string, MonthCalendarRun[]>, key: string): MonthCalendarRun[] {
  if (runsByDay instanceof Map) return runsByDay.get(key) ?? []
  return runsByDay[key] ?? []
}

const TASK_TYPE_DOT: Record<string, string> = {
  inbox: 'bg-blue-500',
  report: 'bg-emerald-500',
  research: 'bg-amber-500',
  content: 'bg-violet-500',
}

const TASK_TYPE_BG: Record<string, string> = {
  inbox: 'bg-blue-50 dark:bg-blue-950/60 border-blue-400',
  report: 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-400',
  research: 'bg-amber-50 dark:bg-amber-950/60 border-amber-400',
  content: 'bg-violet-50 dark:bg-violet-950/60 border-violet-400',
}

export function MonthScheduleCalendar({ currentMonth, monthCells, todayKey, runsByDay, onDayClick, className }: MonthScheduleCalendarProps) {
  const CellTag: any = onDayClick ? 'button' : 'div'

  return (
    <div className={cn('space-y-3', className)}>
      {/* Mobile: allow horizontal scrolling like responsive tables */}
      <div className="overflow-x-auto -mx-2 px-2 sm:mx-0 sm:px-0">
        <div className="min-w-[640px] sm:min-w-0 rounded-xl border border-slate-200 bg-[#F3F4F6] shadow-sm p-2">
          <div className="grid grid-cols-7 gap-1 text-[11px] text-slate-600 font-medium mb-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className="px-2 py-1.5 text-center rounded-md bg-slate-100 text-slate-600">
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
                    'relative group min-h-[104px] rounded-lg border p-2 flex flex-col gap-1 bg-white text-left shadow-sm transition-colors',
                    onDayClick && 'hover:border-primary/60 hover:bg-primary/5 cursor-pointer',
                    inCurrentMonth ? 'border-slate-300' : 'border-dashed border-slate-300/70 opacity-70',
                    isToday && 'ring-1 ring-amber-400 border-amber-400 bg-amber-50'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className={cn('text-[11px] font-medium', inCurrentMonth ? 'text-foreground' : 'text-muted-foreground')}>{cell.date.getDate()}</span>
                    {sortedDayRuns.length > 0 && (
                      <span className="inline-flex items-center rounded-full bg-primary/15 text-primary px-2 py-1 text-[11px] font-semibold">
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

                          const cardBg = latest.taskType ? (TASK_TYPE_BG[latest.taskType] ?? 'bg-muted border-border/60') : 'bg-muted border-border/60'
                          return (
                            <div
                              // index is fine: purely visual stack
                              key={i}
                              className={cn(
                                'absolute inset-x-0 h-14 rounded-md px-1.5 py-0.5 text-[10px] leading-tight overflow-hidden transition-transform border shadow-sm',
                                isTop ? cardBg : 'border-border/40 bg-muted/80'
                              )}
                              style={{ top: 0, zIndex, transform }}
                            >
                              {isTop && (
                                <>
                                  <div className="flex items-center gap-1 mb-1">
                                    {latest.taskType && TASK_TYPE_DOT[latest.taskType] ? (
                                      <span className={cn('flex-shrink-0 w-1.5 h-1.5 rounded-full', TASK_TYPE_DOT[latest.taskType])} aria-hidden />
                                    ) : null}
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
                          <div
                            key={run.id}
                            className={cn(
                              'w-full h-14 rounded-md border px-1.5 py-0.5 text-[10px] leading-tight shadow-sm overflow-hidden',
                              run.taskType ? TASK_TYPE_BG[run.taskType] : 'bg-muted border-border/60'
                            )}
                          >
                            <div className="flex items-center gap-1 mb-1">
                              {run.taskType && TASK_TYPE_DOT[run.taskType] ? <span className={cn('flex-shrink-0 w-1.5 h-1.5 rounded-full', TASK_TYPE_DOT[run.taskType])} aria-hidden /> : null}
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
      </div>
    </div>
  )
}
