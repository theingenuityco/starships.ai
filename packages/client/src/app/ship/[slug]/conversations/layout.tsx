'use client'

import { ConversationInterface } from '@/components/conversation/ConversationInterface'
import { ThreadPane } from '@/components/conversation/ThreadPane'
import { useStarshipBySlug } from '@/hooks/useStarships'
import type { Agent } from '@/lib/api'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useMemo, useEffect, useState } from 'react'
import { useNavigationOnboardingContext } from '@/contexts/NavigationOnboardingContext'

export default function ConversationsLayout({ children }: { children: React.ReactNode }) {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { shouldShowOnboarding, currentStep } = useNavigationOnboardingContext()
  const [threadConversationId, setThreadConversationId] = useState<string | null>(null)
  const [threadAgent, setThreadAgent] = useState<Agent | null>(null)

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

  // Redirect to marketplace immediately if onboarding should start BUT we're not on step 5
  // Step 5 needs to show the conversations page, so we allow it to render
  useEffect(() => {
    if (shouldShowOnboarding && currentStep !== 5) {
      router.replace('/marketplace')
    }
  }, [shouldShowOnboarding, currentStep, router])

  // Handle conversation change from ConversationInterface
  // Must be called before any early returns to satisfy React Hooks rules
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

  // Don't render conversations interface if we're redirecting to onboarding (but allow step 5)
  if (shouldShowOnboarding && currentStep !== 5) {
    return null
  }

  if (!starshipData) {
    return null // Layout handles loading/error states
  }

  return (
    <div className="h-screen w-full flex flex-col md:flex-row min-w-0">
      <div
        className="flex-1 min-w-0 h-full"
        style={{
          ['--conversation-right-gutter' as any]: threadConversationId ? '16px' : '52px',
        }}
      >
        <ConversationInterface
          starshipId={starshipData.id}
          conversationId={routeParams.conversationId || null}
          onConversationChange={handleConversationChange}
          onOpenThread={({ conversationId, defaultAgent }) => {
            setThreadConversationId(conversationId)
            setThreadAgent(prev => prev ?? defaultAgent)
          }}
          initialAgentId={routeParams.agentIdOrSlug}
          starshipSlug={routeParams.slug}
        />
      </div>

      {/* Thread split pane (desktop/tablet) */}
      {threadConversationId ? (
        <aside className="hidden md:flex h-full w-[420px] lg:w-[520px] flex-shrink-0 border-l border-border/60 bg-card min-w-0">
          <ThreadPane
            starshipId={starshipData.id}
            starshipSlug={routeParams.slug}
            conversationId={threadConversationId}
            selectedAgent={(threadAgent as any) ?? null}
            onAgentChange={setThreadAgent as any}
            onClose={() => setThreadConversationId(null)}
          />
        </aside>
      ) : null}

      {/* Thread in-flow pane (mobile) */}
      {threadConversationId ? (
        <aside className="md:hidden h-[45vh] flex-shrink-0 border-t border-border/60 bg-card min-w-0">
          <ThreadPane
            starshipId={starshipData.id}
            starshipSlug={routeParams.slug}
            conversationId={threadConversationId}
            selectedAgent={(threadAgent as any) ?? null}
            onAgentChange={setThreadAgent as any}
            onClose={() => setThreadConversationId(null)}
          />
        </aside>
      ) : null}

      {/* Hide children since ConversationInterface now handles everything */}
      <div style={{ display: 'none' }}>{children}</div>
    </div>
  )
}
