'use client'

import { use, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { useStarshipChannels } from '@/hooks/useConversations'

export default function StarshipOverviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { slug } = use(params)
  const { data: starship } = useStarshipBySlug(slug, Boolean(slug))
  const { data: channelsData, isLoading: channelsLoading } = useStarshipChannels(starship?.id ?? '', Boolean(starship?.id))

  const defaultChannelSlug = useMemo(() => {
    const channels = channelsData?.channels ?? []
    const lobby = channels.find(
      (ch: any) =>
        String(ch?.slug || '')
          .trim()
          .toLowerCase() === 'lobby'
    )
    const lobbySlug = lobby?.slug ? String(lobby.slug) : ''
    if (lobbySlug) return lobbySlug

    const first = channels.length > 0 ? String((channels[0] as any)?.slug || '') : ''
    return first || null
  }, [channelsData?.channels])

  useEffect(() => {
    if (!slug) return
    if (!starship?.id) return
    if (channelsLoading) return

    // `agent` is a DM-only query param. If present on the ship root, route to the DM landing
    // instead of redirecting into channels (which should never receive `agent`).
    const agent = (searchParams.get('agent') || '').trim()
    if (agent) {
      router.replace(`/ship/${slug}/dm/${encodeURIComponent(agent)}`)
      return
    }

    if (!defaultChannelSlug) {
      router.replace('/marketplace')
      return
    }
    router.replace(`/ship/${slug}/channels/${encodeURIComponent(defaultChannelSlug)}`)
  }, [channelsLoading, defaultChannelSlug, router, searchParams, slug, starship?.id])

  return null
}
