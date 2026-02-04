'use client'

import Icon from '@/components/primitives/Icon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useToggleMessageReaction } from '@/hooks/useConversations'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import { useMemo, useState } from 'react'

const DEFAULT_REACTIONS = ['👍', '❤️', '😂', '🎉', '😮', '😢', '👀'] as const

export function MessageReactionAction({ conversationId, messageId, disabled, className }: { conversationId: string; messageId: string; disabled?: boolean; className?: string }) {
  const [open, setOpen] = useState(false)
  const [customEmoji, setCustomEmoji] = useState('')
  const toggle = useToggleMessageReaction()
  const isPending = Boolean((toggle as any)?.isPending)
  const { userId: authUserId } = useAuth()
  const userId = typeof authUserId === 'string' ? authUserId : ''

  const canReact = Boolean(!disabled && conversationId && messageId && userId)

  const doToggle = (emojiRaw: string) => {
    const emoji = String(emojiRaw || '').trim()

    if (!canReact) return
    if (!emoji) return
    if (isPending) return
    toggle.mutate({ conversationId, messageId, emoji } as any)
    // Close after a selection so it feels like a quick action.
    setOpen(false)
  }

  const triggerLabel = useMemo(() => {
    if (!canReact) return 'Reactions unavailable'
    return 'Add reaction'
  }, [canReact])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className={cn('h-7 w-7', className)} disabled={!canReact} aria-label={triggerLabel} title={triggerLabel}>
          <Icon name="smiley" className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        <div className="flex flex-wrap gap-1 mb-2">
          {DEFAULT_REACTIONS.map(e => (
            <Button key={e} type="button" variant="secondary" size="sm" className="h-8 w-8 p-0 text-lg" onClick={() => doToggle(e)}>
              {e}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input value={customEmoji} onChange={ev => setCustomEmoji(ev.target.value)} placeholder="Custom emoji…" className="h-8 text-sm" maxLength={32} />
          <Button type="button" size="sm" className="h-8" onClick={() => doToggle(customEmoji)}>
            Add
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
