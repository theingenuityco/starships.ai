'use client'

import { ConversationInterface } from '@/components/conversation/ConversationInterface'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { useParams } from 'next/navigation'

export default function ConversationsPage() {
  const params = useParams()
  const slug = params.slug as string

  const { data: starshipData, isLoading, error } = useStarshipBySlug(slug)

  // Show loading state while fetching starship data
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading starship...</p>
        </div>
      </div>
    )
  }

  // Show error state if starship fetch failed
  if (error || !starshipData) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-destructive mb-2">Failed to load starship</p>
          <p className="text-muted-foreground">Please check if the starship exists and try again.</p>
        </div>
      </div>
    )
  }

  return <ConversationInterface starshipId={starshipData.id} />
}
