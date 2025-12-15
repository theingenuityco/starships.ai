'use client'

import { useParams, useSearchParams } from 'next/navigation'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { ConversationStreamProvider } from '@/hooks/ConversationStreamContext'

interface LayoutProps {
  children: React.ReactNode
}

export default function ShipLayout({ children }: LayoutProps) {
  const params = useParams()
  const searchParams = useSearchParams()
  const slug = params.slug as string
  const { data: starship } = useStarshipBySlug(slug, true)

  // Prefer route param conversationId when on conversations pages; else fall back to query param
  const routeConv = (params as any)?.conversationId as string | undefined
  const queryConv = searchParams.get('conversationId') || undefined
  const conversationId = routeConv || queryConv || null

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
