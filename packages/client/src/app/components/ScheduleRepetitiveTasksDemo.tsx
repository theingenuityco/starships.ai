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

    type TaskType = 'inbox' | 'report' | 'research' | 'content'
    const agents = [
      { name: 'Support Inbox Assistant', prompts: ['Sort inbox, draft replies.', 'Urgent threads and next steps.'], taskType: 'inbox' as TaskType },
      { name: 'Release Notes Drafter', prompts: ['Slack update from GitHub.', 'PRs and user-facing changes.'], taskType: 'report' as TaskType },
      { name: 'KPI Analyst', prompts: ['KPI snapshot for standup.', 'Weekly KPIs, flag anomalies.'], taskType: 'report' as TaskType },
      { name: 'Competitor Researcher', prompts: ['Competitor brief.', 'Brief for planning.'], taskType: 'research' as TaskType },
      { name: 'Newsletter Writer', prompts: ['Newsletter outline.', 'Content brief for blog.'], taskType: 'content' as TaskType },
    ]

    const map = new Map<string, MonthCalendarRun[]>()
    const usedKeys = new Set<string>()

    const addRun = (date: Date, hour: number, minute: number, agentName: string, prompt: string, taskType: TaskType) => {
      const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), clamp(hour, 7, 20), clamp(minute, 0, 59), 0, 0)
      const key = formatDateKey(d)
      if (d < monthStart || d > monthEnd) return
      const arr = map.get(key) ?? []
      const id = `${key}-${agentName}-${hour}-${minute}-${arr.length}`
      arr.push({ id, runAt: d.toISOString(), agentName, agentAvatarSeed: agentName, prompt, taskType })
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
        addRun(cursor, 9, 15, 'KPI Analyst', 'KPI snapshot for standup.', 'report')
      } else if (weekday === 2 && weekOfMonth <= 2) {
        addRun(cursor, 10, 0, 'Competitor Researcher', 'Competitor brief.', 'research')
      } else if (weekday === 3 && weekOfMonth % 2 === 1) {
        addRun(cursor, 13, 30, 'Support Inbox Assistant', 'Sort inbox, draft replies.', 'inbox')
      } else if (weekday === 5 && weekOfMonth % 2 === 0) {
        addRun(cursor, 16, 0, 'Release Notes Drafter', 'Slack update from GitHub.', 'report')
      }
      cursor.setDate(cursor.getDate() + 1)
    }

    addRun(monthStart, 10, 0, 'Competitor Researcher', 'Competitor brief.', 'research')
    const midMonth = new Date(monthStart.getFullYear(), monthStart.getMonth(), 15)
    if (midMonth.getMonth() === monthStart.getMonth()) {
      addRun(midMonth, 11, 0, 'Newsletter Writer', 'Newsletter outline.', 'content')
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

    const extraCount = 4
    let tries = 0
    let added = 0
    while (added < extraCount && tries++ < 200) {
      const d = pickOne(weekdayDates)
      const key = formatDateKey(d)
      if (usedKeys.has(key) && rand() < 0.75) continue
      const agent = pickOne(agents)
      const prompt = pickOne(agent.prompts)
      addRun(d, pickHour(), pickMinute(), agent.name, prompt, agent.taskType)
      added += 1
    }

    const keys = Array.from(map.keys())
    const multiDays = Math.min(2, keys.length)
    for (let i = 0; i < multiDays; i++) {
      const key = keys[Math.floor(rand() * keys.length)]
      const [y, m, dd] = key.split('-').map(Number)
      const date = new Date(y, (m || 1) - 1, dd || 1)
      const agent = pickOne(agents)
      addRun(date, pickHour(), pickMinute(), agent.name, pickOne(agent.prompts), agent.taskType)
    }

    // Ensure at least 2 runs on days that already have at least one
    for (const key of map.keys()) {
      const runs = map.get(key) ?? []
      let toAdd = Math.max(0, 2 - runs.length)
      if (toAdd === 0) continue
      const [y, m, dd] = key.split('-').map(Number)
      const dayDate = new Date(y, (m || 1) - 1, dd || 1)
      while (toAdd > 0) {
        const agent = pickOne(agents)
        addRun(dayDate, pickHour(), pickMinute(), agent.name, pickOne(agent.prompts), agent.taskType)
        toAdd -= 1
      }
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
      {/* Use bright chat theme inside the calendar card to match the hero demo */}
      <div className="star-theme-light relative z-10 rounded-2xl overflow-hidden border border-white/20 bg-background shadow-md shadow-black/30">
        <div className="px-4 sm:px-6 py-3.5 border-b bg-[#FFF7ED] border-[#FCD9A5]">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex items-center gap-2">
              <div className="text-sm font-medium leading-none truncate text-slate-900">This month</div>
              <div className="text-[11px] px-2 py-0.5 rounded-full border border-amber-400/40 text-amber-700 bg-amber-100">Demo</div>
            </div>
          </div>
        </div>

        <div className="p-2 sm:p-3">
          <MonthScheduleCalendar currentMonth={currentMonth} monthCells={monthCells} todayKey={todayKey} runsByDay={runsByDay} />
        </div>
      </div>
    </div>
  )
}
