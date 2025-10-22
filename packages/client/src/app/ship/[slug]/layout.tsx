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

  if (!conversationId || !starship?.id) {
    return <>{children}</>
  }

  return (
    <ConversationStreamProvider conversationId={conversationId} starshipId={starship.id}>
      {children}
    </ConversationStreamProvider>
  )
}
