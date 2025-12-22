'use client'

import { useMemo } from 'react'
import { MonthScheduleCalendar, type MonthCalendarCell, type MonthCalendarRun } from '@/components/schedules/MonthScheduleCalendar'

function formatDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${day}`
}

function fnv1a32(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    // 32-bit FNV-1a prime
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function lastDayOfMonth(monthStart: Date): Date {
  return new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0)
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

export default function ScheduleRepetitiveTasksDemo() {
  const now = new Date()

  const currentMonth = useMemo(() => new Date(now.getFullYear(), now.getMonth(), 1), [now.getFullYear(), now.getMonth()])
  const todayKey = useMemo(() => formatDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate())), [now.getFullYear(), now.getMonth(), now.getDate()])

  const monthCells: MonthCalendarCell[] = useMemo(() => {
    const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1)
    const monthEnd = lastDayOfMonth(monthStart)

    const startWeekday = monthStart.getDay() // 0 (Sun) - 6 (Sat)
    const gridStart = new Date(monthStart)
    gridStart.setDate(monthStart.getDate() - startWeekday)

    const endWeekday = monthEnd.getDay()
    const gridEnd = new Date(monthEnd)
    gridEnd.setDate(monthEnd.getDate() + (6 - endWeekday))

    const cells: MonthCalendarCell[] = []
    const cursor = new Date(gridStart)
    while (cursor <= gridEnd) {
      const d = new Date(cursor)
      cells.push({ date: d, key: formatDateKey(d) })
      cursor.setDate(cursor.getDate() + 1)
    }
    return cells
  }, [currentMonth])

  const runsByDay = useMemo(() => {
    const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1)
    const monthEnd = lastDayOfMonth(monthStart)

    const seed = fnv1a32(`landing-schedule-demo:${monthStart.getFullYear()}-${monthStart.getMonth() + 1}`)
    const rand = mulberry32(seed)

    const agents = [
      {
        name: 'Support Inbox Assistant',
        prompts: ['Triage the support inbox and draft responses for approval.', 'Summarize urgent customer threads and propose next steps.'],
      },
      {
        name: 'Release Notes Drafter',
        prompts: ['Draft the weekly Slack update from GitHub changes.', 'Summarize merged PRs and highlight any user-facing changes.'],
      },
      {
        name: 'KPI Analyst',
        prompts: ['Prepare KPI snapshot + chart for standup.', 'Summarize weekly KPIs and flag anomalies.'],
      },
      {
        name: 'Competitor Researcher',
        prompts: ['Compile competitor changes and summarize the top takeaways.', 'Generate a short brief for tomorrow’s planning.'],
      },
      {
        name: 'Newsletter Writer',
        prompts: ['Draft the monthly newsletter outline.', 'Create a content brief for the next blog post.'],
      },
    ]

    const map = new Map<string, MonthCalendarRun[]>()
    const usedKeys = new Set<string>()

    const addRun = (date: Date, hour: number, minute: number, agentName: string, prompt: string) => {
      const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), clamp(hour, 7, 20), clamp(minute, 0, 59), 0, 0)
      const key = formatDateKey(d)
      // Limit to month (avoid clutter in adjacent month cells)
      if (d < monthStart || d > monthEnd) return
      const arr = map.get(key) ?? []
      const id = `${key}-${agentName}-${hour}-${minute}-${arr.length}`
      arr.push({ id, runAt: d.toISOString(), agentName, agentAvatarSeed: agentName, prompt })
      map.set(key, arr)
      usedKeys.add(key)
    }

    // Sensible recurring patterns for the demo month (kept intentionally sparse for the landing page)
    const cursor = new Date(monthStart)
    while (cursor <= monthEnd) {
      const weekday = cursor.getDay() // 0 Sun ... 6 Sat
      const dayOfMonth = cursor.getDate()
      const weekOfMonth = Math.floor((dayOfMonth - 1) / 7) + 1 // 1..5

      if (weekday === 1 && dayOfMonth <= 7) {
        // First Monday: KPI snapshot
        addRun(cursor, 9, 15, 'KPI Analyst', 'Prepare KPI snapshot + chart for standup.')
      } else if (weekday === 3 && weekOfMonth % 2 === 1) {
        // Wednesdays (every other week): inbox triage
        addRun(cursor, 13, 30, 'Support Inbox Assistant', 'Triage the support inbox and draft responses for approval.')
      } else if (weekday === 5 && weekOfMonth % 2 === 0) {
        // Fridays (every other week): release notes
        addRun(cursor, 16, 0, 'Release Notes Drafter', 'Draft the weekly Slack update from GitHub changes.')
      }
      cursor.setDate(cursor.getDate() + 1)
    }

    // Monthly anchors
    addRun(monthStart, 10, 0, 'Competitor Researcher', 'Compile competitor changes and summarize the top takeaways.')
    const midMonth = new Date(monthStart.getFullYear(), monthStart.getMonth(), 15)
    if (midMonth.getMonth() === monthStart.getMonth()) {
      addRun(midMonth, 11, 0, 'Newsletter Writer', 'Draft the monthly newsletter outline.')
    }

    // Random but sensible extra runs (weekdays only, business hours)
    const weekdayDates: Date[] = []
    const c2 = new Date(monthStart)
    while (c2 <= monthEnd) {
      const wd = c2.getDay()
      if (wd >= 1 && wd <= 5) weekdayDates.push(new Date(c2))
      c2.setDate(c2.getDate() + 1)
    }

    const pickOne = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)]
    const pickHour = () => pickOne([10, 11, 14, 15, 16])
    const pickMinute = () => pickOne([0, 15, 30, 45])

    const extraCount = 2
    let tries = 0
    let added = 0
    while (added < extraCount && tries++ < 200) {
      const d = pickOne(weekdayDates)
      const key = formatDateKey(d)
      // Prefer spreading extras across the month
      if (usedKeys.has(key) && rand() < 0.75) continue
      const agent = pickOne(agents)
      const prompt = pickOne(agent.prompts)
      addRun(d, pickHour(), pickMinute(), agent.name, prompt)
      added += 1
    }

    // Add a couple of multi-run days to showcase stacking
    const keys = Array.from(map.keys())
    const multiDays = Math.min(1, keys.length)
    for (let i = 0; i < multiDays; i++) {
      const key = keys[Math.floor(rand() * keys.length)]
      const [y, m, dd] = key.split('-').map(Number)
      const date = new Date(y, (m || 1) - 1, dd || 1)
      const agent = pickOne(agents)
      addRun(date, pickHour(), pickMinute(), agent.name, pickOne(agent.prompts))
    }

    // Sort each day for stable rendering
    for (const [k, runs] of map.entries()) {
      map.set(
        k,
        runs.slice().sort((a, b) => {
          const ta = a.runAt ? new Date(a.runAt).getTime() : 0
          const tb = b.runAt ? new Date(b.runAt).getTime() : 0
          return ta - tb
        })
      )
    }

    return map
  }, [currentMonth])

  return (
    <div className="w-full">
      <div className="relative z-10 rounded-2xl overflow-hidden border border-white/20 bg-background shadow-md shadow-black/30">
        <div className="px-4 sm:px-6 py-4 border-b border-border/40 bg-background/10 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium leading-none truncate">Schedules</div>
              <div className="mt-1 text-xs text-muted-foreground truncate">Monthly calendar (demo)</div>
            </div>
            <div className="text-[11px] px-2 py-0.5 rounded-full border border-emerald-400/25 text-emerald-300 bg-emerald-500/10">preview</div>
          </div>
        </div>

        <div className="p-2 sm:p-3">
          <MonthScheduleCalendar currentMonth={currentMonth} monthCells={monthCells} todayKey={todayKey} runsByDay={runsByDay} />
        </div>
      </div>
    </div>
  )
}


