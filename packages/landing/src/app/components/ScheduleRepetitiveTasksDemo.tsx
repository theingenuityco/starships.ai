'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import Icon from '@/components/primitives/Icon'

export default function ScheduleRepetitiveTasksDemo() {
  return (
    <Card className="border-border/60 bg-card/60 backdrop-blur-sm shadow-sm">
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <CardTitle className="text-base">Scheduling preview</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">Set it once. Review outcomes and approvals.</p>
        </div>
        <Badge variant="secondary" className="w-fit">
          Cron
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-background/40 p-3">
          <div className="min-w-0">
            <div className="font-medium">Weekly metrics brief</div>
            <div className="mt-1 text-muted-foreground">Every Monday at 9:00 AM</div>
          </div>
          <code className="rounded-md border border-border/60 bg-card/60 px-2 py-1 text-[12px] text-muted-foreground">0 9 * * 1</code>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
            <div className="flex items-center gap-2">
              <Icon name="check-circle" className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <div className="font-medium">Runs automatically</div>
            </div>
            <div className="mt-1 text-muted-foreground">Outputs are saved as a thread and can be shared.</div>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
            <div className="flex items-center gap-2">
              <Icon name="alert-triangle" className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <div className="font-medium">Optional approval</div>
            </div>
            <div className="mt-1 text-muted-foreground">Require review before sending updates externally.</div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

