'use client'

import Icon from '@/components/primitives/Icon'

import { ConversationMessageInput, ConversationMessageInputRef } from '@/components/conversation/ConversationMessageInput'
import { ConversationMessageList } from '@/components/conversation/ConversationMessageList'
import { ConversationSummaryBar } from '@/components/conversation/ConversationSummaryBar'
import { AgentSelector } from '@/components/conversation/AgentSelector'
import { Avatar } from '@/components/ui/avatar'
import AgentAvatar from '@/components/animated/AgentAvatar'
import { useMessageAttachments } from '@/hooks/useFileUpload'
import { useAuth, useAuthUser } from '@/hooks/useAuth'
import { useStarshipAgents } from '@/hooks/useAgents'
import { useStarshipConversations, CONVERSATION_QUERY_KEYS } from '@/hooks/useConversations'
import { useConversationStreamContextOptional } from '@/hooks/ConversationStreamContext'
import { useQueryClient } from '@tanstack/react-query'
import { useStarshipUIStore } from '@/store/starship-ui-store'
import { useStarship } from '@/hooks/useStarships'
import type { Agent } from '@/lib/api'
import api, { agentAPI, templateAPI, toolAPI } from '@/lib/api'
import { toast } from 'sonner'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ConversationContextBar } from '@/components/conversation/ConversationContextBar'
import { useModelContextLength } from '@/hooks/useLlmModels'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { formatAgentDisplayName } from '@/lib/agentDisplay'
import { WelcomeSignupCard } from '@/components/conversation/WelcomeSignupCard'

interface ConversationInterfaceProps {
  starshipId: string
  conversationId?: string | null
  onConversationChange?: (conversationId: string | null) => void
  initialAgentId?: string
  starshipSlug?: string
}

// Helper function to extract the most recent agent ID from messages
function getMostRecentAgentIdFromMessages(messages: any[], conversationId?: string, agents?: any[]): string | null {
  if (!Array.isArray(messages) || messages.length === 0) return null

  // If conversationId is provided, verify messages belong to this conversation
  if (conversationId) {
    // Check if any message has a conversationId field and verify it matches
    const hasConversationId = messages.some(m => m?.conversationId)
    if (hasConversationId) {
      const belongsToConversation = messages.some(m => m?.conversationId === conversationId)
      if (!belongsToConversation) {
        // Messages don't belong to this conversation, skip
        return null
      }
    }
  }

  // Search backwards through messages to find the most recent agent
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (!msg) continue

    // Check assistant messages for agentId
    if (msg.role === 'assistant' && msg.agentId) {
      return msg.agentId
    }

    // Check user messages for agentId
    if (msg.role === 'user' && msg.agentId) {
      return msg.agentId
    }

    // Fallback: Parse @mention from user message content if agents list is provided
    if (msg.role === 'user' && msg.content && Array.isArray(agents)) {
      const mentionMatch = String(msg.content).match(/^\s*@([A-Za-z0-9_-]+)/)
      if (mentionMatch) {
        const handle = mentionMatch[1].toLowerCase()
        const mentionedAgent = agents.find(a => a.slug?.toLowerCase() === handle || a.name?.toLowerCase() === handle)
        if (mentionedAgent) {
          return mentionedAgent.id
        }
      }
    }
  }

  return null
}

function pickDefaultAgent(agents: any[]): any | null {
  if (!Array.isArray(agents) || agents.length === 0) return null
  const aria = agents.find(a => typeof a?.slug === 'string' && a.slug.toLowerCase().startsWith('aria'))
  return aria ?? agents[0] ?? null
}

