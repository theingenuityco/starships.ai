'use client'

import { ConversationInterface } from '@/components/conversation/ConversationInterface'
import { ThreadPane } from '@/components/conversation/ThreadPane'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { useCreateConversation, useLinkMessageToConversation } from '@/hooks/useConversations'
import type { Agent } from '@/lib/api'
import type { MessageModel } from '@starships/protocol'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useMemo, useEffect, useRef, useState } from 'react'
import { useNavigationOnboardingContext } from '@/contexts/NavigationOnboardingContext'

export default function ConversationsLayout({ children }: { children: React.ReactNode }) {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { shouldShowOnboarding, currentStep } = useNavigationOnboardingContext()
  const [threadAgent, setThreadAgent] = useState<Agent | null>(null)
  const [threadPinnedFirstMessage, setThreadPinnedFirstMessage] = useState<MessageModel | null>(null)
  const lastThreadConversationIdRef = useRef<string | null>(null)

  const createConversation = useCreateConversation()
  const linkMessageToConversation = useLinkMessageToConversation()

  // Desktop thread pane width (draggable resizer)
  const THREAD_PANE_WIDTH_STORAGE_KEY = 'starships.threadPaneWidthPx'
  const [threadPaneWidthPx, setThreadPaneWidthPx] = useState<number>(420)
  const resizeStateRef = useRef<{ startX: number; startWidth: number; prevUserSelect: string } | null>(null)

  const clampThreadPaneWidthPx = useCallback((w: number) => {
    const min = 320
    // Keep at least ~360px for the main conversation column.
    const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1200
    const max = Math.min(900, Math.max(min, viewportW - 360))
    const next = Math.round(w)
    return Math.max(min, Math.min(max, next))
  }, [])

  useEffect(() => {
    // Initialize from localStorage (or sensible defaults per breakpoint).
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(THREAD_PANE_WIDTH_STORAGE_KEY) : null
      const parsed = raw ? Number(raw) : NaN
      const hasStored = Number.isFinite(parsed) && parsed > 0
      const defaultWidth = typeof window !== 'undefined' && window.innerWidth >= 1024 ? 520 : 420
      setThreadPaneWidthPx(clampThreadPaneWidthPx(hasStored ? parsed : defaultWidth))
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    try {
      if (typeof window === 'undefined') return
      window.localStorage.setItem(THREAD_PANE_WIDTH_STORAGE_KEY, String(threadPaneWidthPx))
    } catch {
      // ignore
    }
  }, [threadPaneWidthPx])

  useEffect(() => {
    // Clamp on viewport resize so the handle can't push content offscreen.
    if (typeof window === 'undefined') return
    const onResize = () => setThreadPaneWidthPx(prev => clampThreadPaneWidthPx(prev))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [clampThreadPaneWidthPx])

  const handleThreadResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      if (typeof window === 'undefined') return

      const startX = e.clientX
      const startWidth = threadPaneWidthPx

      const prevUserSelect = document.body.style.userSelect
      document.body.style.userSelect = 'none'

      resizeStateRef.current = { startX, startWidth, prevUserSelect }

      const onMove = (ev: PointerEvent) => {
        const state = resizeStateRef.current
        if (!state) return
        // Pane is on the right; moving pointer right shrinks the pane.
        const dx = ev.clientX - state.startX
        setThreadPaneWidthPx(clampThreadPaneWidthPx(state.startWidth - dx))
      }

      const cleanup = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        const state = resizeStateRef.current
        if (state) {
          document.body.style.userSelect = state.prevUserSelect
        }
        resizeStateRef.current = null
      }

      const onUp = () => cleanup()

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [clampThreadPaneWidthPx, threadPaneWidthPx]
  )

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

  const threadConversationId = useMemo(() => {
    const raw = searchParams.get('thread')
    const v = typeof raw === 'string' ? raw.trim() : ''
    return v.length > 0 ? v : null
  }, [searchParams])

  const setThreadConversationIdInUrl = useCallback(
    (conversationId: string | null) => {
      const next = new URLSearchParams(searchParams.toString())
      if (conversationId) next.set('thread', conversationId)
      else next.delete('thread')
      const qs = next.toString()
      // Preserve the current route (including /conversations/:conversationId) and other query params.
      const basePath = routeParams.conversationId ? `/ship/${routeParams.slug}/conversations/${routeParams.conversationId}` : `/ship/${routeParams.slug}/conversations`
      // Avoid clearing pinned message/agent when *we* open/close the thread via URL updates.
      lastThreadConversationIdRef.current = conversationId
      router.push(qs ? `${basePath}?${qs}` : basePath)
    },
    [router, routeParams.conversationId, routeParams.slug, searchParams]
  )

  useEffect(() => {
    // If thread id changes via back/forward / manual URL edits, clear per-thread ephemeral state.
    const prev = lastThreadConversationIdRef.current
    if (prev !== threadConversationId) {
      lastThreadConversationIdRef.current = threadConversationId
      setThreadPinnedFirstMessage(null)
      setThreadAgent(null)
    }
  }, [threadConversationId])

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
      const qs = searchParams.toString()
      if (newConversationId) {
        router.push(qs ? `/ship/${routeParams.slug}/conversations/${newConversationId}?${qs}` : `/ship/${routeParams.slug}/conversations/${newConversationId}`)
      } else {
        router.push(qs ? `/ship/${routeParams.slug}/conversations?${qs}` : `/ship/${routeParams.slug}/conversations`)
      }
    },
    [router, routeParams.slug, searchParams]
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
          onOpenThread={({ conversationId, defaultAgent, linkedMessage, parentConversationId }) => {
            setThreadAgent(prev => prev ?? defaultAgent)
            setThreadPinnedFirstMessage(linkedMessage ?? null)

            // If we already have a thread conversation id, open it via URL param.
            if (conversationId) {
              setThreadConversationIdInUrl(conversationId)
              return
            }

            // Draft thread opening (no conversationId yet): eagerly create + link, then open via URL param.
            if (linkedMessage && parentConversationId) {
              const raw = String((linkedMessage as any)?.content ?? '')
                .trim()
                .replace(/\s+/g, ' ')
              const snippet = raw.length > 0 ? raw.slice(0, 64) : ''
              const title = snippet ? `Thread: ${snippet}` : 'New thread'

              createConversation.mutate(
                {
                  starshipId: starshipData.id,
                  title,
                  parentConversationId,
                  agentId: typeof (defaultAgent as any)?.id === 'string' ? String((defaultAgent as any).id) : undefined,
                  agentSlug: typeof (defaultAgent as any)?.slug === 'string' ? String((defaultAgent as any).slug) : undefined,
                },
                {
                  onSuccess: conv => {
                    const newId = String((conv as any)?.id || '').trim()
                    if (!newId) return

                    // Best-effort: persist the thread link immediately.
                    const messageId = String((linkedMessage as any)?.id || '').trim()
                    if (messageId) {
                      linkMessageToConversation.mutate({
                        messageId,
                        linkedConversationId: newId,
                        conversationId: parentConversationId,
                      })
                    }

                    setThreadConversationIdInUrl(newId)
                  },
                }
              )
            }
          }}
          initialAgentId={routeParams.agentIdOrSlug}
          starshipSlug={routeParams.slug}
        />
      </div>

      {/* Thread split pane (desktop/tablet) */}
      {threadConversationId ? (
        <>
          {/* Draggable resize handle (desktop/tablet) */}
          <div
            className="hidden md:flex relative h-full w-4 flex-shrink-0 cursor-col-resize select-none group bg-muted/20 hover:bg-muted/30 transition-colors"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize thread pane"
            onPointerDown={handleThreadResizePointerDown}
            title="Drag to resize"
          >
            {/* Divider line */}
            <div className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] bg-border/80 group-hover:bg-border transition-colors" />

            {/* Grabber (makes draggable intent obvious) */}
            <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="flex flex-col items-center justify-center gap-1 rounded-md bg-background/60 px-1.5 py-2 ring-1 ring-border/70 shadow-sm backdrop-blur-sm transition-colors group-hover:ring-border">
                <div className="h-1 w-1 rounded-full bg-foreground/30" />
                <div className="h-1 w-1 rounded-full bg-foreground/30" />
                <div className="h-1 w-1 rounded-full bg-foreground/30" />
              </div>
            </div>
          </div>

          <aside
            className="hidden md:flex h-full flex-shrink-0 bg-background min-w-0"
            style={{
              width: threadPaneWidthPx,
            }}
          >
            <ThreadPane
              starshipId={starshipData.id}
              starshipSlug={routeParams.slug}
              conversationId={threadConversationId}
              pinnedFirstMessage={threadPinnedFirstMessage}
              selectedAgent={(threadAgent as any) ?? null}
              onAgentChange={setThreadAgent as any}
              onThreadCreated={cid => {
                setThreadConversationIdInUrl(cid)
              }}
              onClose={() => {
                setThreadPinnedFirstMessage(null)
                setThreadAgent(null)
                setThreadConversationIdInUrl(null)
              }}
            />
          </aside>
        </>
      ) : null}

      {/* Thread in-flow pane (mobile) */}
      {threadConversationId ? (
        <aside className="md:hidden h-[45vh] flex-shrink-0 border-t border-border/60 bg-background min-w-0">
          <ThreadPane
            starshipId={starshipData.id}
            starshipSlug={routeParams.slug}
            conversationId={threadConversationId}
            pinnedFirstMessage={threadPinnedFirstMessage}
            selectedAgent={(threadAgent as any) ?? null}
            onAgentChange={setThreadAgent as any}
            onThreadCreated={cid => {
              setThreadConversationIdInUrl(cid)
            }}
            onClose={() => {
              setThreadPinnedFirstMessage(null)
              setThreadAgent(null)
              setThreadConversationIdInUrl(null)
            }}
          />
        </aside>
      ) : null}

      {/* Hide children since ConversationInterface now handles everything */}
      <div style={{ display: 'none' }}>{children}</div>
    </div>
  )
}
