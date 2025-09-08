'use client'

import { ConversationInterface } from '@/components/conversation/ConversationInterface'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { useParams, useRouter } from 'next/navigation'

export default function ConversationPage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string
  const conversationId = params.conversationId as string

  const { data: starshipData } = useStarshipBySlug(slug)

  // Handle conversation change from ConversationInterface
  const handleConversationChange = (newConversationId: string | null) => {
    if (newConversationId) {
      router.push(`/ship/${slug}/conversations/${newConversationId}`)
    } else {
      router.push(`/ship/${slug}/conversations`)
    }
  }

  if (!starshipData) {
    return null // Layout handles loading/error states
  }

  return <ConversationInterface starshipId={starshipData.id} conversationId={conversationId} onConversationChange={handleConversationChange} />
}
