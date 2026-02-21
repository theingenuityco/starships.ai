'use client'

import { useMemo, useState } from 'react'
import type { AgentTemplateModel } from '@starships/protocol'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { MarketplaceAvatar } from '@/components/marketplace/MarketplaceAvatar'

type DemoMessage = { id: string; role: 'user' | 'assistant'; content: string }

export default function HeroConversationDemo({ initialAgentTemplates }: { initialAgentTemplates?: AgentTemplateModel[] }) {
  const templates = initialAgentTemplates ?? []
  const [draft, setDraft] = useState('')

  const featured = useMemo(() => {
    const first = templates.find(t => typeof t?.name === 'string' && t.name.trim().length > 0) ?? templates[0]
    return first ?? null
  }, [templates])

  const messages: DemoMessage[] = useMemo(
    () => [
      { id: 'u1', role: 'user', content: 'Summarize the key takeaways from this week’s customer calls.' },
      { id: 'a1', role: 'assistant', content: 'On it. I’ll cluster feedback by theme (pricing, onboarding, reliability) and draft a concise weekly brief with next steps.' },
      { id: 'u2', role: 'user', content: 'Also pull out any urgent bugs or churn risks.' },
      { id: 'a2', role: 'assistant', content: 'Done. I flagged 3 high-signal issues and the accounts impacted, plus suggested mitigations and owners.' },
    ],
    []
  )

  return (
    <Card className="border-border/60 bg-card/60 backdrop-blur-sm shadow-sm">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <CardTitle className="text-base">Live demo conversation</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">A lightweight preview of the chat experience.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-[11px]">
            Explore
          </Badge>
          {featured ? (
            <div className="flex items-center gap-2 rounded-full border border-border/60 bg-background/40 px-2 py-1">
              <MarketplaceAvatar
                imageUrl={featured.avatarUrl || null}
                label={`${featured.name || 'Agent'} avatar`}
                seed={featured.name || featured.slug || 'AI'}
                sizeClassName="h-7 w-7"
                fallbackTextClassName="text-[11px] font-semibold text-muted-foreground"
              />
              <span className="max-w-[16ch] truncate text-xs font-medium">{featured.name || featured.slug}</span>
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {messages.map(m => (
            <div
              key={m.id}
              className={cn(
                'rounded-lg border border-border/60 px-3 py-2 text-sm',
                m.role === 'user' ? 'bg-background/40' : 'bg-muted/20'
              )}
            >
              <div className="mb-1 text-[11px] font-medium text-muted-foreground">{m.role === 'user' ? 'You' : 'Assistant'}</div>
              <div className="leading-relaxed">{m.content}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Try typing a message (demo only)" className="h-10" />
          <Button type="button" disabled className="h-10">
            Send
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Want the real thing? <a className="underline underline-offset-2 hover:text-foreground" href="/login">Sign in</a> and deploy an agent to your starship.
        </p>
      </CardContent>
    </Card>
  )
}

