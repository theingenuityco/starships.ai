'use client'

import Icon from '@/components/primitives/Icon'
import { Button } from '@/components/ui/button'
import { Popover, PopoverTrigger } from '@/components/ui/popover'
import { EmojiPicker } from '@/components/emoji/EmojiPicker'
import { useToggleMessageReaction } from '@/hooks/useConversations'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { useMemo, useState } from 'react'

export function MessageReactionAction({
  conversationId,
  messageId,
  disabled,
  className,
  triggerStyle = 'icon',
  popoverAlign = 'end',
}: {
  conversationId: string
  messageId: string
  disabled?: boolean
  className?: string
  triggerStyle?: 'icon' | 'pill'
  popoverAlign?: 'start' | 'end' | 'center'
}) {
  const [open, setOpen] = useState(false)
  const toggle = useToggleMessageReaction()
  const isPending = toggle.isPending
  const { userId: authUserId } = useAuth()
  const userId = typeof authUserId === 'string' ? authUserId : ''

  const canReact = Boolean(!disabled && conversationId && messageId && userId)

  const doToggle = (emojiRaw: string) => {
    const emoji = String(emojiRaw || '').trim()

    if (!canReact) return
    if (!emoji) return
    if (isPending) return
    toggle.mutate({ conversationId, messageId, emoji })
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
        {triggerStyle === 'pill' ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className={cn('h-6 px-2 py-0 rounded-full text-xs font-medium gap-1 bg-muted/50', className)}
            disabled={!canReact}
            aria-label={triggerLabel}
            title={triggerLabel}
          >
            <Icon name="smiley" className="h-4 w-4" />
            <span className="leading-none">+</span>
          </Button>
        ) : (
          <Button type="button" variant="ghost" size="icon" className={cn('h-7 w-7', className)} disabled={!canReact} aria-label={triggerLabel} title={triggerLabel}>
            <Icon name="smiley" className="h-4 w-4" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          asChild
          align={popoverAlign}
          sideOffset={4}
          className="z-[1004] p-0 bg-transparent border-0 shadow-none outline-none"
        >
          <EmojiPicker
            height={360}
            onEmojiSelect={emoji => {
              doToggle(emoji)
            }}
          />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </Popover>
  )
}
