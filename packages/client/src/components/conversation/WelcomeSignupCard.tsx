'use client'

import Icon from '@/components/primitives/Icon'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function WelcomeSignupCard({ userName, onDismiss }: { userName?: string; onDismiss: () => void }) {
  const firstName = userName?.trim()?.split(/\s+/)?.[0]

  return (
    <Card className="border-border/50 bg-gradient-to-br from-card to-muted/10 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center">
              <Icon name="sparkles" className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">{firstName ? `Welcome, ${firstName}!` : 'Welcome aboard!'}</CardTitle>
              <p className="text-sm text-muted-foreground">You’re ready to start your first conversation.</p>
            </div>
          </div>

          <Button variant="ghost" size="sm" onClick={onDismiss} className="h-8 px-2 text-muted-foreground hover:text-foreground">
            <Icon name="x" className="h-4 w-4" />
            <span className="sr-only">Dismiss welcome</span>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="grid gap-2 text-sm text-muted-foreground">
          <div className="flex items-start gap-2">
            <Icon name="check" className="h-4 w-4 translate-y-[2px] text-primary/80" />
            <span>Select an agent (or keep the default).</span>
          </div>
          <div className="flex items-start gap-2">
            <Icon name="check" className="h-4 w-4 translate-y-[2px] text-primary/80" />
            <span>Type what you want done, then hit send.</span>
          </div>
          <div className="flex items-start gap-2">
            <Icon name="check" className="h-4 w-4 translate-y-[2px] text-primary/80" />
            <span>Try an example prompt to get moving fast.</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}


