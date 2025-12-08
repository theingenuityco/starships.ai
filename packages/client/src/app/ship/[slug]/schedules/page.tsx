'use client'

import React, { useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'

import Icon from '@/components/primitives/Icon'
import { PageLayout } from '@/components/layout/PageLayout'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { cn } from '@/lib/utils'
import { scheduleAPI } from '@/lib/api'
import type { ScheduleModel, AgentModel } from '@starships/protocol'
import { useStarshipBySlug, useStarshipAgents } from '@/hooks/useStarships'

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

export default function StarshipSchedulesPage(): React.JSX.Element {
  const router = useRouter()
  const { slug } = useParams<{ slug: string }>()

  const { data: starship } = useStarshipBySlug(slug, true)
  const starshipId = starship?.id || ''

  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })

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

  const todayKey = formatDateKey(startOfDay(new Date()))

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

  const handlePrevMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
  }

  const handleNextMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
  }

  const monthLabel = currentMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

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

            <Tabs
              value="schedules"
              onValueChange={value => {
                if (value === 'ship') router.push(`/ship/${slug}`)
                else if (value === 'agents') router.push(`/ship/${slug}/agents`)
                else if (value === 'tools') router.push(`/ship/${slug}/tools`)
                else if (value === 'schedules') router.push(`/ship/${slug}/schedules`)
              }}
              className="space-y-6"
            >
              <div className="flex justify-center">
                <TabsList className="mx-auto w-full sm:w-auto flex-wrap justify-center gap-1 rounded-2xl border border-border/40 bg-background/70 p-1 shadow-sm">
                  <TabsTrigger value="ship" className="gap-2 rounded-xl px-3 py-1">
                    <Icon name="rocket" className="h-4 w-4" />
                    <span>Ship</span>
                  </TabsTrigger>
                  <TabsTrigger value="agents" className="gap-2 rounded-xl px-3 py-1">
                    <Icon name="head-circuit" className="h-4 w-4" />
                    <span>Agents</span>
                  </TabsTrigger>
                  <TabsTrigger value="tools" className="gap-2 rounded-xl px-3 py-1">
                    <Icon name="wrench" className="h-4 w-4" />
                    <span>Tools</span>
                  </TabsTrigger>
                  <TabsTrigger value="schedules" className="gap-2 rounded-xl px-3 py-1">
                    <Icon name="clock" className="h-4 w-4" />
                    <span>Schedules</span>
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="schedules">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <Card className="lg:col-span-2 frosted-glass-card shadow-frosted-lg">
                    <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <Icon name="calendar" className="h-4 w-4" />
                          Calendar
                        </CardTitle>
                      </div>
                      <div className="flex items-center gap-2">
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
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      {schedulesLoading ? (
                        <div className="space-y-2">
                          {[1, 2, 3].map(i => (
                            <Skeleton key={i} className="h-8 w-full" />
                          ))}
                        </div>
                      ) : (
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
                                <div
                                  key={cell.key}
                                  className={cn(
                                    'min-h-[72px] rounded-lg border p-1.5 flex flex-col gap-1 bg-card/80',
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
                                </div>
                              )
                            })}
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
                          <p>Use the “Schedule this agent” button from a conversation to create one.</p>
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
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </PageLayout>
  )
}
