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
import api from '@/lib/api'
import { cn } from '@/lib/utils'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'

export type ChannelNotificationLevel = 'all' | 'mentions' | 'mute'

const queryKey = (channelId: string) => ['channels', 'notification-level', channelId] as const

async function fetchLevel(channelId: string): Promise<ChannelNotificationLevel> {
  const cid = String(channelId || '').trim()
  if (!cid) return 'mentions'
  const resp = await api.get(`/api/v1/channels/${encodeURIComponent(cid)}/notification-level`)
  const data = (resp as any)?.data?.data as { level?: unknown } | null
  const level = typeof data?.level === 'string' ? (data.level as string) : ''
  return level === 'all' || level === 'mentions' || level === 'mute' ? (level as ChannelNotificationLevel) : 'mentions'
}

async function updateLevel(channelId: string, level: ChannelNotificationLevel): Promise<ChannelNotificationLevel> {
  const cid = String(channelId || '').trim()
  const resp = await api.put(`/api/v1/channels/${encodeURIComponent(cid)}/notification-level`, { level })
  const data = (resp as any)?.data?.data as { level?: unknown } | null
  const next = typeof data?.level === 'string' ? (data.level as string) : ''
  return next === 'all' || next === 'mentions' || next === 'mute' ? (next as ChannelNotificationLevel) : level
}

export function ChannelNotificationMenu(props: { channelId: string; className?: string }) {
  const channelId = String(props.channelId || '').trim()
  const qc = useQueryClient()

  const q = useQuery({
    queryKey: queryKey(channelId),
    enabled: Boolean(channelId),
    queryFn: () => fetchLevel(channelId),
    staleTime: 30_000,
  })

  const level = (q.data ?? 'mentions') as ChannelNotificationLevel

  const mutation = useMutation({
    mutationFn: (next: ChannelNotificationLevel) => updateLevel(channelId, next),
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: queryKey(channelId) })
      const prev = qc.getQueryData(queryKey(channelId)) as ChannelNotificationLevel | undefined
      qc.setQueryData(queryKey(channelId), next)
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey(channelId), ctx.prev)
    },
    onSuccess: (next) => {
      qc.setQueryData(queryKey(channelId), next)
    },
  })

  const iconWeight = useMemo(() => (level === 'mute' ? 'regular' : 'bold'), [level])
  const label = useMemo(() => {
    if (level === 'all') return 'All messages'
    if (level === 'mute') return 'Muted'
    return 'Mentions only'
  }, [level])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn('h-8 w-8 px-0 text-muted-foreground hover:text-foreground', props.className)}
          aria-label={`Channel notifications: ${label}`}
          title={`Notifications: ${label}`}
          disabled={mutation.isPending || q.isLoading || !channelId}
        >
          <Icon name="bell" weight={iconWeight as any} className={cn('h-4 w-4', level === 'mute' && 'opacity-70')} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[220px]">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={level}
          onValueChange={(v) => {
            const next = v === 'all' || v === 'mentions' || v === 'mute' ? (v as ChannelNotificationLevel) : 'mentions'
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

