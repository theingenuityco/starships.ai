import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { scheduleAPI } from '@/lib/api'
import type { Agent } from '@/lib/api'
import { toast } from 'sonner'

interface ScheduleConversationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  starshipId: string
  agent: Agent | null
  initialPrompt: string
}

export function ScheduleConversationModal({ open, onOpenChange, starshipId, agent, initialPrompt }: ScheduleConversationModalProps) {
  const [prompt, setPrompt] = useState(initialPrompt)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!agent) {
      toast.error('Select an agent before scheduling')
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

      // MVP: one-shot schedule; use a simple cron that matches the minute
      const cronExpression = `${localDateTime.getUTCMinutes()} ${localDateTime.getUTCHours()} * * *`

      await scheduleAPI.create({
        starshipId,
        agentId: agent.id,
        prompt,
        cronExpression,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        nextRunAt,
        isActive: true,
      })

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
          <DialogTitle>Schedule this agent</DialogTitle>
          <DialogDescription>Pick a time to run this prompt as a new conversation.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="schedule-agent">Agent</Label>
            <div id="schedule-agent" className="text-sm text-foreground">
              {agent ? agent.name : 'No agent selected'}
            </div>
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
        </div>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={submitting || !agent}>
            {submitting ? 'Scheduling…' : 'Schedule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}


