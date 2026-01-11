'use client'

import React, { useMemo, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { CronExpressionParser } from 'cron-parser'

import Icon from '@/components/primitives/Icon'
import { PageLayout } from '@/components/layout/PageLayout'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Avatar } from '@/components/ui/avatar'
import AgentAvatar from '@/components/animated/AgentAvatar'
import { useMessageAttachments } from '@/hooks/useFileUpload'
import { cn } from '@/lib/utils'
import { scheduleAPI } from '@/lib/api'
import type { ScheduleModel, AgentModel } from '@starships/protocol'
import { useStarshipBySlug, useStarshipAgents } from '@/hooks/useStarships'
import { ScheduleConversationModal } from '@/components/conversation/ScheduleConversationModal'
import { Button } from '@/components/ui/button'
import { MonthScheduleCalendar, type MonthCalendarRun } from '@/components/schedules/MonthScheduleCalendar'

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

function generateOccurrencesForSchedule(sched: ScheduleModel, rangeStart: Date, rangeEnd: Date): Date[] {
  const occurrences: Date[] = []
  if (!sched?.nextRunAt) return occurrences

  const first = new Date(sched.nextRunAt)
  if (Number.isNaN(first.getTime())) return occurrences

  // Always include the stored nextRunAt if it is in range
  if (first >= rangeStart && first <= rangeEnd) {
    occurrences.push(first)
  }

  if (!sched.isRecurring) {
    return occurrences
  }

  try {
    const interval = CronExpressionParser.parse(sched.cronExpression, {
      currentDate: first,
      tz: sched.timezone || 'UTC',
    })

    // Generate all occurrences within [rangeStart, rangeEnd]
    // and stop as soon as we pass rangeEnd.
    // NOTE: Our UI recurrence patterns only create at most one run per day,
    // so this remains safe for calendar views.
    const MAX_ITERATIONS = 1000
    let iterations = 0

    while (true) {
      if (iterations++ >= MAX_ITERATIONS) {
        break
      }

      const rawNext = interval.next()
      const next = new Date(rawNext.toString())
      if (next > rangeEnd) break
      if (next >= rangeStart) {
        occurrences.push(next)
      }
    }
  } catch {
    // If cron parsing fails, fall back to showing only the stored nextRunAt
    return occurrences
  }

  return occurrences
}

