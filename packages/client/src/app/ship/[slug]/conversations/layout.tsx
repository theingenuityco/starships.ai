'use client'

import { ConversationInterface } from '@/components/conversation/ConversationInterface'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useMemo, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'

export default function ConversationsLayout({ children }: { children: React.ReactNode }) {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, isAuthenticated } = useAuth()

  // Memoize params to prevent unnecessary rerenders
  const routeParams = useMemo(
    () => ({
      slug: params.slug as string,
      conversationId: params.conversationId as string | undefined,
      agentIdOrSlug: searchParams.get('agent') || undefined,
    }),
    [params.slug, params.conversationId, searchParams]
  )

  const { data: starshipData } = useStarshipBySlug(routeParams.slug)

  // Check if onboarding should start and redirect immediately (before rendering)
  const hasCompletedOnboarding = user?.navigationOnboardingCompleted ?? false
  const shouldShowOnboarding = isAuthenticated && !hasCompletedOnboarding

  // Redirect to marketplace immediately if onboarding should start (before conversations page renders)
  useEffect(() => {
    if (shouldShowOnboarding) {
      router.replace('/marketplace')
    }
  }, [shouldShowOnboarding, router])

  // Don't render conversations interface if we're redirecting to onboarding
  if (shouldShowOnboarding) {
    return null
  }

  // Handle conversation change from ConversationInterface
  const handleConversationChange = useCallback(
    (newConversationId: string | null) => {
      if (newConversationId) {
        router.push(`/ship/${routeParams.slug}/conversations/${newConversationId}`)
      } else {
        router.push(`/ship/${routeParams.slug}/conversations`)
      }
    },
    [router, routeParams.slug]
  )

  if (!starshipData) {
    return null // Layout handles loading/error states
  }

  return (
    <div className="h-screen w-full">
      <ConversationInterface
        starshipId={starshipData.id}
        conversationId={routeParams.conversationId || null}
        onConversationChange={handleConversationChange}
        initialAgentId={routeParams.agentIdOrSlug}
        starshipSlug={routeParams.slug}
      />
      {/* Hide children since ConversationInterface now handles everything */}
      <div style={{ display: 'none' }}>{children}</div>
    </div>
  )
}
