'use client'

import { useEffect } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { ConversationStreamProvider } from '@/hooks/ConversationStreamContext'
import { useStarshipUIStore } from '@/store/starship-ui-store'

interface LayoutProps {
  children: React.ReactNode
}

export default function ShipLayout({ children }: LayoutProps) {
  const params = useParams()
  const searchParams = useSearchParams()
  const slug = params.slug as string
  const { data: starship } = useStarshipBySlug(slug, true)
  const pendingConversationId = useStarshipUIStore(s => s.pendingConversationId)
  const setPendingConversationId = useStarshipUIStore(s => s.setPendingConversationId)

  // Prefer route param conversationId when on conversations pages; else fall back to query param
  const routeConv = (params as any)?.conversationId as string | undefined
  const queryConv = searchParams.get('conversationId') || undefined
  // CRITICAL:
  // During /conversations -> /conversations/:id navigation, the URL param can lag behind local state.
  // If we only rely on the URL, the stream context briefly becomes "no conversation", which makes
  // the loader/avatar disappear (messages area unmounts) and then reappear when the route catches up.
  // Use a short-lived pending id (set by ConversationInterface) to bridge that window.
  const conversationId = routeConv || queryConv || pendingConversationId || null

  // Clear the pending id once the URL has a real conversation id.
  useEffect(() => {
    if (!pendingConversationId) return
    if (routeConv || queryConv) {
      setPendingConversationId(null)
    }
  }, [pendingConversationId, routeConv, queryConv, setPendingConversationId])

  // IMPORTANT:
  // Always render the provider to avoid remounting the entire subtree when a conversationId
  // is created mid-session (e.g. /conversations -> /conversations/:id). A remount resets local UI
  // state and can cause loader/input flicker; after a hard reload the provider is present from the
  // start, which is why it "works fine" on refresh.
  //
  // When conversationId is null, the stream hook is effectively disabled (no SSE connection),
  // but the component tree remains stable across route changes.
  return (
    <ConversationStreamProvider conversationId={conversationId} starshipId={starship?.id ?? null}>
      {children}
    </ConversationStreamProvider>
  )
}
