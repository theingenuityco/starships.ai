import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Avatar } from '@/components/ui/avatar'
import AgentAvatar from '@/components/animated/AgentAvatar'
import { scheduleAPI } from '@/lib/api'
import type { Agent } from '@/lib/api'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'

interface ScheduleConversationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  starshipId: string
  agents: Agent[]
  initialPrompt: string
  initialDate?: string
  initialTime?: string
  initialAgentId?: string
}

type RecurrenceOption = 'none' | 'daily' | 'weekly' | 'weekdays' | 'weekends' | 'monthly' | 'yearly' | 'custom'

export function ScheduleConversationModal({ open, onOpenChange, starshipId, agents, initialPrompt, initialDate, initialTime, initialAgentId }: ScheduleConversationModalProps) {
  const queryClient = useQueryClient()
  const [prompt, setPrompt] = useState(initialPrompt)
  const [date, setDate] = useState(initialDate || '')
  const [time, setTime] = useState(initialTime || '')
  const [agentId, setAgentId] = useState(initialAgentId || (agents[0]?.id ?? ''))
  const [recurrence, setRecurrence] = useState<RecurrenceOption>('none')
  const [customInterval, setCustomInterval] = useState<number>(1)
  const [customUnit, setCustomUnit] = useState<'day' | 'week' | 'month' | 'year'>('week')
  const [customWeekdays, setCustomWeekdays] = useState<number[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setPrompt(initialPrompt)
      setDate(initialDate || '')
      setTime(initialTime || '')
      setRecurrence('none')
      setCustomInterval(1)
      setCustomUnit('week')
      setCustomWeekdays([])

      if (initialAgentId) {
        setAgentId(initialAgentId)
      } else if (!agentId && agents.length > 0) {
        setAgentId(agents[0].id)
      }
    }
  }, [open, initialPrompt, initialDate, initialTime, initialAgentId, agents, agentId])

  const parsedLocalDate = date ? new Date(`${date}T${time || '00:00'}`) : null
  const weeklyLabel = parsedLocalDate ? `Weekly on ${parsedLocalDate.toLocaleDateString(undefined, { weekday: 'long' })}` : 'Weekly'
  const monthlyLabel = parsedLocalDate ? `Monthly on day ${parsedLocalDate.getDate()}` : 'Monthly on this day'
  const yearlyLabel = parsedLocalDate ? `Annually on ${parsedLocalDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}` : 'Annually'

  const selectedAgent = agents.find(a => a.id === agentId) || null

  const handleSubmit = async () => {
    if (!agentId) {
      toast.error('Select an agent before scheduling')
      return
    }
    const agent = agents.find(a => a.id === agentId) || null
    if (!agent) {
      toast.error('Selected agent is no longer available')
      return
    }
    if (!prompt.trim()) {
      toast.error('Prompt is required')
      return
    }
    if (!date || !time) {
      toast.error('Date and time are required')
      return
    }

    try {
      setSubmitting(true)

      const localDateTime = new Date(`${date}T${time}`)
      if (Number.isNaN(localDateTime.getTime())) {
        toast.error('Invalid date or time')
        return
      }

      const nextRunAt = localDateTime.toISOString()
      const minute = localDateTime.getUTCMinutes()
      const hour = localDateTime.getUTCHours()

      let cronExpression: string
      let isRecurring = false

      switch (recurrence) {
        case 'daily':
          // Every day at this UTC time
          cronExpression = `${minute} ${hour} * * *`
          isRecurring = true
          break
        case 'weekly': {
          // Every week on the same weekday at this UTC time
          // JavaScript: 0 (Sun) - 6 (Sat) -> cron day-of-week 0-6
          const dayOfWeek = localDateTime.getUTCDay()
          cronExpression = `${minute} ${hour} * * ${dayOfWeek}`
          isRecurring = true
          break
        }
        case 'weekdays':
          // Monday–Friday at this UTC time
          cronExpression = `${minute} ${hour} * * 1-5`
          isRecurring = true
          break
        case 'weekends':
          // Saturday and Sunday at this UTC time (0 and 6)
          cronExpression = `${minute} ${hour} * * 0,6`
          isRecurring = true
          break
        case 'monthly': {
          // Same day-of-month each month at this UTC time
          const dayOfMonth = localDateTime.getUTCDate()
          cronExpression = `${minute} ${hour} ${dayOfMonth} * *`
          isRecurring = true
          break
        }
        case 'yearly': {
          // Same month and day each year at this UTC time
          const dayOfMonth = localDateTime.getUTCDate()
          const month = localDateTime.getUTCMonth() + 1 // JS month: 0-11, cron: 1-12
          cronExpression = `${minute} ${hour} ${dayOfMonth} ${month} *`
          isRecurring = true
          break
        }
        case 'custom': {
          // Google Calendar–style custom recurrence builder
          // Repeat every N [day/week/month/year]
          if (customInterval < 1 || !Number.isFinite(customInterval)) {
            toast.error('Repeat interval must be at least 1')
            return
          }

          if (customUnit === 'week' && customInterval !== 1) {
            toast.error('For weekly custom recurrence, only an interval of 1 is supported right now')
            return
          }

          if ((customUnit === 'month' || customUnit === 'year') && customInterval !== 1) {
            toast.error('For monthly and yearly custom recurrence, only an interval of 1 is supported right now')
            return
          }

          if (customUnit === 'week') {
            const days = (customWeekdays.length ? customWeekdays : [localDateTime.getUTCDay()]).sort((a, b) => a - b)
            if (days.length === 0) {
              toast.error('Select at least one weekday')
              return
            }
            const dayList = days.join(',')
            cronExpression = `${minute} ${hour} * * ${dayList}`
          } else if (customUnit === 'day') {
            // Every N days; for N>1 we approximate using */N in day-of-month.
            const interval = Math.max(1, Math.floor(customInterval))
            cronExpression = interval === 1 ? `${minute} ${hour} * * *` : `${minute} ${hour} */${interval} * *`
          } else if (customUnit === 'month') {
            const dayOfMonth = localDateTime.getUTCDate()
            cronExpression = `${minute} ${hour} ${dayOfMonth} * *`
          } else {
            // 'year'
            const dayOfMonth = localDateTime.getUTCDate()
            const month = localDateTime.getUTCMonth() + 1
            cronExpression = `${minute} ${hour} ${dayOfMonth} ${month} *`
          }

          isRecurring = true
          break
        }
        case 'none':
        default:
          // One-shot: still store a concrete cron for debugging, but do not repeat.
          cronExpression = `${minute} ${hour} * * *`
          isRecurring = false
          break
      }

      await scheduleAPI.create({
        starshipId,
        agentId: agent.id,
        prompt,
        cronExpression,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        nextRunAt,
        isActive: true,
        isRecurring,
      })

      try {
        queryClient.invalidateQueries({ queryKey: ['starship-schedules', starshipId] })
      } catch {}

      toast.success('Scheduled conversation created')
      onOpenChange(false)
    } catch (error) {
      console.error('[ScheduleConversationModal] Failed to create schedule', error)
      toast.error('Failed to create schedule')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={open => !submitting && onOpenChange(open)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule an agent</DialogTitle>
          <DialogDescription>Pick an agent, prompt, and time to run as a new conversation.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="schedule-agent">Agent</Label>
            <Select value={agentId} onValueChange={value => setAgentId(value)} disabled={submitting || agents.length === 0}>
              <SelectTrigger id="schedule-agent" className="w-full sm:max-w-sm h-11 py-3">
                {selectedAgent ? (
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="h-8 w-8 ring-1 ring-border/40 flex-shrink-0">
                      <AgentAvatar seed={selectedAgent.name} size={32} rounded />
                    </Avatar>
                    <div className="flex flex-col min-w-0 flex-1 items-start text-left">
                      <span className="text-sm font-medium truncate leading-tight">{selectedAgent.name}</span>
                      {selectedAgent.description && <span className="text-[11px] text-muted-foreground truncate max-w-[36ch] leading-tight">{selectedAgent.description}</span>}
                    </div>
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">{agents.length === 0 ? 'No agents available' : 'Select an agent'}</span>
                )}
              </SelectTrigger>
              <SelectContent className="w-[var(--radix-select-trigger-width)] max-h-64">
                {agents.map(agent => (
                  <SelectItem key={agent.id} value={agent.id}>
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="h-8 w-8 ring-1 ring-border/40">
                        <AgentAvatar seed={agent.name} size={32} rounded />
                      </Avatar>
                      <div className="flex flex-col min-w-0 flex-1 items-start text-left">
                        <span className="text-sm font-medium truncate leading-tight">{agent.name}</span>
                        {agent.description && <span className="text-[11px] text-muted-foreground truncate max-w-[36ch] leading-tight">{agent.description}</span>}
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {agents.length === 0 && <p className="text-xs text-muted-foreground">No agents available on this starship yet.</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="schedule-prompt">Prompt</Label>
            <textarea
              id="schedule-prompt"
              className="min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y"
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              disabled={submitting}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="schedule-date">Date</Label>
              <Input id="schedule-date" type="date" value={date} onChange={e => setDate(e.target.value)} disabled={submitting} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="schedule-time">Time</Label>
              <Input id="schedule-time" type="time" value={time} onChange={e => setTime(e.target.value)} disabled={submitting} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="schedule-recurrence">Repeat</Label>
            <select
              id="schedule-recurrence"
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={recurrence}
              onChange={e => setRecurrence(e.target.value as RecurrenceOption)}
              disabled={submitting}
            >
              <option value="none">Does not repeat</option>
              <option value="daily">Every day</option>
              <option value="weekly">{weeklyLabel}</option>
              <option value="weekdays">Every weekday (Mon–Fri)</option>
              <option value="weekends">Every weekend (Sat–Sun)</option>
              <option value="monthly">{monthlyLabel}</option>
              <option value="yearly">{yearlyLabel}</option>
              <option value="custom">Custom…</option>
            </select>
            {recurrence === 'custom' && (
              <div className="mt-3 space-y-3 rounded-md border border-border/60 bg-muted/40 p-3">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Repeat every</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      className="w-16"
                      value={Number.isFinite(customInterval) ? customInterval : 1}
                      onChange={e => setCustomInterval(Number(e.target.value) || 1)}
                      disabled={submitting}
                    />
                    <select
                      className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={customUnit}
                      onChange={e => setCustomUnit(e.target.value as 'day' | 'week' | 'month' | 'year')}
                      disabled={submitting}
                    >
                      <option value="day">day</option>
                      <option value="week">week</option>
                      <option value="month">month</option>
                      <option value="year">year</option>
                    </select>
                  </div>
                </div>

                {customUnit === 'week' && (
                  <div className="space-y-1">
                    <span className="text-xs font-medium">Repeat on</span>
                    <div className="flex gap-1">
                      {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((label, index) => {
                        const isSelected = customWeekdays.includes(index)
                        return (
                          <button
                            key={label + index}
                            type="button"
                            className={`h-7 w-7 rounded-full text-[11px] font-medium transition-colors ${
                              isSelected ? 'bg-primary text-primary-foreground' : 'bg-background border border-border/60 text-muted-foreground'
                            }`}
                            onClick={() => {
                              setCustomWeekdays(prev => (prev.includes(index) ? prev.filter(d => d !== index) : [...prev, index].sort((a, b) => a - b)))
                            }}
                            disabled={submitting}
                          >
                            {label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                <p className="text-xs text-muted-foreground">Custom recurrences currently continue indefinitely (no end date or occurrence limit).</p>
              </div>
            )}
            <p className="text-xs text-muted-foreground">Repeating schedules will run again automatically according to the selected pattern.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={submitting || !agentId || agents.length === 0}>
            {submitting ? 'Scheduling…' : 'Schedule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
