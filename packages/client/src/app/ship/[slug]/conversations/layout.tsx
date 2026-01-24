'use client'

import { ConversationInterface } from '@/components/conversation/ConversationInterface'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useMemo, useEffect } from 'react'
import { useNavigationOnboardingContext } from '@/contexts/NavigationOnboardingContext'

export default function ConversationsLayout({ children }: { children: React.ReactNode }) {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { shouldShowOnboarding, currentStep } = useNavigationOnboardingContext()

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

  // Redirect to marketplace immediately if onboarding should start (before conversations page renders)
  useEffect(() => {
    if (shouldShowOnboarding && currentStep === null) {
      router.replace('/marketplace')
    }
  }, [shouldShowOnboarding, currentStep, router])

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
