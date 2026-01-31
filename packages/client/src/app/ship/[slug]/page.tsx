'use client'

import { useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { useStarshipChannels } from '@/hooks/useConversations'

export default function StarshipOverviewPage({ params }: { params: { slug: string } }) {
  const router = useRouter()
  const slug = params.slug
  const { data: starship } = useStarshipBySlug(slug, Boolean(slug))
  const { data: channelsData, isLoading: channelsLoading } = useStarshipChannels(starship?.id ?? '', Boolean(starship?.id))

  const defaultChannelConversationId = useMemo(() => {
    const channels = channelsData?.channels ?? []
    const lobby = channels.find((ch: any) => String(ch?.slug || '').trim().toLowerCase() === 'lobby')
    const lobbyConversationId = lobby?.conversationId ? String(lobby.conversationId) : ''
    if (lobbyConversationId) return lobbyConversationId

    const first = channels.length > 0 ? String((channels[0] as any)?.conversationId || '') : ''
    return first || null
  }, [channelsData?.channels])

  useEffect(() => {
    if (!slug) return
    if (!starship?.id) return
    if (channelsLoading) return
    if (!defaultChannelConversationId) {
      router.replace('/marketplace')
      return
    }
    router.replace(`/ship/${slug}/conversations/${defaultChannelConversationId}`)
  }, [channelsLoading, defaultChannelConversationId, router, slug, starship?.id])

  return null
}
