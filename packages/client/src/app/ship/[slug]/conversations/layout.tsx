'use client'

import { ConversationInterface } from '@/components/conversation/ConversationInterface'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { useParams, useRouter } from 'next/navigation'
import { useCallback } from 'react'

export default function ConversationsLayout({ children }: { children: React.ReactNode }) {
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string
  const conversationId = params.conversationId as string | undefined

  const { data: starshipData } = useStarshipBySlug(slug)

  // Handle conversation change from ConversationInterface
  const handleConversationChange = useCallback((newConversationId: string | null) => {
    if (newConversationId) {
      router.push(`/ship/${slug}/conversations/${newConversationId}`)
    } else {
      router.push(`/ship/${slug}/conversations`)
    }
  }, [router, slug])

  if (!starshipData) {
    return null // Layout handles loading/error states
  }

  return (
    <div className="h-screen w-full">
      <ConversationInterface
        starshipId={starshipData.id}
        conversationId={conversationId || null}
        onConversationChange={handleConversationChange}
      />
      {/* Hide children since ConversationInterface now handles everything */}
      <div style={{ display: 'none' }}>{children}</div>
    </div>
  )
}
