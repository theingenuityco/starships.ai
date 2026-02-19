'use client'

import Icon from '@/components/primitives/Icon'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useNotificationsList } from '@/hooks/useNotifications'
import api from '@/lib/api'
import { cn } from '@/lib/utils'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'

export type ThreadNotificationLevel = 'all' | 'mentions' | 'mute'

const queryKey = (conversationId: string) => ['conversations', 'notification-level', conversationId] as const

async function fetchLevel(conversationId: string): Promise<ThreadNotificationLevel> {
  const cid = String(conversationId || '').trim()
  if (!cid) return 'mentions'
  const resp = await api.get(`/api/v1/conversations/${encodeURIComponent(cid)}/notification-level`)
  const data = (resp as any)?.data?.data as { level?: unknown } | null
  const level = typeof data?.level === 'string' ? (data.level as string) : ''
  return level === 'all' || level === 'mentions' || level === 'mute' ? (level as ThreadNotificationLevel) : 'mentions'
}

async function updateLevel(conversationId: string, level: ThreadNotificationLevel): Promise<ThreadNotificationLevel> {
  const cid = String(conversationId || '').trim()
  const resp = await api.put(`/api/v1/conversations/${encodeURIComponent(cid)}/notification-level`, { level })
  const data = (resp as any)?.data?.data as { level?: unknown } | null
  const next = typeof data?.level === 'string' ? (data.level as string) : ''
  return next === 'all' || next === 'mentions' || next === 'mute' ? (next as ThreadNotificationLevel) : level
}

function getUnreadForConversation(unread: any, conversationId: string): number {
  try {
    const cid = String(conversationId || '').trim()
    if (!cid) return 0
    const u = unread && typeof unread === 'object' ? (unread as any) : null
    const pick = (m: any): number => {
      if (!m || typeof m !== 'object') return 0
      const n = Number((m as any)[cid] ?? 0)
      return Number.isFinite(n) ? n : 0
    }
    return (
      pick(u.dmUnreadByConversationId) +
      pick(u.mentionUnreadByConversationId) +
      pick(u.reactionUnreadByConversationId) +
      pick(u.channelUnreadByConversationId)
    )
  } catch {
    return 0
  }
}

function getBadgeCountForConversation(unread: any, conversationId: string): number {
  try {
    const cid = String(conversationId || '').trim()
    if (!cid) return 0
    const u = unread && typeof unread === 'object' ? (unread as any) : null
    const mention = Number(u?.mentionUnreadByConversationId?.[cid] ?? 0)
    const m = Number.isFinite(mention) ? mention : 0
    return m
  } catch {
    return 0
  }
}

export function ThreadNotificationMenu(props: { conversationId: string; starshipId: string; className?: string }) {
  const conversationId = String(props.conversationId || '').trim()
  const starshipId = String(props.starshipId || '').trim()
  const qc = useQueryClient()

  const q = useQuery({
    queryKey: queryKey(conversationId),
    enabled: Boolean(conversationId),
    queryFn: () => fetchLevel(conversationId),
    staleTime: 30_000,
  })

  const level = (q.data ?? 'mentions') as ThreadNotificationLevel

  const mutation = useMutation({
    mutationFn: (next: ThreadNotificationLevel) => updateLevel(conversationId, next),
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: queryKey(conversationId) })
      const prev = qc.getQueryData(queryKey(conversationId)) as ThreadNotificationLevel | undefined
      qc.setQueryData(queryKey(conversationId), next)
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey(conversationId), ctx.prev)
    },
    onSuccess: (next) => {
      qc.setQueryData(queryKey(conversationId), next)
    },
  })

  const iconName = useMemo(() => {
    if (level === 'all') return 'bell-ringing'
    if (level === 'mute') return 'bell-slash'
    return 'bell'
  }, [level])
  const iconWeight = useMemo(() => (level === 'mute' ? 'regular' : 'bold'), [level])
  const label = useMemo(() => {
    if (level === 'all') return 'All messages'
    if (level === 'mute') return 'Muted'
    return 'Mentions only'
  }, [level])

  const { data: notifList } = useNotificationsList(starshipId, Boolean(starshipId))
  const unreadForThisThread = useMemo(() => {
    const unread = (notifList as any)?.unread ?? null
    return getUnreadForConversation(unread, conversationId)
  }, [notifList, conversationId])
  const badgeCount = useMemo(() => {
    const unread = (notifList as any)?.unread ?? null
    return getBadgeCountForConversation(unread, conversationId)
  }, [notifList, conversationId])
  const hasUnread = unreadForThisThread > 0
  const showBadge = badgeCount > 0
  const showDot = !showBadge && hasUnread

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn('h-8 w-8 px-0 text-muted-foreground hover:text-foreground', props.className)}
          aria-label={`Thread notifications: ${label}`}
          title={`Notifications: ${label}`}
          disabled={mutation.isPending || q.isLoading || !conversationId}
        >
          <span className="relative inline-flex h-4 w-4 items-center justify-center">
            <Icon name={iconName} weight={iconWeight as any} className={cn('h-4 w-4', level === 'mute' && 'opacity-70')} />
            {showBadge ? (
              <span
                className="absolute -top-2 -right-2 inline-flex items-center justify-center min-w-[14px] h-[14px] px-1 rounded-full bg-red-500/90 dark:bg-red-400/90 text-white text-[9px] leading-none font-semibold shadow-sm"
                aria-label={`${badgeCount} unread mentions in thread`}
                title={`${badgeCount} unread mentions`}
              >
                {badgeCount > 99 ? '99+' : String(badgeCount)}
              </span>
            ) : showDot ? (
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-red-500/90 shadow-sm" aria-hidden />
            ) : null}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[220px]">
        <DropdownMenuLabel>Thread notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={level}
          onValueChange={(v) => {
            const next = v === 'all' || v === 'mentions' || v === 'mute' ? (v as ThreadNotificationLevel) : 'mentions'
            mutation.mutate(next)
          }}
        >
          <DropdownMenuRadioItem value="all">All messages</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="mentions">Mentions only</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="mute">Mute</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

