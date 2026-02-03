'use client'

import { ConversationInterface } from '@/components/conversation/ConversationInterface'
import { useCreateDirectMessage, useStarshipDirectMessages, type DirectMessageListItem } from '@/hooks/useConversations'
import { useStarshipAgents } from '@/hooks/useAgents'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { useStarshipMembersAndInvites } from '@/hooks/useStarshipMembers'
import { useStarshipUIStore } from '@/store/starship-ui-store'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'

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
  const peerStr = String(peer || '').trim()
  const setPendingConversationId = useStarshipUIStore(s => s.setPendingConversationId)

  const { data: starship } = useStarshipBySlug(slug, Boolean(slug))
  const starshipId = starship?.id ? String(starship.id) : ''

  const { data: agentsData, isLoading: agentsLoading } = useStarshipAgents(starshipId, Boolean(starshipId))
  const { data: membersAndInvites } = useStarshipMembersAndInvites(starshipId, Boolean(starshipId))
  const { data: directMessagesData, isLoading: dmsLoading, isFetching: dmsFetching, isError: dmsIsError } = useStarshipDirectMessages(starshipId, Boolean(starshipId))
  const createDirectMessage = useCreateDirectMessage()

  // Fallback: if listing DMs fails, resolve via the idempotent create/return endpoint.
  const [fallbackConversationId, setFallbackConversationId] = useState<string | null>(null)
  const didAttemptFallbackResolveRef = useRef(false)

  const dmTarget = useMemo(() => {
    const list = Array.isArray(agentsData) ? (agentsData as any[]) : []
    // Avoid misclassifying agent slugs as user ids while the agents list is still loading.
    // Only block on the ambiguous form (bare `<agentSlug>`). Explicit prefixes can be parsed without agent data.
    const lower = peerStr.toLowerCase()
    const isExplicitUser = lower.startsWith('u-')
    const isExplicitAgent = lower.startsWith('a:') || lower.startsWith('a-')
    if (peerStr && !isExplicitUser && !isExplicitAgent && agentsLoading) return null
    return parseDmPeer(peer, list)
  }, [peer, agentsData, agentsLoading])

  useEffect(() => {
    if (!starshipId) return
    if (!dmTarget) return
    if (!dmsIsError) return
    if (fallbackConversationId) return
    if (didAttemptFallbackResolveRef.current) return

    didAttemptFallbackResolveRef.current = true
    ;(async () => {
      try {
        const data =
          dmTarget.dmType === 'user_agent'
            ? await createDirectMessage.mutateAsync({ starshipId, agentId: dmTarget.agentId })
            : await createDirectMessage.mutateAsync({ starshipId, peerUserId: dmTarget.peerUserId })
        const cid = data?.conversationId ? String(data.conversationId) : ''
        if (cid) setFallbackConversationId(cid)
      } catch {
        // If this fails too, we keep the UI in a "resolving" state rather than incorrectly showing a draft.
      }
    })()
  }, [createDirectMessage, dmTarget, dmsIsError, fallbackConversationId, starshipId])

  const resolved = useMemo(() => {
    if (!dmTarget) return { conversationId: null as string | null, draftOverride: null as any }

    // If we don't yet know the starship id, we cannot reliably check for an existing DM.
    // Treat as "resolving" rather than falling back to draft.
    if (!starshipId) return { conversationId: null as string | null, draftOverride: null as any }

    // Avoid showing an incorrect "draft DM" state while the DM list is still loading.
    // NOTE: `isFetching` can be true during background refetch even when we already have cached data.
    // Only block on fetching when we do not yet have any DM list data to resolve from.
    if (dmsLoading) return { conversationId: null as string | null, draftOverride: null as any }
    if (dmsFetching && !directMessagesData) return { conversationId: null as string | null, draftOverride: null as any }

    // If the DM list errored but the fallback resolver succeeded, use it.
    if (fallbackConversationId) return { conversationId: fallbackConversationId, draftOverride: null as any }

    // If the query is disabled/uninitialized (no data) and no error, stay in "resolving" mode.
    if (!directMessagesData && !dmsIsError) return { conversationId: null as string | null, draftOverride: null as any }

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
  }, [dmTarget, starshipId, directMessagesData, directMessagesData?.directMessages, dmsLoading, dmsFetching, dmsIsError, fallbackConversationId, membersAndInvites])

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

  // If we're on an agent DM route using the bare `<agentSlug>` form, `dmTarget` is intentionally null until
  // the agents list loads. During that window, do NOT render the generic conversation starter/empty state.
  if (!dmTarget && starshipId && peerStr && !peerStr.toLowerCase().startsWith('u-') && agentsLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading direct message…</div>
      </div>
    )
  }

  // If we're still resolving whether this DM already exists, don't show a misleading draft UI.
  if (starshipId && dmTarget && !resolved.conversationId && !resolved.draftOverride) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading direct message…</div>
      </div>
    )
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