export default function StarshipSchedulesPage(): React.JSX.Element {
  const router = useRouter()
  const { slug } = useParams<{ slug: string }>()

  const { data: starship } = useStarshipBySlug(slug, true)
  const starshipId = starship?.id || ''

  const [viewMode, setViewMode] = useState<'month' | 'week'>('month')
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

  const agentAvatarAttachmentIds = useMemo(() => {
    return (Array.isArray(agents) ? (agents as AgentModel[]) : [])
      .map(a => (a as any)?.avatarAttachmentId as string | undefined)
      .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
  }, [agents])
  const { data: agentAvatarAttachments = [] } = useMessageAttachments(agentAvatarAttachmentIds, starshipId)
  const agentAvatarUrlById = useMemo(() => new Map(agentAvatarAttachments.map(a => [a.id, a.previewUrl] as const)), [agentAvatarAttachments])

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

    if (!schedules.length) return map

    let rangeStart: Date
    let rangeEnd: Date

    if (viewMode === 'month') {
      const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1)
      const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0)

      const startWeekday = monthStart.getDay()
      rangeStart = new Date(monthStart)
      rangeStart.setDate(monthStart.getDate() - startWeekday)

      const endWeekday = monthEnd.getDay()
      rangeEnd = new Date(monthEnd)
      rangeEnd.setDate(monthEnd.getDate() + (6 - endWeekday))
    } else {
      rangeStart = startOfWeek(currentWeekStart)
      rangeEnd = new Date(rangeStart)
      rangeEnd.setDate(rangeStart.getDate() + 6)
    }

    for (const sched of schedules) {
      const occs = generateOccurrencesForSchedule(sched, rangeStart, rangeEnd)
      for (const dt of occs) {
        const key = formatDateKey(dt)
        const arr = map.get(key) ?? []
        // clone schedule with this occurrence's nextRunAt for ordering/labeling
        const instance: ScheduleModel = { ...sched, nextRunAt: dt.toISOString() }
        arr.push(instance)
        map.set(key, arr)
      }
    }

    return map
  }, [schedules, viewMode, currentMonth, currentWeekStart])

  const monthRunsByDay = useMemo(() => {
    const map = new Map<string, MonthCalendarRun[]>()
    for (const [dayKey, daySchedules] of schedulesByDay.entries()) {
      const runs: MonthCalendarRun[] = daySchedules.map(sched => {
        const agent = sched.agentId ? agentsById.get(sched.agentId) : undefined
        const label = agent?.name || 'Agent'
        const avatarUrl = agent ? agentAvatarUrlById.get((agent as any).avatarAttachmentId) : undefined
        return {
          id: `${sched.id}-${sched.nextRunAt}`,
          runAt: sched.nextRunAt,
          agentName: label,
          agentAvatarSeed: label,
          agentAvatarUrl: avatarUrl,
          prompt: sched.prompt ? String(sched.prompt) : undefined,
        }
      })
      map.set(dayKey, runs)
    }
    return map
  }, [schedulesByDay, agentsById, agentAvatarUrlById])

  const allUpcoming = useMemo(() => {
    const now = new Date()
    return [...schedules]
      .filter(s => s.nextRunAt && new Date(s.nextRunAt).getTime() >= now.getTime())
      .sort((a, b) => {
        const da = new Date(a.nextRunAt).getTime()
        const db = new Date(b.nextRunAt).getTime()
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
              <p className="text-muted-foreground mt-2">See when your agents are scheduled to run.</p>
            </div>

            <div className="space-y-6">
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)] gap-6">
                  <Card className="frosted-glass-card shadow-frosted-lg">
                    <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between gap-3">
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
                    <CardContent className="px-2 pb-2 pt-1.5">
                      {schedulesLoading ? (
                        <div className="space-y-2">
                          {[1, 2, 3].map(i => (
                            <Skeleton key={i} className="h-8 w-full" />
                          ))}
                        </div>
                      ) : viewMode === 'month' ? (
                        <MonthScheduleCalendar currentMonth={currentMonth} monthCells={monthCells} todayKey={todayKey} runsByDay={monthRunsByDay} onDayClick={date => openScheduleModalForDate(date)} />
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
                                    const dt = new Date(s.nextRunAt)
                                    return dt.getHours() === hour
                                  })
                                  const isCurrentHourToday = cellKey === todayKey && hour === now.getHours()
                                  const sortedDaySchedules = daySchedules.slice().sort((a, b) => {
                                    const ta = new Date(a.nextRunAt).getTime()
                                    const tb = new Date(b.nextRunAt).getTime()
                                    return ta - tb
                                  })

                                  cells.push(
                                    <div
                                      key={`${cellKey}-${hour}`}
                                      onClick={() => openScheduleModalForDate(day, `${String(hour).padStart(2, '0')}:00`)}
                                      className={cn(
                                        'group relative border border-border/40 min-h-[72px] px-2 py-1.5 bg-card/60 cursor-pointer overflow-hidden',
                                        'hover:bg-primary/5 hover:border-primary/40 transition-colors',
                                        isCurrentHourToday && 'bg-sky-500/15 border-sky-500/70 dark:bg-sky-500/20 dark:border-sky-400/80'
                                      )}
                                    >
                                      {/* Collapsed single-card view with stacked illusion */}
                                      {sortedDaySchedules.length > 0 &&
                                        (() => {
                                          const latest = sortedDaySchedules[sortedDaySchedules.length - 1]
                                          const agent = latest.agentId ? agentsById.get(latest.agentId) : undefined
                                          const label = agent?.name || 'Agent'
                                          const extraCount = sortedDaySchedules.length - 1
                                          const stackLayers = Math.min(sortedDaySchedules.length, 3)

                                          return (
                                            <div className="pointer-events-none group-hover:hidden">
                                              {Array.from({ length: stackLayers }).map((_, i) => {
                                                const isTop = i === stackLayers - 1
                                                const depth = stackLayers - 1 - i
                                                const offsetY = depth * 3
                                                const offsetX = depth * 2
                                                const zIndex = 10 + i

                                                // Top layer should visually match expanded cards;
                                                // lower layers shift diagonally to create the stack illusion.
                                                const transform = isTop ? 'translate(0, 0)' : `translate(${offsetX}px, ${offsetY}px)`

                                                return (
                                                  <div
                                                    // using index here is fine; purely visual stack
                                                    key={i}
                                                    className={cn(
                                                      'absolute left-2 right-2 h-14 rounded-md px-1.5 py-1 text-left text-[10px] leading-tight overflow-hidden transition-transform',
                                                      isTop ? 'border border-border/60 bg-muted shadow-sm' : 'border border-border/40 bg-muted/80 shadow-sm'
                                                    )}
                                                    style={{ top: 4, zIndex, transform }}
                                                  >
                                                    {isTop && (
                                                      <>
                                                        <div className="flex items-center gap-1 mb-1">
                                                          <Avatar className="h-4 w-4 ring-1 ring-border/40">
                                                            <AgentAvatar
                                                              seed={agent?.name || label}
                                                              imageUrl={agent ? agentAvatarUrlById.get((agent as any).avatarAttachmentId) : undefined}
                                                              size={16}
                                                              rounded
                                                            />
                                                          </Avatar>
                                                          <span className="font-medium truncate">{label}</span>
                                                          {extraCount > 0 && <span className="ml-auto text-[9px] text-muted-foreground">+{extraCount}</span>}
                                                        </div>
                                                        {latest.prompt && <div className="text-[10px] text-muted-foreground line-clamp-2">{String(latest.prompt)}</div>}
                                                      </>
                                                    )}
                                                  </div>
                                                )
                                              })}
                                            </div>
                                          )
                                        })()}

                                      {/* Expanded ordered list on hover */}
                                      {sortedDaySchedules.length > 0 && (
                                        <div className="hidden group-hover:flex flex-col gap-1 h-full">
                                          {sortedDaySchedules.map(s => {
                                            const agent = s.agentId ? agentsById.get(s.agentId) : undefined
                                            const label = agent?.name || 'Agent'
                                            return (
                                              <div
                                                key={`${s.id}-${s.nextRunAt}`}
                                                className="w-full h-14 rounded-md border border-border/60 bg-muted px-1.5 py-1 text-left text-[10px] leading-tight shadow-sm overflow-hidden"
                                              >
                                                <div className="flex items-center gap-1 mb-1">
                                                  <Avatar className="h-4 w-4 ring-1 ring-border/40">
                                                    <AgentAvatar
                                                      seed={agent?.name || label}
                                                      imageUrl={agent ? agentAvatarUrlById.get((agent as any).avatarAttachmentId) : undefined}
                                                      size={16}
                                                      rounded
                                                    />
                                                  </Avatar>
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
                    <CardHeader className="p-4 pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Icon name="list-checks" className="h-4 w-4" />
                        Upcoming runs
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-2">
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
                        <ScrollArea className="h-[320px]">
                          <div className="space-y-2 text-xs">
                            {allUpcoming.map(s => {
                              const dt = new Date(s.nextRunAt)
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
