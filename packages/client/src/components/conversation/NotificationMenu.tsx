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

export type NotificationLevel = 'all' | 'mentions' | 'mute'

export type NotificationMenuType = 'channel' | 'thread'

type NotificationMenuProps =
  | {
      type: 'channel'
      channelId: string
      starshipId: string
      className?: string
    }
  | {
      type: 'thread'
      conversationId: string
      starshipId: string
      className?: string
    }

const getQueryKey = (type: NotificationMenuType, id: string) => {
  if (type === 'channel') {
    return ['channels', 'notification-level', id] as const
  }
  return ['conversations', 'notification-level', id] as const
}

const getApiPath = (type: NotificationMenuType, id: string) => {
  if (type === 'channel') {
    return `/api/v1/channels/${encodeURIComponent(id)}/notification-level`
  }
  return `/api/v1/conversations/${encodeURIComponent(id)}/notification-level`
}

async function fetchLevel(type: NotificationMenuType, id: string): Promise<NotificationLevel> {
  const cid = String(id || '').trim()
  if (!cid) return 'mentions'
  const resp = await api.get(getApiPath(type, cid))
  const data = (resp as any)?.data?.data as { level?: unknown } | null
  const level = typeof data?.level === 'string' ? (data.level as string) : ''
  return level === 'all' || level === 'mentions' || level === 'mute' ? (level as NotificationLevel) : 'mentions'
}

async function updateLevel(type: NotificationMenuType, id: string, level: NotificationLevel): Promise<NotificationLevel> {
  const cid = String(id || '').trim()
  const resp = await api.put(getApiPath(type, cid), { level })
  const data = (resp as any)?.data?.data as { level?: unknown } | null
  const next = typeof data?.level === 'string' ? (data.level as string) : ''
  return next === 'all' || next === 'mentions' || next === 'mute' ? (next as NotificationLevel) : level
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
    // Sum across all known notification kinds for this conversationId.
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

export function NotificationMenu(props: NotificationMenuProps) {
  const type = props.type
  const id = type === 'channel' ? props.channelId : props.conversationId
  const starshipId = String(props.starshipId || '').trim()
  const qc = useQueryClient()

  const q = useQuery({
    queryKey: getQueryKey(type, id),
    enabled: Boolean(id),
    queryFn: () => fetchLevel(type, id),
    staleTime: 30_000,
  })

  const level = (q.data ?? 'mentions') as NotificationLevel

  const mutation = useMutation({
    mutationFn: (next: NotificationLevel) => updateLevel(type, id, next),
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: getQueryKey(type, id) })
      const prev = qc.getQueryData(getQueryKey(type, id)) as NotificationLevel | undefined
      qc.setQueryData(getQueryKey(type, id), next)
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(getQueryKey(type, id), ctx.prev)
    },
    onSuccess: (next) => {
      qc.setQueryData(getQueryKey(type, id), next)
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
  const unreadForThisConversation = useMemo(() => {
    const unread = (notifList as any)?.unread ?? null
    return getUnreadForConversation(unread, id)
  }, [notifList, id])
  const badgeCount = useMemo(() => {
    const unread = (notifList as any)?.unread ?? null
    return getBadgeCountForConversation(unread, id)
  }, [notifList, id])
  const hasUnread = unreadForThisConversation > 0
  const showBadge = badgeCount > 0
  const showDot = !showBadge && hasUnread

  const menuLabel = type === 'channel' ? 'Notifications' : 'Thread notifications'
  const ariaLabelPrefix = type === 'channel' ? 'Channel notifications' : 'Thread notifications'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn('h-8 w-8 px-0 text-muted-foreground hover:text-foreground', props.className)}
          aria-label={`${ariaLabelPrefix}: ${label}`}
          title={`Notifications: ${label}`}
          disabled={mutation.isPending || q.isLoading || !id}
        >
          <span className="relative inline-flex h-4 w-4 items-center justify-center">
            <Icon name={iconName} weight={iconWeight as any} className={cn('h-4 w-4', level === 'mute' && 'opacity-70')} />
            {type === 'thread' && showBadge ? (
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
        <DropdownMenuLabel>{menuLabel}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={level}
          onValueChange={(v) => {
            const next = v === 'all' || v === 'mentions' || v === 'mute' ? (v as NotificationLevel) : 'mentions'
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
