'use client'

import { useAuth } from '@/hooks/useAuth'
import { useStarshipMembersAndInvites } from '@/hooks/useStarshipMembers'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useToggleMessageReaction } from '@/hooks/useConversations'
import { useMemo } from 'react'

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
  const pendingEmoji = (toggle as any)?.variables?.emoji ? String((toggle as any).variables.emoji) : null
  const isPending = Boolean((toggle as any)?.isPending)

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

  const doToggle = (emojiRaw: string) => {
    const emoji = String(emojiRaw || '').trim()
    if (disabled) return
    if (!emoji) return
    if (!messageId) return
    if (!userId) return
    if (!conversationId) return
    if (isPending) return
    toggle.mutate({ conversationId, messageId, emoji } as any)
  }

  // If there are no reactions, render nothing (no empty row/spacing).
  if (entries.length === 0) return null

  return (
    <div className={cn('mt-1 flex flex-wrap items-center gap-1', className)}>
      {entries.map(({ emoji, userIds }) => {
        const count = userIds.length
        const viewerReacted = userId ? userIds.includes(userId) : false
        const isPending = pendingEmoji === emoji
        const idsForDisplay = userIds.slice().reverse() // newest last in DB, but we display newest first

        return (
          <Popover key={emoji}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className={cn(
                  'h-6 px-2 py-0 rounded-full text-xs font-medium gap-1',
                  viewerReacted ? 'bg-primary/15 text-primary border border-primary/20' : 'bg-muted/50',
                  isPending ? 'opacity-70' : ''
                )}
                disabled={disabled || (isPending && pendingEmoji === emoji) || !userId}
                onClick={() => doToggle(emoji)}
                aria-label={`React with ${emoji}`}
              >
                <span className="text-sm leading-none">{emoji}</span>
                <span className="leading-none">{count}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-2">
              <div className="text-xs font-medium text-muted-foreground mb-2">{emoji} reacted by</div>
              <div className="max-h-56 overflow-auto space-y-1">
                {idsForDisplay.map(uid => {
                  const m = memberByUserId.get(uid)
                  const label = (m?.displayName || m?.email || uid.slice(0, 8)).toString()
                  const avatar = typeof m?.avatar === 'string' ? m.avatar : null
                  return (
                    <div key={uid} className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted/50">
                      <Avatar className="h-6 w-6 ring-1 ring-border/40">
                        {avatar ? <AvatarImage src={avatar} alt={label} referrerPolicy="no-referrer" crossOrigin="anonymous" /> : null}
                        <AvatarFallback className="text-[10px]">{initialsFromName(label)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">{label}</div>
                      </div>
                      {uid === userId ? <div className="text-[10px] text-muted-foreground">you</div> : null}
                    </div>
                  )
                })}
              </div>
            </PopoverContent>
          </Popover>
        )
      })}
    </div>
  )
}
