'use client'

import { ConversationInterface } from '@/components/conversation/ConversationInterface'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { useParams, useRouter } from 'next/navigation'

export default function ConversationsPage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string

  const { data: starshipData } = useStarshipBySlug(slug)

  // Handle conversation change from ConversationInterface (when a new conversation starts)
  const handleConversationChange = (conversationId: string | null) => {
    if (conversationId) {
      // Navigate to the new conversation route
      router.push(`/ship/${slug}/conversations/${conversationId}`)
    }
  }

  if (!starshipData) {
    return null // Layout handles loading/error states
  }

  return <ConversationInterface starshipId={starshipData.id} conversationId={null} onConversationChange={handleConversationChange} />
}
