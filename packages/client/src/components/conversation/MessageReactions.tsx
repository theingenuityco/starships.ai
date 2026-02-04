'use client'

import { useAuth } from '@/hooks/useAuth'
import { useStarshipMembersAndInvites } from '@/hooks/useStarshipMembers'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useToggleMessageReaction } from '@/hooks/useConversations'
import { MessageReactionAction } from './MessageReactionAction'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type ReactionsMap = Record<string, string[]>

function initialsFromName(name?: string | null): string {
  if (!name || typeof name !== 'string') return 'U'
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2)
  if (parts.length === 0) return 'U'
  return (
    parts
      .map(p => p[0]?.toUpperCase())
      .filter(Boolean)
      .join('') || 'U'
  )
}

function normalizeReactions(input: unknown): ReactionsMap {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  const out: ReactionsMap = {}
  for (const [emoji, users] of Object.entries(input as Record<string, unknown>)) {
    if (!emoji) continue
    if (!Array.isArray(users)) continue
    out[String(emoji)] = users.map(u => String(u)).filter(Boolean)
  }
  return out
}

export function MessageReactions({
  conversationId,
  starshipId,
  messageId,
  reactions,
  disabled,
  className,
}: {
  conversationId: string
  starshipId: string
  messageId: string
  reactions?: ReactionsMap | null
  disabled?: boolean
  className?: string
}) {
  const { userId: authUserId } = useAuth()
  const userId = typeof authUserId === 'string' ? authUserId : ''

  const toggle = useToggleMessageReaction()
  const toggleVars = toggle.variables
  const isTogglePending = toggle.isPending
  const pendingForThisMessage = Boolean(
    isTogglePending && toggleVars && String(toggleVars.conversationId || '') === String(conversationId || '') && String(toggleVars.messageId || '') === String(messageId || '')
  )
  const pendingEmoji = pendingForThisMessage ? toggleVars?.emoji ?? null : null

  const entries = useMemo(() => {
    const r = normalizeReactions(reactions)
    const list = Object.entries(r)
      .map(([emoji, userIds]) => ({ emoji, userIds: Array.isArray(userIds) ? userIds : [] }))
      .filter(x => x.emoji && x.userIds.length > 0)
    // Stable-ish ordering: most reacted first, then emoji.
    list.sort((a, b) => b.userIds.length - a.userIds.length || a.emoji.localeCompare(b.emoji))
    return list
  }, [reactions])

  const { data: membersAndInvites } = useStarshipMembersAndInvites(starshipId, Boolean(starshipId))
  const memberByUserId = useMemo(() => {
    const list = Array.isArray((membersAndInvites as any)?.members) ? (((membersAndInvites as any).members as any[]) ?? []) : []
    const m = new Map<string, { displayName?: string | null; email?: string | null; avatar?: string | null }>()
    for (const it of list) {
      const id = typeof it?.userId === 'string' ? String(it.userId).trim() : ''
      if (!id) continue
      m.set(id, {
        displayName: typeof it?.displayName === 'string' ? String(it.displayName) : null,
        email: typeof it?.email === 'string' ? String(it.email) : null,
        avatar: typeof it?.avatar === 'string' ? String(it.avatar) : null,
      })
    }
    return m
  }, [membersAndInvites])

  const [openEmoji, setOpenEmoji] = useState<string | null>(null)
  const hoverCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const triggerByEmojiRef = useRef<Map<string, HTMLButtonElement | null>>(new Map())
  const contentByEmojiRef = useRef<Map<string, HTMLDivElement | null>>(new Map())

  const clearHoverTimers = useCallback(() => {
    if (hoverCloseTimerRef.current) {
      clearTimeout(hoverCloseTimerRef.current)
      hoverCloseTimerRef.current = null
    }
  }, [])

  const isWithinAnyReactionPopoverTarget = useCallback((node: Node | null) => {
    if (!node) return false
    for (const el of triggerByEmojiRef.current.values()) {
      if (el && el.contains(node)) return true
    }
    for (const el of contentByEmojiRef.current.values()) {
      if (el && el.contains(node)) return true
    }
    return false
  }, [])

  const openPopoverFor = useCallback(
    (emoji: string) => {
      clearHoverTimers()
      setOpenEmoji(prev => (prev === emoji ? prev : emoji))
    },
    [clearHoverTimers]
  )

  const closePopover = useCallback(
    (delayMs = 180) => {
      if (!openEmoji) return
      if (hoverCloseTimerRef.current) return
      hoverCloseTimerRef.current = setTimeout(() => {
        hoverCloseTimerRef.current = null
        setOpenEmoji(null)
      }, delayMs)
    },
    [openEmoji]
  )

  const handleTriggerPointerLeave = useCallback(
    (e: React.PointerEvent, emoji: string) => {
      const next = e.relatedTarget as Node | null
      const contentEl = contentByEmojiRef.current.get(emoji) ?? null
      if (next && contentEl && contentEl.contains(next)) return
      // Moving between reaction pills should not trigger a close (prevents flicker).
      if (isWithinAnyReactionPopoverTarget(next)) return
      closePopover(220)
    },
    [closePopover, isWithinAnyReactionPopoverTarget]
  )

  const handleContentPointerLeave = useCallback(
    (e: React.PointerEvent, emoji: string) => {
      const next = e.relatedTarget as Node | null
      const triggerEl = triggerByEmojiRef.current.get(emoji) ?? null
      if (next && triggerEl && triggerEl.contains(next)) return
      // Moving to another reaction pill (or its popover) should not trigger a close.
      if (isWithinAnyReactionPopoverTarget(next)) return
      closePopover(220)
    },
    [closePopover, isWithinAnyReactionPopoverTarget]
  )

  useEffect(() => {
    return () => {
      clearHoverTimers()
    }
  }, [clearHoverTimers])

  const doToggle = (emojiRaw: string) => {
    const emoji = String(emojiRaw || '').trim()
    if (disabled) return
    if (!emoji) return
    if (!messageId) return
    if (!userId) return
    if (!conversationId) return
    // Only block while a toggle for THIS message is in-flight.
    if (pendingForThisMessage) return
    toggle.mutate({ conversationId, messageId, emoji })
  }

  // If there are no reactions, render nothing (no empty row/spacing).
  if (entries.length === 0) return null

  return (
    <div className={cn('mt-1 flex flex-wrap items-center gap-1', className)}>
      {entries.map(({ emoji, userIds }) => {
        const count = userIds.length
        const viewerReacted = userId ? userIds.includes(userId) : false
        const isEmojiPending = Boolean(pendingEmoji && pendingEmoji === emoji)
        const idsForDisplay = userIds.slice().reverse() // newest last in DB, but we display newest first

        return (
          <Popover
            key={emoji}
            open={openEmoji === emoji}
            modal={false}
            onOpenChange={next => {
              // We open on hover (not click). However, allow Radix-driven closes (escape/outside click).
              if (!next) setOpenEmoji(prev => (prev === emoji ? null : prev))
            }}
          >
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className={cn(
                  'h-6 px-2 py-0 rounded-full text-xs font-medium gap-1',
                  viewerReacted
                    ? 'bg-primary/15 text-primary border border-primary/20 hover:bg-primary/20 hover:text-primary hover:border-primary/30'
                    : 'bg-muted/50 hover:bg-muted/60',
                  isEmojiPending ? 'opacity-70' : ''
                )}
                disabled={disabled || isEmojiPending || !userId}
                onClick={() => doToggle(emoji)}
                onPointerEnter={e => {
                  triggerByEmojiRef.current.set(emoji, e.currentTarget)
                  openPopoverFor(emoji)
                }}
                onPointerLeave={e => handleTriggerPointerLeave(e, emoji)}
                onFocus={() => openPopoverFor(emoji)}
                aria-label={`React with ${emoji}`}
              >
                <span className="text-sm leading-none">{emoji}</span>
                <span className="leading-none">{count}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent
              ref={el => {
                // Track content per emoji so hover leave can reliably detect trigger↔content transitions across portals.
                if (!el) {
                  contentByEmojiRef.current.delete(emoji)
                  return
                }
                contentByEmojiRef.current.set(emoji, el)
              }}
              align="start"
              side="bottom"
              sideOffset={8}
              className="w-64 p-1 bg-popover text-popover-foreground border border-border shadow-xl rounded-xl"
              onOpenAutoFocus={e => e.preventDefault()}
              onCloseAutoFocus={e => e.preventDefault()}
              onPointerEnter={() => openPopoverFor(emoji)}
              onPointerLeave={e => handleContentPointerLeave(e, emoji)}
              onFocus={() => openPopoverFor(emoji)}
            >
              <div className="px-2 py-2 font-normal">
                <div className="text-sm font-medium leading-tight truncate text-foreground">Reactions {emoji}</div>
              </div>
              <div className="max-h-72 overflow-y-auto overflow-x-hidden p-1">
                {idsForDisplay.map(uid => {
                  const m = memberByUserId.get(uid)
                  const label = (m?.displayName || m?.email || uid.slice(0, 8)).toString()
                  const avatar = typeof m?.avatar === 'string' ? m.avatar : null
                  return (
                    <div
                      key={uid}
                      className="group relative rounded-lg flex items-center gap-2 w-full h-8 px-2 text-[13px] font-medium border border-transparent cursor-default text-muted-foreground hover:text-foreground hover:bg-muted focus:bg-muted"
                    >
                      <div className="flex-shrink-0" style={{ width: '1.25rem', height: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: 0, pointerEvents: 'none' }}>
                        <Avatar className="h-5 w-5 rounded-full ring-1 ring-border/40 bg-muted/30 overflow-hidden">
                          {avatar ? <AvatarImage src={avatar} alt={label} referrerPolicy="no-referrer" crossOrigin="anonymous" className="rounded-full object-cover" /> : null}
                          <AvatarFallback className="rounded-full bg-muted/40 text-muted-foreground text-[9px] font-semibold">{initialsFromName(label)}</AvatarFallback>
                        </Avatar>
                      </div>
                      <span className="min-w-0 truncate">{label}</span>
                      {uid === userId ? <div className="ml-auto text-[10px] text-muted-foreground">you</div> : null}
                    </div>
                  )
                })}
              </div>
            </PopoverContent>
          </Popover>
        )
      })}
      {/* Inline "add reaction" badge only when reactions already exist */}
      {entries.length > 0 ? (
        <MessageReactionAction
          conversationId={conversationId}
          messageId={messageId}
          disabled={disabled}
          triggerStyle="pill"
          popoverAlign="start"
          className="h-6"
        />
      ) : null}
    </div>
  )
}
