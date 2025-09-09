'use client'

import { ConversationInterface } from '@/components/conversation/ConversationInterface'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { useParams, useRouter } from 'next/navigation'
import { useCallback, useMemo } from 'react'

export default function ConversationsLayout({ children }: { children: React.ReactNode }) {
  const params = useParams()
  const router = useRouter()
  
  // Memoize params to prevent unnecessary rerenders
  const routeParams = useMemo(() => ({
    slug: params.slug as string,
    conversationId: params.conversationId as string | undefined,
  }), [params.slug, params.conversationId])

  const { data: starshipData } = useStarshipBySlug(routeParams.slug)

  // Handle conversation change from ConversationInterface
  const handleConversationChange = useCallback((newConversationId: string | null) => {
    if (newConversationId) {
      router.push(`/ship/${routeParams.slug}/conversations/${newConversationId}`)
    } else {
      router.push(`/ship/${routeParams.slug}/conversations`)
    }
  }, [router, routeParams.slug])

  if (!starshipData) {
    return null // Layout handles loading/error states
  }

  return (
    <div className="h-screen w-full">
      <ConversationInterface
        starshipId={starshipData.id}
        conversationId={routeParams.conversationId || null}
        onConversationChange={handleConversationChange}
      />
      {/* Hide children since ConversationInterface now handles everything */}
      <div style={{ display: 'none' }}>{children}</div>
    </div>
  )
}