export function ConversationInterface({ starshipId, conversationId: externalConversationId, onConversationChange, initialAgentId, starshipSlug }: ConversationInterfaceProps) {
  const { userId, isAuthenticated, isLoading } = useAuth()
  const { data: authUser } = useAuthUser()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const shouldShowWelcomeCard = searchParams.get('welcome') === '1'
  const dismissWelcomeCard = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString())
    next.delete('welcome')
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname)
  }, [pathname, router, searchParams])

  // Agent and UI state
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)

  // Wrapper to log all agent changes
  const setSelectedAgentWithLogging = useCallback((agent: Agent | null) => {
    setSelectedAgent(agent)
  }, [])

  const lastAutoSelectedAgentIdRef = useRef<string | null>(null)
  const hasSetInitialDefaultAgentRef = useRef<boolean>(false)
  const hasEverSetAnyAgentRef = useRef<boolean>(false)
  const { contextLength: agentContextLength } = useModelContextLength(selectedAgent?.model)
  const budgetTokens = agentContextLength

  // UI state (conversation id only; message presence is derived from store)
  //
  // IMPORTANT:
  // When navigating /conversations -> /conversations/:id, this component can remount.
  // If we initialize to null and only populate from an effect, we get a first-render "null" conversationId
  // which makes the input/loader briefly think it's idle. Initialize from the route param when available.
  const initialConversationId = (externalConversationId ?? null) as string | null
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(initialConversationId)
  const currentConversationIdRef = useRef<string | null>(initialConversationId)
  // When we create a new conversation from the /conversations landing, we set the id locally
  // before the route param updates. During that handoff, `externalConversationId` can still be null.
  // Track the pending id so we don't immediately overwrite local state back to null.
  const pendingRouteConversationIdRef = useRef<string | null>(null)

  // Refs for direct communication with components
  const messageInputRef = useRef<ConversationMessageInputRef>(null)
  // Removed in-conversation builder overlays; now using dedicated routes
  // Removed UI action handling

  // Deduplicate UI action payloads across sources
  const lastUIActionKeyRef = useRef<string | null>(null)

  const queryClient = useQueryClient()

  // Measure floating input height to reserve scroll space and prevent overlap with the floating composer
  const inputContainerRef = useRef<HTMLDivElement>(null)
  const [inputHeight, setInputHeight] = useState<number>(160)
  const [hasWelcomeExited, setHasWelcomeExited] = useState<boolean>(false)
  const [isHeightFrozen, setIsHeightFrozen] = useState<boolean>(false)
  const heightUnfreezeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [dockOffsetPx, setDockOffsetPx] = useState<number>(0)
  const [showAllSuggestions, setShowAllSuggestions] = useState<boolean>(false)

  // Get agents data from starship
  const { data: starshipAgentsData = [] } = useStarshipAgents(starshipId || '')
  const starshipAgentAvatarAttachmentIds = useMemo(() => {
    return (Array.isArray(starshipAgentsData) ? starshipAgentsData : [])
      .map(a => (a as any).avatarAttachmentId as string | undefined)
      .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
  }, [starshipAgentsData])
  const { data: starshipAgentAvatarAttachments = [] } = useMessageAttachments(starshipAgentAvatarAttachmentIds, starshipId)
  const starshipAgentAvatarUrlById = useMemo(() => new Map(starshipAgentAvatarAttachments.map(a => [a.id, a.previewUrl] as const)), [starshipAgentAvatarAttachments])
  const { data: starshipConversationsData } = useStarshipConversations(starshipId || '', true)
  const { data: starshipData } = useStarship(starshipId || '', !!starshipId)
  const setConversationAgentStore = useStarshipUIStore(s => s.setConversationAgent)
  const setPendingConversationId = useStarshipUIStore(s => s.setPendingConversationId)

  // Build suggestion cards from the selected agent's preview/example prompts
  const agentSuggestionCards = useMemo(() => {
    if (!selectedAgent) return []
    const a: any = selectedAgent as any
    const list = a?.previewPrompts || a?.examplePrompts || a?.examples || a?.state?.examplePrompts || []
    if (!Array.isArray(list)) return []
    const prompts = (list as string[]).filter(Boolean)
    return prompts.map((text, idx) => ({
      id: `${selectedAgent.id}:${idx}`,
      agent: selectedAgent,
      text,
    }))
  }, [selectedAgent])

  // Starter hero greetings – personalized (first name only), concise, one chosen per mount
  const displayName = useMemo(() => {
    const full = authUser?.name?.trim()
    if (!full) return 'there'
    const first = full.split(/\s+/)[0]
    return first || 'there'
  }, [authUser?.name])
  const starterSlogans = useMemo(
    () => [
      `What are we doing next?`,
      `What should we ship today?`,
      `Tell me the goal.`,
      `Give me a task.`,
      `Pick one thing to finish.`,
      `What’s the next step?`,
      `Let’s make progress.`,
      `Let’s ship a quick win.`,
      `What needs to get done?`,
      `Start with the outcome.`,
    ],
    [displayName]
  )
  const starterSlogan = useMemo(() => starterSlogans[Math.floor(Math.random() * starterSlogans.length)] ?? 'What are we building today?', [starterSlogans])

  const starshipName = useMemo(() => {
    const n = (starshipData as any)?.name
    return typeof n === 'string' && n.trim().length > 0 ? n.trim() : 'your starship'
  }, [starshipData])

  // For collapsed view, show only the first few prompts for the selected agent
  const collapsedSuggestionCards = useMemo(() => {
    return agentSuggestionCards.slice(0, 3)
  }, [agentSuggestionCards])

  // Gate the heavy "conversation layout" (message list + docked input) more carefully:
  // - Existing conversations (loaded directly via route) should show immediately.
  // - Newly created conversations should NOT abruptly flip layouts on the null->id handoff;
  //   wait until we have at least one message or the turn is responding.
  // - When switching between existing conversations, keep messages area visible to avoid flashing starter screen.
  const initialHadConversationRef = useRef<boolean>(externalConversationId != null)
  const hasEverShownMessagesRef = useRef<boolean>(externalConversationId != null)
  const stream = useConversationStreamContextOptional()
  const streamMessagesLen = Array.isArray((stream as any)?.messages) ? Number(((stream as any).messages as any[]).length) : 0
  const streamIsResponding = Boolean((stream as any)?.isResponding)
  
  // Check if current conversation exists in the conversations list (existing conversation, not newly created)
  const isExistingConversation = useMemo(() => {
    if (!currentConversationId || !starshipConversationsData?.conversations) return false
    return starshipConversationsData.conversations.some(c => c.id === currentConversationId)
  }, [currentConversationId, starshipConversationsData])
  
  // Show messages area if:
  // 1. We have a conversation ID AND
  // 2. (We initially had a conversation OR we've ever shown messages OR it's an existing conversation OR we have stream messages OR stream is responding)
  const shouldShowMessages = Boolean(
    currentConversationId && (
      initialHadConversationRef.current || 
      hasEverShownMessagesRef.current || 
      isExistingConversation || 
      streamMessagesLen > 0 || 
      streamIsResponding
    )
  )
  
  // Track that we've shown messages area at least once
  useEffect(() => {
    if (shouldShowMessages) {
      hasEverShownMessagesRef.current = true
    }
  }, [shouldShowMessages])
  
  const showMessagesArea = shouldShowMessages

  // Start docking immediately when messages area appears; allow welcome to fade concurrently
  useEffect(() => {
    if (showMessagesArea) {
      setHasWelcomeExited(true)
      // Freeze height during docking to avoid top thrash as content exits
      if (heightUnfreezeTimerRef.current) clearTimeout(heightUnfreezeTimerRef.current)
      setIsHeightFrozen(true)
      heightUnfreezeTimerRef.current = setTimeout(() => {
        setIsHeightFrozen(false)
      }, 280)
    } else {
      setHasWelcomeExited(false)
      if (heightUnfreezeTimerRef.current) {
        clearTimeout(heightUnfreezeTimerRef.current)
        heightUnfreezeTimerRef.current = null
      }
      setIsHeightFrozen(false)
    }
  }, [showMessagesArea])

  const isInputDocked = showMessagesArea

  useEffect(() => {
    return
  }, [showMessagesArea])

  // Measure input container after showMessagesArea is known (prevents TS error and ensures correct layout)
  useEffect(() => {
    const el = inputContainerRef.current
    if (!el) return

    const update = () => {
      if (isHeightFrozen) return
      const rect = el.getBoundingClientRect()
      setInputHeight(Math.ceil(rect.height))
    }

    update()

    const ro = new ResizeObserver(() => update())
    ro.observe(el)

    const onResize = () => update()
    window.addEventListener('resize', onResize)

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', onResize)
    }
  }, [showMessagesArea, currentConversationId, isHeightFrozen])

  // Compute offset from bottom so input appears centered before docking (only transforms animate)
  useEffect(() => {
    const compute = () => {
      try {
        const viewportH = window.innerHeight || 0
        // Bias toward top: place around ~75% of viewport from bottom (i.e., above center)
        const bias = 0.75
        const liftPx = 64
        const raw = viewportH * bias - (inputHeight || 0) / 2 - liftPx
        // Clamp so it never starts too low or off-screen on very short heights
        const minOffset = 64
        const maxOffset = Math.max(0, Math.round(viewportH - (inputHeight || 0) - 96))
        const offset = Math.min(maxOffset, Math.max(minOffset, Math.round(raw)))
        setDockOffsetPx(offset)
      } catch {}
    }
    compute()
    const onResize = () => compute()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [inputHeight])

  // After unfreezing, recalc height once
  useEffect(() => {
    if (!isHeightFrozen) {
      const el = inputContainerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      setInputHeight(Math.ceil(rect.height))
    }
  }, [isHeightFrozen])

  // Track if user explicitly selected an agent to avoid auto-restore overriding it
  const userSelectedAgentRef = useRef(false)

  const updateStarterAgentQueryParam = useCallback(
    (agentSlug: string | null) => {
      // Only update query param on the starter view (no conversation id yet)
      if (currentConversationIdRef.current || externalConversationId) return
      try {
        const sp = new URLSearchParams(searchParams?.toString() || '')
        if (agentSlug && agentSlug.trim().length > 0) sp.set('agent', agentSlug)
        else sp.delete('agent')
        const qs = sp.toString()
        router.replace(qs ? `${pathname}?${qs}` : pathname)
      } catch {
        // ignore URL update failures
      }
    },
    [externalConversationId, pathname, router, searchParams]
  )

  // Core agent change handler used by both input and cards
  const handleAgentChange = useCallback(
    (agent: Agent | null) => {
      userSelectedAgentRef.current = true
      setSelectedAgentWithLogging(agent)
      // Mark that user has interacted with agent selection - never show Gaia fallback again
      if (agent) {
        hasSetInitialDefaultAgentRef.current = true
        hasEverSetAnyAgentRef.current = true
        lastAutoSelectedAgentIdRef.current = agent.id
      }
      // Persist to UI store immediately so other UI reads reflect the change
      if (agent && currentConversationId) {
        setConversationAgentStore(currentConversationId, agent.id as any, formatAgentDisplayName(agent) as any)
      }

      // Keep the starter URL in sync so the selected agent is shareable/bookmarkable
      updateStarterAgentQueryParam(agent?.slug ?? null)
    },
    [currentConversationId, setConversationAgentStore, setSelectedAgentWithLogging, updateStarterAgentQueryParam]
  )

  // Handle conversation start - receive actual database conversation ID
  const handleConversationStart = useCallback(
    (conversationId: string) => {
      // Mark that we've moved beyond initial landing - prevent Gaia fallback
      hasEverSetAnyAgentRef.current = true
      // IMPORTANT: update ref synchronously so route-transition guards can rely on it
      // even before the next render/effect runs.
      currentConversationIdRef.current = conversationId
      setCurrentConversationId(conversationId)
      pendingRouteConversationIdRef.current = conversationId
      // CRITICAL: Bridge the ship-layout stream provider during the route handoff.
      // Without this, the provider stays on "null conversation" until the URL param updates,
      // which makes the loader/avatar briefly disappear and then reappear.
      try {
        setPendingConversationId(conversationId)
      } catch {}
      onConversationChange?.(conversationId)
    },
    [onConversationChange, setPendingConversationId]
  )

  // Overlay disabled; keep a no-op for prop compatibility
  const handleToggleOverlay = useCallback(() => {}, [])

  // Reset conversation when external conversation ID changes
  const lastConversationIdForResetRef = useRef<string | null>(null)
  const [inputKey, setInputKey] = useState<string>('input-stable')

  useEffect(() => {
    if (externalConversationId === undefined) return

    // If we have a locally-created conversation id and we're waiting for the route to catch up,
    // do NOT clear it just because the current route still reports null.
    if (externalConversationId === null && pendingRouteConversationIdRef.current) {
      // Only ignore the null if our current id matches the pending one (i.e. we're in the handoff window).
      if (currentConversationIdRef.current === pendingRouteConversationIdRef.current) {
        return
      }
      // If we somehow got cleared to null during the transition, re-assert the pending id.
      if (currentConversationIdRef.current === null) {
        currentConversationIdRef.current = pendingRouteConversationIdRef.current
        setCurrentConversationId(pendingRouteConversationIdRef.current)
        return
      }
    }

    const wasNull = lastConversationIdForResetRef.current === null
    const isNowSet = externalConversationId !== null
    const isSwitchingBetweenExisting = lastConversationIdForResetRef.current !== null && externalConversationId !== null && lastConversationIdForResetRef.current !== externalConversationId

    // When switching between existing conversations - REMOUNT INPUT
    if (isSwitchingBetweenExisting) {
      // Change key to force remount
      setInputKey(`input-${externalConversationId}`)
      lastConversationIdForResetRef.current = externalConversationId
      // Allow auto-restore again on new conversation
      userSelectedAgentRef.current = false
      // Reset the auto-select guard so messages can update the agent
      lastAutoSelectedAgentIdRef.current = null
      // Clear the selected agent so it gets re-selected from new conversation's messages
      setSelectedAgentWithLogging(null)
    } else if (wasNull && isNowSet) {
      // First conversation created - DON'T change key, DON'T remount input
      // Keep stable key so input preserves the user's @mention
      lastConversationIdForResetRef.current = externalConversationId
      // Route has caught up; clear pending marker
      if (pendingRouteConversationIdRef.current === externalConversationId) {
        pendingRouteConversationIdRef.current = null
      }
      // DON'T reset userSelectedAgentRef - preserve user's choice
      // Allow messages to update naturally without remounting
    } else {
      lastConversationIdForResetRef.current = externalConversationId
      // If route now matches pending, clear it; if route switched elsewhere, also clear.
      if (pendingRouteConversationIdRef.current && pendingRouteConversationIdRef.current === externalConversationId) {
        pendingRouteConversationIdRef.current = null
      }
    }

    setCurrentConversationId(prev => (prev === externalConversationId ? prev : externalConversationId))
  }, [externalConversationId])

  useEffect(() => {
    // Reset user selection flag when conversation actually changes
    // BUT preserve the user's agent choice when creating the first conversation
    const wasNull = currentConversationIdRef.current === null
    const isNowSet = currentConversationId !== null
    const isCreatingFirstConversation = wasNull && isNowSet

    if (currentConversationIdRef.current !== currentConversationId && currentConversationId) {
      // Don't reset user selection when creating first conversation - preserve their agent choice
      if (!isCreatingFirstConversation) {
        userSelectedAgentRef.current = false
      }
    }
    currentConversationIdRef.current = currentConversationId
  }, [currentConversationId])

  // Handle initial agent selection from URL parameter (supports both ID and slug)
  useEffect(() => {
    if (initialAgentId && starshipAgentsData.length > 0 && !selectedAgent) {
      // Try to find by slug first (preferred), then fall back to ID for backward compatibility
      const agent = starshipAgentsData.find(a => a.slug === initialAgentId) || starshipAgentsData.find(a => a.id === initialAgentId)
      if (agent) {
        // Mark default as set so fallback effect does not override URL-selected agent
        hasSetInitialDefaultAgentRef.current = true
        setSelectedAgentWithLogging(agent)
        hasEverSetAnyAgentRef.current = true
        lastAutoSelectedAgentIdRef.current = agent.id
        // Also update the UI store so that this agent is remembered for this conversation
        if (currentConversationId) {
          setConversationAgentStore(currentConversationId, agent.id, formatAgentDisplayName(agent))
        }
      }
    }
  }, [initialAgentId, starshipAgentsData, selectedAgent, currentConversationId, setConversationAgentStore])

  // Set default agent (prefer aria*) ONLY on initial mount - use stable deps to avoid re-runs
  useEffect(() => {
    // Don't run if already set
    if (hasSetInitialDefaultAgentRef.current) {
      return
    }

    // If user has ever set any agent (including via @mention), don't override
    if (hasEverSetAnyAgentRef.current) {
      return
    }

    // CRITICAL: If user just selected an agent, don't override
    if (userSelectedAgentRef.current) {
      return
    }

    // If URL provided an initial agent, don't apply fallback
    if (initialAgentId) {
      return
    }

    // If an agent is already selected, do not override
    if (selectedAgent) {
      return
    }

    // CRITICAL: Don't apply Gaia fallback for existing conversations
    // Let message restoration handle agent selection from stored messages
    if (currentConversationId) {
      return
    }

    // ALSO check the external prop to catch race conditions
    if (externalConversationId) {
      return
    }

    // Wait for agents to load
    if (!Array.isArray(starshipAgentsData) || starshipAgentsData.length === 0) {
      return
    }

    const fallback = pickDefaultAgent(starshipAgentsData as any)

    if (fallback && typeof fallback.id === 'string') {
      // Set flags BEFORE state update to prevent re-runs
      hasSetInitialDefaultAgentRef.current = true
      hasEverSetAnyAgentRef.current = true
      lastAutoSelectedAgentIdRef.current = fallback.id

      setSelectedAgentWithLogging(fallback)
    }
    // CRITICAL: currentConversationId and externalConversationId are NOT in dependencies
    // to prevent re-running when conversation is created or URL changes
    // We check them in the effect body instead
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [starshipAgentsData, setSelectedAgentWithLogging, initialAgentId, selectedAgent])

  // Keep guard ref in sync with agent changes
  useEffect(() => {
    if (selectedAgent?.id) {
      lastAutoSelectedAgentIdRef.current = selectedAgent.id
    }
  }, [selectedAgent?.id])

  // Focus after conversation becomes ready
  useEffect(() => {
    if (currentConversationId) {
      const t = setTimeout(() => {
        messageInputRef.current?.focusInput?.()
      }, 100)
      return () => clearTimeout(t)
    }
  }, [currentConversationId])

  // Removed in-page builder save/cancel handlers

  // Toggle now navigates to tool builder route
  const handleToggleToolBuilder = useCallback(() => {
    if (!starshipSlug) return
    const convId = currentConversationIdRef.current || externalConversationId || null
    const q = convId ? `?conversationId=${encodeURIComponent(convId)}` : ''
    router.push(`/ship/${starshipSlug}/tool/new${q}`)
  }, [router, starshipSlug, externalConversationId])

  // Suggestions removed: conversation input no longer shows example prompt chips

  // Removed manual agent builder toggle (route-based only)

  // Handle UI action payloads (dedup across SSE 'ui_action' and assistant message JSON)
  const handleUIPayload = useCallback(
    (payload: any) => {
      try {
        if (!payload || typeof payload !== 'object' || typeof (payload as any).__ui_action !== 'string') return
        const key = JSON.stringify(payload)
        if (lastUIActionKeyRef.current === key) return
        lastUIActionKeyRef.current = key

        const action = (payload as any).__ui_action as string

        // Builders are route-based now; no in-place form updates

        switch (action) {
          case 'conversation_title_updated': {
            const cid = (payload as any)?.conversationId
            try {
              if (starshipId) {
                queryClient.invalidateQueries({ queryKey: CONVERSATION_QUERY_KEYS.byStarship(starshipId) })
              }
              if (cid) {
                queryClient.invalidateQueries({ queryKey: CONVERSATION_QUERY_KEYS.detail(cid) })
              }
            } catch {}
            break
          }
          case 'child_conversation_created': {
            try {
              const sid = (payload as any)?.starshipId || starshipId
              if (sid) {
                queryClient.invalidateQueries({ queryKey: CONVERSATION_QUERY_KEYS.byStarship(sid) })
              }
            } catch {}
            break
          }
          // All tool form management is handled in dedicated routes now

          default:
            break
        }
      } catch {
        // ignore
      }
    },
    [queryClient, router, starshipId, starshipSlug, externalConversationId]
  )

  // Stream-dependent side-effects are handled within the provider context to avoid duplicate SSE connections
  function StreamSideEffects() {
    const ctx = useConversationStreamContextOptional()
    const uiStreaming = ctx?.isStreaming
    const liveMessages = (ctx?.messages as any[]) || []
    const lastUIAction = (ctx as any)?.lastUIAction
    const prevStreamingRef = useRef(false)

    // Consume UI actions emitted over SSE (conversation title updates, child conversations, etc.)
    useEffect(() => {
      if (!lastUIAction) return
      handleUIPayload(lastUIAction)
    }, [lastUIAction, handleUIPayload])

    // Track last processed state to avoid redundant updates
    const lastProcessedStateRef = useRef<{ conversationId: string; agentId: string } | null>(null)

    // Track message count per conversation to detect when messages have loaded
    const conversationMessageCountRef = useRef<Record<string, number>>({})

    // Auto-restore agent from messages - PRIORITY 1: Most recent agent from messages
    useEffect(() => {
      // Always update from messages - they are authoritative
      if (!currentConversationId) return
      if (!Array.isArray(starshipAgentsData) || starshipAgentsData.length === 0) return

      // Track message count for this conversation
      const messageCount = liveMessages?.length || 0
      const lastCount = conversationMessageCountRef.current[currentConversationId] || 0

      // Skip if no messages yet or count hasn't changed (avoid processing same data)
      if (messageCount === 0) return

      // CRITICAL: Don't override user's agent selection if they just made a choice
      // This prevents race conditions where messages load before user's selection is processed
      if (userSelectedAgentRef.current) {
        // User recently selected an agent - don't override from messages yet
        // Update count tracker but skip restoration
        conversationMessageCountRef.current[currentConversationId] = messageCount
        return
      }

      // Update the count tracker
      conversationMessageCountRef.current[currentConversationId] = messageCount

      // Extract most recent agent from loaded messages, verifying they belong to this conversation
      const recentAgentId = getMostRecentAgentIdFromMessages(liveMessages, currentConversationId, starshipAgentsData)

      if (recentAgentId) {
        const messageAgent = starshipAgentsData.find(agent => agent.id === recentAgentId) || null
        if (messageAgent) {
          // Always update when messages show a different agent than currently selected
          if (selectedAgent?.id !== messageAgent.id) {
            lastAutoSelectedAgentIdRef.current = messageAgent.id
            setSelectedAgentWithLogging(messageAgent)
            // Mark that an agent has been set - prevent Gaia fallback
            hasEverSetAnyAgentRef.current = true
            // Update the store so it's remembered for this conversation
            setConversationAgentStore(currentConversationId, messageAgent.id, formatAgentDisplayName(messageAgent))
          }
        }
      }
    }, [liveMessages, currentConversationId, starshipAgentsData, selectedAgent, setConversationAgentStore])

    // Focus input when streaming transitions from true -> false
    useEffect(() => {
      const was = prevStreamingRef.current
      let t: number | null = null
      if (was && !uiStreaming) {
        t = window.setTimeout(() => {
          try {
            messageInputRef.current?.focusInput?.()
          } catch {}
        }, 50)
      }
      prevStreamingRef.current = Boolean(uiStreaming)
      return () => {
        if (t) clearTimeout(t)
      }
    }, [uiStreaming])

    // Removed UI action JSON parsing during streaming

    // Removed Tool completion follow-ups (handled in builder routes)

    // Removed UI action channel consumption

    return (
      <>
      </>
    )
  }

  // Removed overlay UI effects

  // Removed streaming into in-page tool builder (handled in dedicated route)
  useEffect(() => {
    return
  }, [currentConversationId])

  // Removed streaming into in-page agent builder (handled in dedicated route)
  useEffect(() => {
    return
  }, [currentConversationId])

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex flex-col h-screen items-center justify-center">
        <div className="text-center space-y-4 opacity-100">
          <div className="w-16 h-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
            <Icon name="sparkles" className="w-8 h-8 text-primary animate-pulse" />
          </div>
          <p className="text-muted-foreground">Initializing conversation...</p>
        </div>
      </div>
    )
  }

  // Show auth required state
  if (!isAuthenticated) {
    return (
      <div className="flex flex-col h-screen items-center justify-center">
        <div className="text-center space-y-4 opacity-100">
          <div className="w-16 h-16 mx-auto bg-muted/20 rounded-full flex items-center justify-center">
            <Icon name="user" className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground">Please sign in to start a conversation</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex flex-col h-screen">
      {/* Content container */}
      <div className="relative z-[2] flex flex-col h-full">
        {/* Main Content Area - Conversation only; builders use dedicated routes */}
        {/* Messages Area */}
        {showMessagesArea ? (
          <>
            <ConversationSummaryBar conversationId={currentConversationId} starshipId={starshipId} />
            <div className="relative flex-1 min-h-0">
              <ConversationMessageList conversationId={currentConversationId} starshipId={starshipId} bottomPaddingPx={inputHeight + 24} />
            </div>
            {/* Single place for stream-dependent side-effects */}
            <StreamSideEffects />
          </>
        ) : null}

        {/* Input Container - anchored from the top on welcome, bottom section during conversation */}
        <div ref={inputContainerRef} className={cn('px-6 pb-4 pt-2', !showMessagesArea && 'pt-4 sm:pt-6 lg:pt-10 pb-10')}>
          <div className={cn('w-full max-w-2xl mx-auto pointer-events-auto opacity-100 relative', !showMessagesArea && 'mt-16 sm:mt-24 lg:mt-40')} data-message-input>
            {/* Keep the input mounted across the welcome -> conversation transition to avoid losing focus. */}
            <div className={cn('mb-8 text-center opacity-100', showMessagesArea && 'hidden')} key="welcome-header">
              <h1 className="text-3xl font-normal mb-2 text-foreground">{`Welcome to your starship, ${starshipName}`}</h1>
              <p className="text-base text-muted-foreground">{starterSlogan}</p>
            </div>

            <div className={cn('mb-6', (!shouldShowWelcomeCard || showMessagesArea) && 'hidden')} key="welcome-card">
              <WelcomeSignupCard userName={authUser?.name} onDismiss={dismissWelcomeCard} />
            </div>

            {/* Starter layout: Agent select, Message input, Suggested prompts — stable mount (use CSS to show/hide). */}
            <div className={cn('flex flex-col gap-6')} key="composer-stack">
              <div className={cn(showMessagesArea && 'hidden')} key="agent-selector">
                <div className="mb-1">
                  <p className="text-xs font-medium text-muted-foreground">Select an agent</p>
                </div>
                <div className="flex items-center justify-start gap-3">
                  <AgentSelector selectedAgent={selectedAgent as any} onAgentChange={handleAgentChange as any} starshipId={starshipId} compact={false} />
                </div>
              </div>

              <div key="message-input">
                <div className={cn('mb-1', showMessagesArea && 'hidden')}>
                  <p className="text-xs font-medium text-muted-foreground">and give instructions</p>
                </div>
                <ConversationMessageInput
                  key={inputKey}
                  ref={messageInputRef}
                  selectedAgent={selectedAgent}
                  starshipId={starshipId}
                  conversationId={currentConversationId}
                  onConversationStart={handleConversationStart}
                  onToggleToolForm={handleToggleToolBuilder}
                  isToolFormOpen={false}
                  disabled={false}
                  minimal={isInputDocked}
                  onFocus={() => {}}
                  onBlur={() => {}}
                  onToggleOverlay={handleToggleOverlay}
                  showExpandableOverlay={false}
                  isOverlayExpanded={false}
                  budgetTokens={budgetTokens}
                  onAgentChange={handleAgentChange}
                  starshipSlug={starshipSlug}
                ></ConversationMessageInput>
              </div>

              <div className={cn((showMessagesArea || agentSuggestionCards.length < 3) && 'hidden')} key="suggestions">
                <div className="mb-1 flex items-center justify-between">
                  <div className="text-left">
                    <p className="text-xs font-medium text-muted-foreground">or select an example</p>
                  </div>
                  {agentSuggestionCards.length > 3 && (
                    <button type="button" onClick={() => setShowAllSuggestions(v => !v)} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                      {showAllSuggestions ? (
                        <>
                          Show fewer
                          <Icon name="chevron-up" className="h-3 w-3 translate-y-px" />
                        </>
                      ) : (
                        <>
                          Explore all
                          <Icon name="chevron-down" className="h-3 w-3" />
                        </>
                      )}
                    </button>
                  )}
                </div>
                <ul className="space-y-3">
                  {(showAllSuggestions ? agentSuggestionCards : collapsedSuggestionCards).map(item => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => {
                          try {
                            // Prefill the message input without inserting sticky mentions
                            messageInputRef.current?.setLeadingMentionAgent?.(item.agent as any, item.text)
                            messageInputRef.current?.focusInput?.()
                          } catch {}
                        }}
                        className="group flex w-full rounded-2xl bg-card border border-border/40 shadow-sm px-3 py-2 text-left transition-all duration-200 hover:bg-muted/30 hover:border-muted hover:shadow-md hover:-translate-y-1"
                      >
                        <p className="text-sm leading-relaxed text-foreground/95 group-hover:text-foreground break-words">
                          <span className="mr-1 text-base align-top text-primary/70">“</span>
                          {item.text}
                          <span className="ml-1 text-base align-baseline text-primary/70">”</span>
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Extra space at the bottom so the page can scroll past the last card on the welcome view */}
        {!showMessagesArea && <div className="h-64" />}
      </div>
    </div>
  )
}
