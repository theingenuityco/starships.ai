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
  /** Landing / neo-brutalist: square corners on grid, cells, and task chips */
  squareEdges?: boolean
}

function getRunsForDay(runsByDay: Map<string, MonthCalendarRun[]> | Record<string, MonthCalendarRun[]>, key: string): MonthCalendarRun[] {
  if (runsByDay instanceof Map) return runsByDay.get(key) ?? []
  return runsByDay[key] ?? []
}

const TASK_TYPE_DOT: Record<string, string> = {
  inbox: '#1d4ed8',
  report: '#047857',
  research: '#b45309',
  content: '#6d28d9',
}

const TASK_TYPE_TEXT: Record<string, string> = {
  inbox: 'text-blue-950',
  report: 'text-emerald-950',
  research: 'text-amber-950',
  content: 'text-violet-950',
}

const TASK_TYPE_STYLE: Record<string, React.CSSProperties> = {
  inbox: {
    background: 'linear-gradient(135deg, rgba(191,219,254,0.36) 0%, rgba(165,243,252,0.36) 100%)',
    borderColor: 'rgba(59,130,246,0.65)',
  },
  report: {
    background: 'linear-gradient(135deg, rgba(167,243,208,0.36) 0%, rgba(153,246,228,0.36) 100%)',
    borderColor: 'rgba(16,185,129,0.65)',
  },
  research: {
    background: 'linear-gradient(135deg, rgba(253,230,138,0.36) 0%, rgba(253,186,116,0.36) 100%)',
    borderColor: 'rgba(245,158,11,0.65)',
  },
  content: {
    background: 'linear-gradient(135deg, rgba(221,214,254,0.36) 0%, rgba(245,208,254,0.36) 100%)',
    borderColor: 'rgba(139,92,246,0.65)',
  },
}

export function MonthScheduleCalendar({
  currentMonth,
  monthCells,
  todayKey,
  runsByDay,
  onDayClick,
  className,
  squareEdges = false,
}: MonthScheduleCalendarProps) {
  const CellTag: any = onDayClick ? 'button' : 'div'
  const frameRadius = squareEdges ? 'rounded-none' : 'rounded-xl'
  const headerCellRadius = squareEdges ? 'rounded-none' : 'rounded-md'
  const dayCellRadius = squareEdges ? 'rounded-none' : 'rounded-lg'
  const chipRadius = squareEdges ? 'rounded-none' : 'rounded-md'
  const dotRadius = squareEdges ? 'rounded-none' : 'rounded-full'

  return (
    <div className={cn('space-y-3', className)}>
      {/* Mobile: allow horizontal scrolling like responsive tables */}
      <div className="overflow-x-auto -mx-2 px-2 sm:mx-0 sm:px-0">
        <div className={cn('min-w-[640px] sm:min-w-0 border border-slate-200 bg-[#F3F4F6] shadow-sm p-2', frameRadius)}>
          <div className="grid grid-cols-7 gap-1 text-[11px] text-slate-600 font-medium mb-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className={cn('px-2 py-1.5 text-center bg-slate-100 text-slate-600', headerCellRadius)}>
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
              const visibleRuns = sortedDayRuns.slice(0, 2)

              return (
                <CellTag
                  key={cell.key}
                  type={onDayClick ? 'button' : undefined}
                  onClick={onDayClick ? () => onDayClick(cell.date) : undefined}
                  className={cn(
                    'relative group min-h-[104px] border p-2 flex flex-col gap-1 bg-white text-left shadow-sm transition-colors',
                    dayCellRadius,
                    onDayClick && 'hover:border-primary/60 hover:bg-primary/5 cursor-pointer',
                    inCurrentMonth ? 'border-slate-300' : 'border-dashed border-slate-300/70 opacity-70',
                    isToday && 'ring-1 ring-amber-400 border-amber-400 bg-amber-50'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className={cn('text-[11px] font-medium', inCurrentMonth ? 'text-foreground' : 'text-muted-foreground')}>{cell.date.getDate()}</span>
                  </div>

                  {visibleRuns.length > 0 ? (
                    <div className="relative mt-1 min-h-[56px]">
                      <div className="flex flex-col gap-1 h-full">
                        {visibleRuns.map((run, runIdx) => (
                          <div
                            key={run.id}
                            className={cn(
                              'w-full h-14 border px-1.5 py-0.5 text-[10px] leading-tight shadow-sm overflow-hidden',
                              chipRadius,
                              run.taskType ? 'border' : 'bg-muted border-border/60',
                              runIdx === 1 && 'hidden group-hover:block group-focus-within:block'
                            )}
                            style={run.taskType ? TASK_TYPE_STYLE[run.taskType] : undefined}
                          >
                            <div className="flex items-center gap-1 mb-1">
                              {run.taskType && TASK_TYPE_DOT[run.taskType] ? (
                                <span
                                  className={cn('flex-shrink-0 w-1 h-1 ring-1 ring-black/10', dotRadius)}
                                  style={{ backgroundColor: TASK_TYPE_DOT[run.taskType] }}
                                  aria-hidden
                                />
                              ) : null}
                              <span className={cn('font-semibold truncate', run.taskType ? TASK_TYPE_TEXT[run.taskType] : 'text-slate-900')}>{run.agentName}</span>
                            </div>
                            {run.prompt && <div className={cn('text-[10px] line-clamp-2 opacity-90', run.taskType ? TASK_TYPE_TEXT[run.taskType] : 'text-slate-800')}>{String(run.prompt)}</div>}
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
