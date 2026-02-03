'use client'

import { useEffect } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ConversationInterface } from '@/components/conversation/ConversationInterface'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { useStarshipChannels } from '@/hooks/useConversations'
import { useStarshipAgents } from '@/hooks/useAgents'

export default function DraftDmPage() {
  const { slug } = useParams<{ slug: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()

  const { data: starship } = useStarshipBySlug(slug, Boolean(slug))
  const { data: channelsData } = useStarshipChannels(starship?.id ?? '', Boolean(starship?.id))
  const { data: agentsData } = useStarshipAgents(starship?.id ?? '', Boolean(starship?.id))

  // Guard: this route is only for draft DMs. Otherwise, go to default channel.
  useEffect(() => {
    const dm = (searchParams.get('dm') || '').trim()
    if (dm === 'draft') return
    if (slug) router.replace(`/ship/${slug}`)
  }, [router, searchParams, slug])

  if (!starship?.id) return null

  return (
    <div className="h-screen w-full">
      <ConversationInterface
        starshipId={starship.id}
        conversationId={null}
        starshipSlug={slug}
        onConversationChange={cid => {
          if (cid) {
            const channels = channelsData?.channels ?? []
            const match = channels.find((ch: any) => String(ch?.conversationId || '') === String(cid)) ?? null
            const channelSlug = match?.slug ? String(match.slug) : ''
            if (channelSlug) {
              router.replace(`/ship/${slug}/channels/${encodeURIComponent(channelSlug)}`)
              return
            }
            // Canonical DM route: `/dm/<peerKey>`
            const dm = (searchParams.get('dm') || '').trim()
            const dmType = (searchParams.get('dmType') || '').trim()
            const agentId = (searchParams.get('agentId') || '').trim()
            const peerUserId = (searchParams.get('peerUserId') || '').trim()
            if (dm === 'draft' && dmType === 'user_agent' && agentId) {
              const agents = Array.isArray(agentsData) ? (agentsData as any[]) : []
              const a = agents.find(x => String((x as any)?.id || '').trim() === agentId) ?? null
              const agentSlug = String((a as any)?.slug || '').trim()
              const peerKey = agentSlug || `a:${agentId}`
              router.replace(`/ship/${slug}/dm/${encodeURIComponent(peerKey)}`)
              return
            }
            if (dm === 'draft' && dmType === 'user_user' && peerUserId) {
              router.replace(`/ship/${slug}/dm/${encodeURIComponent(`u-${peerUserId}`)}`)
              return
            }
            // Fallback for non-DM conversations.
            router.replace(`/ship/${slug}/conversations/${encodeURIComponent(cid)}`)
          } else {
            router.replace(`/ship/${slug}`)
          }
        }}
      />
    </div>
  )
}
