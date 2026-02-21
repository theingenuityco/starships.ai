'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Icon from '@/components/primitives/Icon'

export default function DelegationDemo() {
  return (
    <Card className="border-border/60 bg-card/60 backdrop-blur-sm shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Delegation preview</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">Ask once, get a coordinated result back.</p>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-background/40 p-3">
          <Icon name="message-square" className="h-4 w-4 text-muted-foreground mt-0.5" />
          <div>
            <div className="font-medium">You</div>
            <div className="text-muted-foreground">“Draft a launch plan and a checklist for rollout.”</div>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
            <div className="text-xs font-semibold text-muted-foreground">Specialist 1</div>
            <div className="mt-1">Launch timeline</div>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
            <div className="text-xs font-semibold text-muted-foreground">Specialist 2</div>
            <div className="mt-1">Risk mitigation</div>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
            <div className="text-xs font-semibold text-muted-foreground">Specialist 3</div>
            <div className="mt-1">Rollout checklist</div>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-background/40 p-3">
          <Icon name="sparkles" className="h-4 w-4 text-muted-foreground mt-0.5" />
          <div>
            <div className="font-medium">Assistant</div>
            <div className="text-muted-foreground">“Here’s a single consolidated plan with owners, dates, and go/no-go criteria.”</div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

