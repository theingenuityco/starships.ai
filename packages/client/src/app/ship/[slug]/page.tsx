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

  const defaultChannelSlug = useMemo(() => {
    const channels = channelsData?.channels ?? []
    const lobby = channels.find((ch: any) => String(ch?.slug || '').trim().toLowerCase() === 'lobby')
    const lobbySlug = lobby?.slug ? String(lobby.slug) : ''
    if (lobbySlug) return lobbySlug

    const first = channels.length > 0 ? String((channels[0] as any)?.slug || '') : ''
    return first || null
  }, [channelsData?.channels])

  useEffect(() => {
    if (!slug) return
    if (!starship?.id) return
    if (channelsLoading) return
    if (!defaultChannelSlug) {
      router.replace('/marketplace')
      return
    }
    router.replace(`/ship/${slug}/channels/${encodeURIComponent(defaultChannelSlug)}`)
  }, [channelsLoading, defaultChannelSlug, router, slug, starship?.id])

  return null
}
