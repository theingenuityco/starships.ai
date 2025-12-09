'use client'

import React, { useMemo, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'

import Icon from '@/components/primitives/Icon'
import { PageLayout } from '@/components/layout/PageLayout'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { cn } from '@/lib/utils'
import { scheduleAPI } from '@/lib/api'
import type { ScheduleModel, AgentModel } from '@starships/protocol'
import { useStarshipBySlug, useStarshipAgents } from '@/hooks/useStarships'
import { ScheduleConversationModal } from '@/components/conversation/ScheduleConversationModal'
import { Button } from '@/components/ui/button'

type CalendarCell = {
  date: Date
  key: string
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function formatDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatHourLabel(hour: number): string {
  const suffix = hour < 12 ? 'AM' : 'PM'
  const display = hour % 12 === 0 ? 12 : hour % 12
  return `${display} ${suffix}`
}

function startOfWeek(date: Date): Date {
  const d = startOfDay(date)
  const weekday = d.getDay() // 0 (Sun) - 6 (Sat)
  d.setDate(d.getDate() - weekday)
  return d
}

function formatWeekLabel(start: Date): string {
  const end = new Date(start)
  end.setDate(start.getDate() + 6)

  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  const startLabel = start.toLocaleDateString(undefined, opts)

  const sameMonth = start.getMonth() === end.getMonth()
  const endLabel = end.toLocaleDateString(undefined, sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' })

  return `${startLabel} – ${endLabel}, ${start.getFullYear()}`
}

export default function StarshipSchedulesPage(): React.JSX.Element {
  const router = useRouter()
  const { slug } = useParams<{ slug: string }>()

  const { data: starship } = useStarshipBySlug(slug, true)
  const starshipId = starship?.id || ''

  const [viewMode, setViewMode] = useState<'month' | 'week'>('week')
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [currentWeekStart, setCurrentWeekStart] = useState(() => startOfWeek(new Date()))

  const [scheduleModalOpen, setScheduleModalOpen] = useState(false)
  const [modalInitialPrompt, setModalInitialPrompt] = useState('')
  const [modalInitialDate, setModalInitialDate] = useState<string | undefined>(undefined)
  const [modalInitialTime, setModalInitialTime] = useState<string | undefined>(undefined)

  const { data: schedules = [], isLoading: schedulesLoading } = useQuery<ScheduleModel[]>({
    queryKey: ['starship-schedules', starshipId],
    queryFn: async () => {
      if (!starshipId) return []
      return scheduleAPI.listByStarship(starshipId)
    },
    enabled: !!starshipId,
    staleTime: 30 * 1000,
  })

  const { data: agents = [] } = useStarshipAgents(starshipId || '', !!starshipId)

  const agentsById = useMemo(() => {
    const map = new Map<string, AgentModel>()
    for (const a of agents as AgentModel[]) {
      if (a && a.id) map.set(a.id, a)
    }
    return map
  }, [agents])

  const now = new Date()
  const todayKey = formatDateKey(startOfDay(now))

  const monthCells: CalendarCell[] = useMemo(() => {
    const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1)
    const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0)

    const startWeekday = monthStart.getDay() // 0 (Sun) - 6 (Sat)
    const gridStart = new Date(monthStart)
    gridStart.setDate(monthStart.getDate() - startWeekday)

    const endWeekday = monthEnd.getDay()
    const gridEnd = new Date(monthEnd)
    gridEnd.setDate(monthEnd.getDate() + (6 - endWeekday))

    const cells: CalendarCell[] = []
    const cursor = new Date(gridStart)
    while (cursor <= gridEnd) {
      const d = new Date(cursor)
      cells.push({ date: d, key: formatDateKey(d) })
      cursor.setDate(cursor.getDate() + 1)
    }
    return cells
  }, [currentMonth])

  const schedulesByDay = useMemo(() => {
    const map = new Map<string, ScheduleModel[]>()
    for (const sched of schedules) {
      if (!sched?.nextRunAt) continue
      const dt = new Date(sched.nextRunAt as unknown as string)
      if (Number.isNaN(dt.getTime())) continue
      const key = formatDateKey(dt)
      const arr = map.get(key) ?? []
      arr.push(sched)
      map.set(key, arr)
    }
    return map
  }, [schedules])

  const allUpcoming = useMemo(() => {
    const now = new Date()
    return [...schedules]
      .filter(s => s.nextRunAt && new Date(s.nextRunAt as unknown as string).getTime() >= now.getTime())
      .sort((a, b) => {
        const da = new Date(a.nextRunAt as unknown as string).getTime()
        const db = new Date(b.nextRunAt as unknown as string).getTime()
        return da - db
      })
      .slice(0, 50)
  }, [schedules])

  const HOURS = useMemo(() => Array.from({ length: 24 }, (_, i) => i), [])

  const weekDays: Date[] = useMemo(() => {
    const start = currentWeekStart
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      return d
    })
  }, [currentWeekStart])

  const openScheduleModalForDate = useCallback((dateForSchedule?: Date, timeForSchedule?: string) => {
    if (dateForSchedule) {
      const key = formatDateKey(dateForSchedule)
      setModalInitialDate(key)
    } else {
      setModalInitialDate(undefined)
    }
    setModalInitialTime(timeForSchedule || undefined)
    setModalInitialPrompt('')
    setScheduleModalOpen(true)
  }, [])

  const handlePrevMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
  }

  const handleNextMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
  }

  const handlePrevWeek = () => {
    setCurrentWeekStart(prev => {
      const d = new Date(prev)
      d.setDate(d.getDate() - 7)
      return startOfWeek(d)
    })
  }

  const handleNextWeek = () => {
    setCurrentWeekStart(prev => {
      const d = new Date(prev)
      d.setDate(d.getDate() + 7)
      return startOfWeek(d)
    })
  }

  const monthLabel = currentMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const weekLabel = formatWeekLabel(currentWeekStart)

  return (
    <PageLayout>
      <div className="bg-background">
        <div className="flex flex-col items-center px-6 py-8">
          <div className="w-full max-w-6xl mx-auto space-y-8">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Icon name="clock" className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold">Schedules</h1>
              </div>
              <div className="flex items-center justify-center gap-2">
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem>
                      <BreadcrumbLink href={`/ship/${slug}`} className="font-mono">
                        <Badge variant="outline" className="font-mono text-muted-foreground border-muted-foreground/30 hover:text-foreground">
                          {slug}
                        </Badge>
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage>
                        <Badge variant="outline" className="text-foreground">
                          Schedules
                        </Badge>
                      </BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
              </div>
              <p className="text-muted-foreground mt-2">See when your agents are scheduled to run.</p>
            </div>

            <div className="space-y-6">
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <Card className="lg:col-span-2 frosted-glass-card shadow-frosted-lg">
                    <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <Icon name="calendar" className="h-4 w-4" />
                          Calendar
                        </CardTitle>
                        <div className="ml-2 inline-flex items-center rounded-full bg-muted/60 p-0.5 text-[11px]">
                          <button
                            type="button"
                            className={cn('px-2 py-0.5 rounded-full transition-colors', viewMode === 'month' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground')}
                            onClick={() => setViewMode('month')}
                          >
                            Month
                          </button>
                          <button
                            type="button"
                            className={cn('px-2 py-0.5 rounded-full transition-colors', viewMode === 'week' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground')}
                            onClick={() => setViewMode('week')}
                          >
                            Week
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {viewMode === 'month' ? (
                          <>
                            <button
                              type="button"
                              onClick={handlePrevMonth}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-background hover:bg-muted transition-colors"
                              aria-label="Previous month"
                            >
                              <Icon name="chevron-left" className="h-4 w-4" />
                            </button>
                            <span className="text-sm font-medium min-w-[140px] text-center">{monthLabel}</span>
                            <button
                              type="button"
                              onClick={handleNextMonth}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-background hover:bg-muted transition-colors"
                              aria-label="Next month"
                            >
                              <Icon name="chevron-right" className="h-4 w-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={handlePrevWeek}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-background hover:bg-muted transition-colors"
                              aria-label="Previous week"
                            >
                              <Icon name="chevron-left" className="h-4 w-4" />
                            </button>
                            <span className="text-sm font-medium min-w-[160px] text-center">{weekLabel}</span>
                            <button
                              type="button"
                              onClick={handleNextWeek}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-background hover:bg-muted transition-colors"
                              aria-label="Next week"
                            >
                              <Icon name="chevron-right" className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      {schedulesLoading ? (
                        <div className="space-y-2">
                          {[1, 2, 3].map(i => (
                            <Skeleton key={i} className="h-8 w-full" />
                          ))}
                        </div>
                      ) : viewMode === 'month' ? (
                        <div className="space-y-3">
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
                              const daySchedules = schedulesByDay.get(cellKey) ?? []
                              const isToday = cellKey === todayKey

                              return (
                                <button
                                  key={cell.key}
                                  type="button"
                                  onClick={() => openScheduleModalForDate(cell.date)}
                                  className={cn(
                                    'min-h-[72px] rounded-lg border p-1.5 flex flex-col gap-1 bg-card/80 text-left hover:border-primary/60 hover:bg-primary/5 transition-colors',
                                    inCurrentMonth ? 'border-border/60' : 'border-dashed border-border/40 opacity-60',
                                    isToday && 'ring-1 ring-primary/60 border-primary/60'
                                  )}
                                >
                                  <div className="flex items-center justify-between">
                                    <span className={cn('text-[11px] font-medium', inCurrentMonth ? 'text-foreground' : 'text-muted-foreground')}>{cell.date.getDate()}</span>
                                    {daySchedules.length > 0 && (
                                      <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] font-medium">
                                        {daySchedules.length} run{daySchedules.length > 1 ? 's' : ''}
                                      </span>
                                    )}
                                  </div>
                                  {daySchedules.slice(0, 3).map(s => {
                                    const agent = s.agentId ? agentsById.get(s.agentId) : undefined
                                    const label = agent?.name || 'Agent'
                                    return (
                                      <div key={s.id} className="rounded-md bg-muted/70 px-1.5 py-0.5 text-[10px] leading-tight flex flex-col gap-0.5">
                                        <span className="font-medium truncate">{label}</span>
                                        {s.prompt && (
                                          <span className="text-[10px] text-muted-foreground truncate">
                                            {String(s.prompt).slice(0, 60)}
                                            {String(s.prompt).length > 60 ? '…' : ''}
                                          </span>
                                        )}
                                      </div>
                                    )
                                  })}
                                  {daySchedules.length > 3 && <span className="text-[10px] text-muted-foreground mt-0.5">+{daySchedules.length - 3} more</span>}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))] gap-1 text-xs text-muted-foreground mb-1">
                            <div className="px-2 py-1 text-left font-medium">Time</div>
                            {weekDays.map(day => (
                              <div key={formatDateKey(day)} className="px-2 py-1 text-center font-medium">
                                {day.toLocaleDateString(undefined, { weekday: 'short' })}{' '}
                                <span className="text-[10px] text-muted-foreground">
                                  {day.getMonth() + 1}/{day.getDate()}
                                </span>
                              </div>
                            ))}
                          </div>
                          <div className="max-h-[560px] overflow-y-auto rounded-lg border border-border/40 bg-background/40">
                            <div className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))] text-xs">
                              {HOURS.map(hour => {
                                const cells: React.ReactNode[] = []
                                // Time label column
                                cells.push(
                                  <div key={`time-${hour}`} className="border border-border/40 px-1.5 py-1.5 text-[11px] text-muted-foreground sticky left-0 bg-background/80">
                                    {formatHourLabel(hour)}
                                  </div>
                                )
                                // Day columns
                                weekDays.forEach(day => {
                                  const cellKey = formatDateKey(day)
                                  const daySchedules = (schedulesByDay.get(cellKey) ?? []).filter(s => {
                                    const dt = new Date(s.nextRunAt as unknown as string)
                                    return dt.getHours() === hour
                                  })
                                  const isCurrentHourToday = cellKey === todayKey && hour === now.getHours()
                                  const sortedDaySchedules = daySchedules.slice().sort((a, b) => {
                                    const ta = new Date(a.nextRunAt as unknown as string).getTime()
                                    const tb = new Date(b.nextRunAt as unknown as string).getTime()
                                    return ta - tb
                                  })

                                  cells.push(
                                    <div
                                      key={`${cellKey}-${hour}`}
                                      onClick={() => openScheduleModalForDate(day, `${String(hour).padStart(2, '0')}:00`)}
                                      className={cn(
                                        'group relative border border-border/40 min-h-[64px] px-1.5 py-1 bg-card/60 cursor-pointer overflow-hidden',
                                        'hover:bg-primary/5 hover:border-primary/40 transition-colors',
                                        isCurrentHourToday && 'bg-sky-500/15 border-sky-500/70 dark:bg-sky-500/20 dark:border-sky-400/80'
                                      )}
                                    >
                                      {/* Collapsed stacked view */}
                                      {sortedDaySchedules.length > 0 && (
                                        <div className="pointer-events-none group-hover:hidden">
                                          {sortedDaySchedules.map((s, idx) => {
                                            const agent = s.agentId ? agentsById.get(s.agentId) : undefined
                                            const label = agent?.name || 'Agent'
                                            const offset = idx * 4
                                            return (
                                              <div
                                                key={s.id}
                                                className="absolute left-1 right-1 rounded-md border border-border/60 bg-muted px-1.5 py-1 text-left text-[10px] leading-tight shadow-sm"
                                                style={{ top: offset, zIndex: 10 + idx }}
                                              >
                                                <div className="flex items-center justify-between gap-1 mb-0.5">
                                                  <span className="font-medium truncate">{label}</span>
                                                </div>
                                                {s.prompt && <div className="text-[10px] text-muted-foreground line-clamp-2">{String(s.prompt)}</div>}
                                              </div>
                                            )
                                          })}
                                        </div>
                                      )}

                                      {/* Expanded ordered list on hover */}
                                      {sortedDaySchedules.length > 0 && (
                                        <div className="hidden group-hover:flex flex-col gap-1 h-full">
                                          {sortedDaySchedules.map(s => {
                                            const agent = s.agentId ? agentsById.get(s.agentId) : undefined
                                            const label = agent?.name || 'Agent'
                                            return (
                                              <div key={s.id} className="w-full rounded-md border border-border/60 bg-muted px-1.5 py-1 text-left text-[10px] leading-tight shadow-sm">
                                                <div className="flex items-center justify-between gap-1 mb-0.5">
                                                  <span className="font-medium truncate">{label}</span>
                                                </div>
                                                {s.prompt && <div className="text-[10px] text-muted-foreground line-clamp-2">{String(s.prompt)}</div>}
                                              </div>
                                            )
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  )
                                })
                                return cells
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="frosted-glass-card shadow-frosted-lg">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Icon name="list-checks" className="h-4 w-4" />
                        Upcoming runs
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      {schedulesLoading ? (
                        <div className="space-y-2">
                          {[1, 2, 3].map(i => (
                            <Skeleton key={i} className="h-10 w-full" />
                          ))}
                        </div>
                      ) : allUpcoming.length === 0 ? (
                        <div className="text-center py-6 text-xs text-muted-foreground">
                          <p>No upcoming schedules yet.</p>
                          <p>Use the calendar or “New schedule” button above to create one.</p>
                        </div>
                      ) : (
                        <ScrollArea className="h-[320px] pr-2">
                          <div className="space-y-2 text-xs">
                            {allUpcoming.map(s => {
                              const dt = new Date(s.nextRunAt as unknown as string)
                              const dateStr = dt.toLocaleDateString(undefined, {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                              })
                              const timeStr = dt.toLocaleTimeString(undefined, {
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                              const agent = s.agentId ? agentsById.get(s.agentId) : undefined
                              const label = agent?.name || 'Agent'
                              return (
                                <div key={s.id} className="rounded-lg border border-border/60 bg-card/80 px-2.5 py-2 flex flex-col gap-1">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-[11px] font-medium">
                                        {label.charAt(0).toUpperCase()}
                                      </span>
                                      <div className="min-w-0">
                                        <div className="text-[11px] font-semibold truncate">{label}</div>
                                        {s.timezone && <div className="text-[10px] text-muted-foreground truncate">{s.timezone}</div>}
                                      </div>
                                    </div>
                                    <div className="text-right">
                                      <div className="text-[11px] font-medium">{dateStr}</div>
                                      <div className="text-[10px] text-muted-foreground">{timeStr}</div>
                                    </div>
                                  </div>
                                  {s.prompt && <div className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{String(s.prompt)}</div>}
                                </div>
                              )
                            })}
                          </div>
                        </ScrollArea>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
            <ScheduleConversationModal
              open={scheduleModalOpen}
              onOpenChange={open => {
                setScheduleModalOpen(open)
                if (!open) {
                  setModalInitialPrompt('')
                  setModalInitialDate(undefined)
                  setModalInitialTime(undefined)
                }
              }}
              starshipId={starshipId}
              agents={agents as AgentModel[]}
              initialPrompt={modalInitialPrompt}
              initialDate={modalInitialDate}
              initialTime={modalInitialTime}
            />
          </div>
        </div>
      </div>
    </PageLayout>
  )
}
