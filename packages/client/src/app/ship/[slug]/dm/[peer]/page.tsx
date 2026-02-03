'use client'

import { ConversationInterface } from '@/components/conversation/ConversationInterface'
import { useStarshipDirectMessages, type DirectMessageListItem } from '@/hooks/useConversations'
import { useStarshipAgents } from '@/hooks/useAgents'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { useStarshipMembersAndInvites } from '@/hooks/useStarshipMembers'
import { useStarshipUIStore } from '@/store/starship-ui-store'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo } from 'react'

type DmTarget = { dmType: 'user_agent'; agentId: string; agentSlug: string | null } | { dmType: 'user_user'; peerUserId: string }

function parseDmPeer(peerRaw: string, agents: Array<{ id?: string; slug?: string }> | null): DmTarget | null {
  const peer = String(peerRaw || '').trim()
  if (!peer) return null

  // Users: canonical form is `u-<userId>`. We also accept raw userId as a fallback.
  if (peer.toLowerCase().startsWith('u-')) {
    const peerUserId = peer.slice(2).trim()
    return peerUserId ? { dmType: 'user_user', peerUserId } : null
  }

  // Agents: canonical form is `<agentSlug>` (no prefix). We also accept `a-<agentSlug>` and `a:<agentId>` fallbacks.
  if (peer.toLowerCase().startsWith('a-')) {
    const agentSlug = peer.slice(2).trim()
    if (!agentSlug) return null
    const list = Array.isArray(agents) ? agents : []
    const match =
      list.find(
        a =>
          String(a?.slug || '')
            .trim()
            .toLowerCase() === agentSlug.toLowerCase()
      ) ?? null
    const agentId = match?.id ? String(match.id) : ''
    return agentId ? { dmType: 'user_agent', agentId, agentSlug: match?.slug ? String(match.slug) : agentSlug } : null
  }

  if (peer.toLowerCase().startsWith('a:')) {
    const agentId = peer.slice(2).trim()
    if (!agentId) return null
    const list = Array.isArray(agents) ? agents : []
    const match = list.find(a => String(a?.id || '').trim() === agentId) ?? null
    return { dmType: 'user_agent', agentId, agentSlug: match?.slug ? String(match.slug) : null }
  }

  // Default: treat as agent slug if we can resolve it; otherwise treat as raw user id (fallback).
  const list = Array.isArray(agents) ? agents : []
  const agent =
    list.find(
      a =>
        String(a?.slug || '')
          .trim()
          .toLowerCase() === peer.toLowerCase()
    ) ?? null
  if (agent?.id) {
    return { dmType: 'user_agent', agentId: String(agent.id), agentSlug: agent?.slug ? String(agent.slug) : peer }
  }

  // Also accept raw agent ids (useful for legacy `?agent=<id>` deep links).
  const agentById = list.find(a => String(a?.id || '').trim() === peer) ?? null
  if (agentById?.id) {
    return { dmType: 'user_agent', agentId: String(agentById.id), agentSlug: agentById?.slug ? String(agentById.slug) : null }
  }

  // Fallback to user id (this is primarily for internal/debug and backwards-compat).
  return { dmType: 'user_user', peerUserId: peer }
}

export default function DmPeerPage() {
  const router = useRouter()
  const params = useParams<{ slug: string; peer: string }>()
  const slug = params.slug
  const peer = params.peer
  const setPendingConversationId = useStarshipUIStore(s => s.setPendingConversationId)

  const { data: starship } = useStarshipBySlug(slug, Boolean(slug))
  const starshipId = starship?.id ? String(starship.id) : ''

  const { data: agentsData, isLoading: agentsLoading } = useStarshipAgents(starshipId, Boolean(starshipId))
  const { data: membersAndInvites } = useStarshipMembersAndInvites(starshipId, Boolean(starshipId))
  const { data: directMessagesData, isLoading: dmsLoading } = useStarshipDirectMessages(starshipId, Boolean(starshipId))

  const dmTarget = useMemo(() => {
    const list = Array.isArray(agentsData) ? (agentsData as any[]) : []
    const peerStr = String(peer || '').trim()
    // Avoid misclassifying agent slugs as user ids while the agents list is still loading.
    if (peerStr && !peerStr.toLowerCase().startsWith('u-') && agentsLoading) return null
    return parseDmPeer(peer, list)
  }, [peer, agentsData, agentsLoading])

  const resolved = useMemo(() => {
    if (!dmTarget) return { conversationId: null as string | null, draftOverride: null as any }
    const list = (directMessagesData?.directMessages || []) as DirectMessageListItem[]

    if (dmTarget.dmType === 'user_agent') {
      const item = list.find(it => (it as any)?.dm?.dmType === 'user_agent' && String((it as any)?.dm?.agentId || '') === String(dmTarget.agentId)) ?? null
      const cid = item?.dm?.conversationId ? String(item.dm.conversationId) : null
      return {
        conversationId: cid,
        draftOverride: cid
          ? null
          : ({
              dmType: 'user_agent',
              agentId: dmTarget.agentId,
              peerUserId: null,
              peerLabel: null,
              peerAvatar: null,
            } as const),
      }
    }

    // user_user
    const peerUserId = String(dmTarget.peerUserId)
    const item = list.find(it => (it as any)?.dm?.dmType === 'user_user' && String((it as any)?.peerUser?.id || '') === peerUserId) ?? null
    const cid = item?.dm?.conversationId ? String(item.dm.conversationId) : null

    const member = ((membersAndInvites as any)?.members || []).find((m: any) => String(m?.userId || '') === peerUserId) ?? null
    const label = String(member?.displayName || member?.email || item?.peerUser?.displayName || item?.peerUser?.email || 'User').trim()
    const avatar = String(member?.avatar || item?.peerUser?.avatar || '').trim()

    return {
      conversationId: cid,
      draftOverride: cid
        ? null
        : ({
            dmType: 'user_user',
            agentId: null,
            peerUserId,
            peerLabel: label || null,
            peerAvatar: avatar || null,
          } as const),
    }
  }, [dmTarget, directMessagesData?.directMessages, membersAndInvites])

  // Ensure the ship-level stream provider is pointed at the resolved DM conversation.
  // `/ship/[slug]/layout.tsx` doesn't know about `/dm/<peer>`, so without this the stream context
  // stays on `conversationId=null` and the DM message list is empty.
  useEffect(() => {
    const cid = resolved.conversationId ? String(resolved.conversationId) : ''
    if (!cid) return
    setPendingConversationId(cid)
    return () => {
      try {
        const st = useStarshipUIStore.getState()
        if (st.pendingConversationId === cid) st.setPendingConversationId(null)
      } catch {
        setPendingConversationId(null)
      }
    }
  }, [resolved.conversationId, setPendingConversationId])

  // If we can't resolve the peer and we aren't in a loading window, bounce back to the starship root.
  if (!dmTarget && !dmsLoading && !agentsLoading) {
    if (slug) router.replace(`/ship/${slug}`)
    return null
  }

  if (!starshipId) return null

  return (
    <div className="h-screen w-full">
      <ConversationInterface
        starshipId={starshipId}
        conversationId={resolved.conversationId}
        starshipSlug={slug}
        draftDirectMessageTargetOverride={resolved.draftOverride}
        onConversationChange={() => {
          // Intentionally keep the URL stable (`/dm/<peer>`). On refresh, we re-resolve the conversationId via the DM list.
          return
        }}
      />
    </div>
  )
}
