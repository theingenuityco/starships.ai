'use client'

import Icon from '@/components/primitives/Icon'

import { ConversationMessageInput, ConversationMessageInputRef } from '@/components/conversation/ConversationMessageInput'
import { ConversationMessageList } from '@/components/conversation/ConversationMessageList'
import { ConversationSummaryBar } from '@/components/conversation/ConversationSummaryBar'
import { Avatar } from '@/components/ui/avatar'
import AgentAvatar from '@/components/animated/AgentAvatar'
import { useAuth, useAuthUser } from '@/hooks/useAuth'
import { useStarshipAgents } from '@/hooks/useAgents'
import { useStarshipConversations, CONVERSATION_QUERY_KEYS } from '@/hooks/useConversations'
import { ConversationStreamProvider, useConversationStreamContextOptional } from '@/hooks/ConversationStreamContext'
import { useQueryClient } from '@tanstack/react-query'
import { useStarshipUIStore } from '@/store/starship-ui-store'
import { useStarship } from '@/hooks/useStarships'
import type { Agent } from '@/lib/api'
import { agentAPI, templateAPI, toolAPI } from '@/lib/api'
import { AgentCreatedModal } from '@/components/agents/AgentCreatedModal'
import { useDeferredAgentCreationModal } from '@/hooks/useDeferredAgentCreationModal'
import { useDeferredToolCreationModal } from '@/hooks/useDeferredToolCreationModal'
import { ToolCreatedModal } from '@/components/tools/ToolCreatedModal'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ConversationContextBar } from '@/components/conversation/ConversationContextBar'
import { useModelContextLength } from '@/hooks/useOpenRouterModels'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

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

export function ConversationInterface({ starshipId, conversationId: externalConversationId, onConversationChange, initialAgentId, starshipSlug }: ConversationInterfaceProps) {
  const { userId, isAuthenticated, isLoading } = useAuth()
  const { data: authUser } = useAuthUser()
  const router = useRouter()

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
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)
  const currentConversationIdRef = useRef<string | null>(null)
  // When we create a new conversation from the /conversations landing, we set the id locally
  // before the route param updates. During that handoff, `externalConversationId` can still be null.
  // Track the pending id so we don't immediately overwrite local state back to null.
  const pendingRouteConversationIdRef = useRef<string | null>(null)

  // Refs for direct communication with components
  const messageInputRef = useRef<ConversationMessageInputRef>(null)
  // Removed in-conversation builder overlays; now using dedicated routes
  // Removed UI action handling

  // View is always 'conversation' now; builders have dedicated routes
  const [viewMode] = useState<'conversation'>('conversation')
  const viewModeRef = useRef<'conversation'>('conversation')
  // Track applied tool call keys to accumulate across messages
  const appliedToolCallKeysRef = useRef<Set<string>>(new Set())
  // Track last conversation id to reset applied set
  const lastAppliedConversationRef = useRef<string | null>(null)
  // Deduplicate UI action payloads across sources
  const lastUIActionKeyRef = useRef<string | null>(null)

  // Removed overlay state; no longer used without in-page builders
  const [isMessageOverlayExpanded] = useState(false)
  const wasOpenedByStreamingRef = useRef(false)

  // Track pending tool calls for completion detection
  const pendingToolCallsRef = useRef<Map<string, { toolName: string; args: any; completed?: boolean }>>(new Map())
  // Track toolCallIds we've already navigated for to avoid duplicate route pushes
  const navigatedToolCallIdsRef = useRef<Set<string>>(new Set())
  // Navigation baseline for current streaming turn to avoid acting on old messages
  const navPrevStreamingRef = useRef<boolean>(false)
  const navTurnStartIdxRef = useRef<number | null>(null)
  // Creation flow guard for tool builder routing during current turn
  const toolCreationFlowActiveRef = useRef<boolean>(false)
  const setToolCreationFlowFlag = (on: boolean) => {
    try {
      if (!currentConversationIdRef.current) return
      const key = `toolCreationFlow:${currentConversationIdRef.current}`
      if (typeof window === 'undefined' || !window.sessionStorage) return
      if (on) window.sessionStorage.setItem(key, JSON.stringify({ ts: Date.now() }))
      else window.sessionStorage.removeItem(key)
    } catch {}
  }

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
  const { data: starshipConversationsData } = useStarshipConversations(starshipId || '', true)
  const { data: starshipData } = useStarship(starshipId || '', !!starshipId)
  const conversationData = useStarshipUIStore(s => (currentConversationId ? s.conversations[currentConversationId] : undefined))
  const setConversationAgentStore = useStarshipUIStore(s => s.setConversationAgent)

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
  const starterGreetings = useMemo(
    () => [
      `Hi ${displayName}`,
      `Ship mode on`,
      `It's automation time`,
      `Agents awaiting orders`,
      `Ideas to agents, ${displayName}`,
      `Less meetings, more shipping`,
      `New mission unlocked`,
      `Let the agents handle it`,
      `One prompt away from prod`,
      `Prototype now, refactor later`,
    ],
    [displayName]
  )
  const starterGreeting = useMemo(() => starterGreetings[Math.floor(Math.random() * starterGreetings.length)] ?? 'What are we building today?', [starterGreetings])

  // For collapsed view, show only the first few prompts for the selected agent
  const collapsedSuggestionCards = useMemo(() => {
    return agentSuggestionCards.slice(0, 3)
  }, [agentSuggestionCards])

  // Gate the heavy "conversation layout" (message list + docked input) more carefully:
  // - Existing conversations (loaded directly via route) should show immediately.
  // - Newly created conversations should NOT abruptly flip layouts on the null->id handoff;
  //   wait until we have at least one message or the turn is responding.
  const initialHadConversationRef = useRef<boolean>(externalConversationId != null)
  const conversationUi = useStarshipUIStore(s => (currentConversationId ? s.conversations[currentConversationId] : undefined))
  const hasAnyMessages = Boolean((conversationUi?.messages?.length ?? 0) > 0)
  const isRespondingUi = Boolean(conversationUi?.isResponding)
  const showMessagesArea = Boolean(currentConversationId && (initialHadConversationRef.current || hasAnyMessages || isRespondingUi))

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
        setConversationAgentStore(currentConversationId, agent.id as any, agent.name as any)
      }
    },
    [currentConversationId, setConversationAgentStore, setSelectedAgentWithLogging]
  )

  // Handle conversation start - receive actual database conversation ID
  const handleConversationStart = useCallback(
    (conversationId: string) => {
      // Mark that we've moved beyond initial landing - prevent Gaia fallback
      hasEverSetAnyAgentRef.current = true
      setCurrentConversationId(conversationId)
      pendingRouteConversationIdRef.current = conversationId
      onConversationChange?.(conversationId)
    },
    [onConversationChange]
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
          setConversationAgentStore(currentConversationId, agent.id, agent.name)
        }
      }
    }
  }, [initialAgentId, starshipAgentsData, selectedAgent, currentConversationId, setConversationAgentStore])

  // Set Gaia as default ONLY on initial mount - use stable deps to avoid re-runs
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

    // Agents are already sorted on the server (newest first), so use the first as the default
    const fallback = starshipAgentsData[0]

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

  // Keep view mode ref in sync to avoid stale closure issues
  useEffect(() => {
    viewModeRef.current = viewMode
  }, [viewMode])

  // Reset applied tool-calls tracker when conversation changes
  useEffect(() => {
    if (lastAppliedConversationRef.current !== currentConversationId) {
      appliedToolCallKeysRef.current.clear()
      lastAppliedConversationRef.current = currentConversationId ?? null
    }
  }, [currentConversationId])

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
  const handleUIPayload = useCallback((payload: any) => {
    try {
      if (!payload || typeof payload !== 'object' || typeof (payload as any).__ui_action !== 'string') return
      const key = JSON.stringify(payload)
      if (lastUIActionKeyRef.current === key) return
      lastUIActionKeyRef.current = key

      const action = (payload as any).__ui_action as string

      // Debug logging for UI actions coming from SSE
      try {
        // eslint-disable-next-line no-console
        console.debug('[ConversationInterface] handleUIPayload', {
          action,
          payload,
          starshipId,
        })
      } catch {}

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
            // eslint-disable-next-line no-console
            console.debug('[ConversationInterface] child_conversation_created – invalidating conversations for starship', {
              starshipId: sid,
            })
            if (sid) {
              queryClient.invalidateQueries({ queryKey: CONVERSATION_QUERY_KEYS.byStarship(sid) })
            }
          } catch {}
          break
        }
        case 'tool_call_detected': {
          const toolName = (payload as any).toolName
          const toolNameLc = typeof toolName === 'string' ? toolName.toLowerCase() : ''
          const toolCallId = (payload as any).toolCallId

          // Store tool call info for later completion handling
          if (toolCallId) {
            pendingToolCallsRef.current.set(toolCallId, { toolName, args: {} })
          }

          // Navigate to tool builder route for tool actions
          const toolBuilderSlugFragments = ['open-tool', 'edit-tool', 'modify-tool-blueprint-node', 'modify-tool-blueprint-edge']
          if (toolBuilderSlugFragments.some(s => toolNameLc.includes(s)) || toolNameLc.includes('tool-blueprint-')) {
            try {
              const toolSlug = (payload as any)?.slug || (payload as any)?.toolSlug || 'new'
              const slug = starshipSlug
              if (slug) {
                const convId = currentConversationIdRef.current || externalConversationId || null
                const q = convId ? `?conversationId=${encodeURIComponent(convId)}` : ''
                router.push(`/ship/${slug}/tool/${encodeURIComponent(toolSlug)}${q}`)
              } else {
                // If slug missing, do nothing special
              }
            } catch {
              // ignore navigation error
            }
          }

          // Navigate to agent builder for agent actions
          const agentBuilderSlugFragments = ['open-agent', 'edit-agent', 'assign-agent-tool', 'unassign-agent-tool']
          if (agentBuilderSlugFragments.some(s => toolNameLc.includes(s))) {
            try {
              const isOpenAgent = toolNameLc.includes('open-agent')
              let nextAgentSlug = (payload as any)?.slug || (payload as any)?.agentSlug
              // Do NOT fallback to selected agent; for open-agent without slug, go to 'new'
              if (!nextAgentSlug && isOpenAgent) {
                nextAgentSlug = 'new'
              }
              const slug = starshipSlug
              if (slug) {
                const convId = currentConversationIdRef.current || externalConversationId || null
                const q = convId ? `?conversationId=${encodeURIComponent(convId)}` : ''
                if (nextAgentSlug) {
                  router.push(`/ship/${slug}/agent/${encodeURIComponent(nextAgentSlug)}${q}`)
                }
              } else {
                // If slug missing, do nothing special
              }
            } catch {
              // ignore navigation error
            }
          }
          break
        }

        // All tool form management is handled in dedicated routes now

        default:
          break
      }
    } catch {
      // ignore
    }
  }, [])

  // Handle tool completion for entity-modifying tools
  const handleToolComplete = useCallback(
    async (toolName: string, toolArgs: any) => {
      try {
        // Agent tools - fetch and sync agent data
        const agentTools = ['open-agent', 'edit-agent', 'assign-agent-tool', 'unassign-agent-tool']
        if (agentTools.includes(toolName) && toolArgs?.slug) {
          // Fetch complete agent data by slug
          const agent = await agentAPI.getBySlug(toolArgs.slug)

          // In dedicated route, the page handles syncing; nothing to update here
        }

        // Tool tools - fetch and sync tool data
        const toolTools = ['open-tool', 'edit-tool', 'modify-tool-blueprint-node', 'modify-tool-blueprint-edge']
        if (toolTools.includes(toolName) && toolArgs?.slug) {
          // Fetch complete tool data by slug
          const tool = await toolAPI.getBySlug(starshipId, toolArgs.slug)

          // In dedicated route, the page handles syncing; nothing to update here
        }
      } catch (error) {
        console.error('Failed to fetch entity after tool completion:', error)
      }
    },
    [starshipId]
  )

  // Stream-dependent side-effects are handled within the provider context to avoid duplicate SSE connections
  function StreamSideEffects() {
    const ctx = useConversationStreamContextOptional()
    const uiStreaming = ctx?.isStreaming
    const liveMessages = (ctx?.messages as any[]) || []
    const lastUIAction = (ctx as any)?.lastUIAction
    const prevStreamingRef = useRef(false)
    const deferredAgentCreate = useDeferredAgentCreationModal({
      liveMessages,
      isStreaming: uiStreaming,
      starshipSlug,
      conversationId: currentConversationId || externalConversationId || null,
      agents: Array.isArray(starshipAgentsData) ? starshipAgentsData : undefined,
      setLeadingMentionAgent: (agent: any, afterText?: string) => {
        try {
          console.debug('[ConversationInterface] forwarding setLeadingMentionAgent', {
            agent: { id: agent?.id, name: agent?.name, slug: agent?.slug },
            afterText,
          })
        } catch {}
        try {
          messageInputRef.current?.setLeadingMentionAgent?.(agent, afterText)
        } catch {}
      },
      focusInput: () => {
        try {
          messageInputRef.current?.focusInput?.()
        } catch {}
      },
    })
    const deferredToolCreate = useDeferredToolCreationModal({
      liveMessages,
      isStreaming: uiStreaming,
      starshipSlug,
      conversationId: currentConversationId || externalConversationId || null,
      starshipId,
      agents: Array.isArray(starshipAgentsData) ? starshipAgentsData : undefined,
      setLeadingMentionAgent: (agent: any, afterText?: string) => {
        try {
          messageInputRef.current?.setLeadingMentionAgent?.(agent, afterText)
        } catch {}
      },
      focusInput: () => {
        try {
          messageInputRef.current?.focusInput?.()
        } catch {}
      },
    })

    // Consume UI actions emitted over SSE (conversation title updates, child conversations, etc.)
    useEffect(() => {
      if (!lastUIAction) return
      try {
        // eslint-disable-next-line no-console
        console.debug('[ConversationInterface] lastUIAction from stream', lastUIAction)
      } catch {}
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
            setConversationAgentStore(currentConversationId, messageAgent.id, messageAgent.name)
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

    // Track turn boundaries for navigation baseline
    useEffect(() => {
      const was = navPrevStreamingRef.current
      if (!was && uiStreaming) {
        // Turn just started: record baseline so we only act on new messages
        navTurnStartIdxRef.current = liveMessages.length
        toolCreationFlowActiveRef.current = false
        setToolCreationFlowFlag(false)
      }
      if (was && !uiStreaming) {
        // Turn ended: clear baseline and navigated ids
        navTurnStartIdxRef.current = null
        navigatedToolCallIdsRef.current.clear()
        toolCreationFlowActiveRef.current = false
        setToolCreationFlowFlag(false)
      }
      navPrevStreamingRef.current = Boolean(uiStreaming)
    }, [uiStreaming, liveMessages.length])

    // Proactive navigation on tool calls (only during active streaming; only new messages after turn start)
    useEffect(() => {
      if (!uiStreaming || !currentConversationId || !liveMessages.length || !starshipSlug) return
      if (navTurnStartIdxRef.current === null) return
      const newMessages = (liveMessages as any[]).slice(navTurnStartIdxRef.current as number)

      // PRIORITY PASS: If any open-tool without slug exists in this turn, immediately route to /tool/new
      if (!toolCreationFlowActiveRef.current) {
        for (let i = 0; i < newMessages.length; i++) {
          const msg = newMessages[i] as any
          if (msg?.role !== 'assistant' || !Array.isArray(msg?.toolCalls)) continue
          for (const tc of msg.toolCalls as any[]) {
            const rawName = tc?.function?.name as string | undefined
            const name = typeof rawName === 'string' ? rawName.toLowerCase() : ''
            if (!name) continue
            let args: any = tc?.function?.arguments
            if (typeof args === 'string') {
              try {
                args = JSON.parse(args)
              } catch {}
            }
            if (name.includes('open-tool')) {
              const toolSlug = args?.slug || args?.toolSlug
              if (!toolSlug) {
                const convId = currentConversationIdRef.current || externalConversationId || null
                const q = convId ? `?conversationId=${encodeURIComponent(convId)}` : ''
                try {
                  toolCreationFlowActiveRef.current = true
                  setToolCreationFlowFlag(true)
                  router.push(`/ship/${starshipSlug}/tool/new${q}`)
                } catch {}
                return
              }
            }
          }
        }
      }

      for (let i = 0; i < newMessages.length; i++) {
        const msg = newMessages[i] as any
        if (msg?.role !== 'assistant' || !Array.isArray(msg?.toolCalls)) continue
        for (const tc of msg.toolCalls as any[]) {
          const id = tc?.id as string | undefined
          if (!id || navigatedToolCallIdsRef.current.has(id)) continue
          const rawName = tc?.function?.name as string | undefined
          const name = typeof rawName === 'string' ? rawName.toLowerCase() : ''
          if (!name) continue

          const toolFragments = ['open-tool', 'edit-tool', 'modify-tool-blueprint-node', 'modify-tool-blueprint-edge']
          const agentFragments = ['open-agent', 'edit-agent']

          let args: any = tc?.function?.arguments
          if (typeof args === 'string') {
            try {
              args = JSON.parse(args)
            } catch {}
          }

          if (toolFragments.some(f => name.includes(f)) || name.includes('tool-blueprint-')) {
            const isOpen = name.includes('open-tool')
            const isEdit = name.includes('edit-tool')
            let toolSlug = args?.slug || args?.toolSlug
            const convId = currentConversationIdRef.current || externalConversationId || null
            const q = convId ? `?conversationId=${encodeURIComponent(convId)}` : ''
            try {
              if (isOpen && !toolSlug) {
                // Creation flow: go to /tool/new and mark creation flag for this turn
                toolCreationFlowActiveRef.current = true
                setToolCreationFlowFlag(true)
                router.push(`/ship/${starshipSlug}/tool/new${q}`)
                navigatedToolCallIdsRef.current.add(id)
                return
              }
              if ((isOpen || isEdit) && toolSlug) {
                // Respect creation-flow guard to avoid slug jumps within same turn
                if (toolCreationFlowActiveRef.current) {
                  navigatedToolCallIdsRef.current.add(id)
                  return
                }
                router.push(`/ship/${starshipSlug}/tool/${encodeURIComponent(toolSlug)}${q}`)
                navigatedToolCallIdsRef.current.add(id)
                return
              }
            } catch {}
          }
          if (agentFragments.some(f => name.includes(f))) {
            const isOpen = name.includes('open-agent')
            const isEdit = name.includes('edit-agent')
            let agentSlug = args?.slug || args?.agentSlug
            if (isOpen && !agentSlug) agentSlug = 'new'
            if (isEdit && !agentSlug) continue
            if (!isOpen && !isEdit) continue
            const convId = currentConversationIdRef.current || externalConversationId || null
            const q = convId ? `?conversationId=${encodeURIComponent(convId)}` : ''
            try {
              router.push(`/ship/${starshipSlug}/agent/${encodeURIComponent(agentSlug)}${q}`)
            } catch {}
            navigatedToolCallIdsRef.current.add(id)
            return
          }
        }
      }
    }, [uiStreaming, currentConversationId, externalConversationId, liveMessages, starshipSlug, router])

    // Removed Tool completion follow-ups (handled in builder routes)

    // Removed UI action channel consumption

    return (
      <>
        <AgentCreatedModal
          open={deferredAgentCreate.isOpen}
          names={deferredAgentCreate.createdNames}
          onOpenChange={deferredAgentCreate.setIsOpen}
          onChatWithAgent={deferredAgentCreate.chatWithAgent}
          onAskDaedalusCreateTools={deferredAgentCreate.askDaedalusCreateTools}
          agents={Array.isArray(deferredAgentCreate.createdAgents) ? (deferredAgentCreate.createdAgents as any) : undefined}
        />
        <ToolCreatedModal
          open={deferredToolCreate.isOpen}
          names={deferredToolCreate.createdNames}
          onOpenChange={deferredToolCreate.setIsOpen}
          onOpenTool={deferredToolCreate.openToolInBuilder}
          slugs={deferredToolCreate.createdSlugs}
          tools={Array.isArray(deferredToolCreate.createdTools) ? (deferredToolCreate.createdTools as any) : undefined}
          onAskGaiaAssignTool={deferredToolCreate.askGaiaAssignTool}
        />
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
        {/* Single streaming provider for BOTH message list and input to avoid duplicate SSE subscriptions
            (and to keep the stop/loading UI in sync everywhere). */}
        <ConversationStreamProvider conversationId={currentConversationId} starshipId={starshipId}>
          {/* Main Content Area - Conversation only; builders use dedicated routes */}
          {/* Messages Area */}
          {showMessagesArea ? (
            <>
              <ConversationSummaryBar conversationId={currentConversationId} starshipId={starshipId} />
              <div className="relative flex-1 min-h-0">
                <ConversationMessageList conversationId={currentConversationId} starshipId={starshipId} bottomPaddingPx={inputHeight + 24} />
              </div>
              {/* Single place for stream-dependent side-effects to avoid duplicate SSE subscriptions */}
              <StreamSideEffects />
            </>
          ) : null}

          {/* Input Container - anchored from the top on welcome, bottom section during conversation */}
          <div ref={inputContainerRef} className={cn('px-6 pb-4 pt-2', !showMessagesArea && 'pt-6 pb-10')}>
            <div className={cn('w-full max-w-2xl mx-auto pointer-events-auto opacity-100 relative', !showMessagesArea && 'mt-40')} data-message-input>
              {!showMessagesArea && (
                <div className="mb-8 text-center opacity-100">
                  <h1 className="text-3xl font-normal mb-4 text-foreground">{starterGreeting}</h1>
                </div>
              )}
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
              {/* Starship agents selector - shown between the input and suggested prompts on the welcome view */}
              {!showMessagesArea && Array.isArray(starshipAgentsData) && starshipAgentsData.length > 0 && (
                <div className="mt-12">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="text-left">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Select an agent</p>
                    </div>
                    {starshipSlug && (
                      <button
                        type="button"
                        onClick={() => {
                          try {
                            router.push(`/ship/${starshipSlug}/agents`)
                          } catch {}
                        }}
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        See all agents
                        <Icon name="chevron-right" className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  <div className="flex gap-3 overflow-x-auto custom-scrollbar">
                    {starshipAgentsData.map((agent: any) => (
                      <button
                        key={agent.id}
                        type="button"
                        onClick={() => {
                          // Delegate agent selection + leading mention insertion to the input's
                          // TipTap-aware helper, which also calls onAgentChange under the hood.
                          try {
                            messageInputRef.current?.setLeadingMentionAgent?.(agent as any)
                          } catch {}
                        }}
                        className={cn(
                          'group flex-shrink-0 w-[260px] rounded-2xl border bg-card/80 px-4 py-4 text-left transition-colors shadow-sm hover:bg-primary/5 hover:border-primary/40',
                          selectedAgent?.id === agent.id ? 'border-primary/70 bg-primary/5 shadow-[0_0_0_1px_rgba(245,158,11,0.35)]' : 'border-border/60'
                        )}
                      >
                        <div className="flex flex-col gap-2">
                          <div className="flex items-end gap-3">
                            <Avatar className="h-8 w-8 ring-1 ring-border/40 rounded-full">
                              <AgentAvatar seed={agent.name} size={32} rounded />
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <div className="mb-1 flex flex-col gap-[2px]">
                                <p className="text-base font-semibold text-foreground truncate group-hover:text-primary">{agent.name}</p>
                              </div>
                            </div>
                          </div>
                          {agent.description && <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{agent.description}</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* Suggested prompts for the selected agent, positioned below the input without shifting it */}
              {!showMessagesArea && agentSuggestionCards.length >= 3 && (
                <div className="mt-12 absolute inset-x-0 top-full">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="text-left">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Suggested prompts{selectedAgent ? ` for ${selectedAgent.name}` : ''}</p>
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
                              messageInputRef.current?.setLeadingMentionAgent?.(item.agent as any, item.text)
                              messageInputRef.current?.focusInput?.()
                            } catch {}
                          }}
                          className="group flex w-full rounded-2xl border border-border/60 bg-card px-3 py-2 text-left transition-colors hover:bg-primary/5 hover:border-primary/40"
                        >
                          <p className="text-sm leading-relaxed text-foreground/95 group-hover:text-primary break-words">
                            <span className="mr-1 text-base align-top text-primary/70">“</span>
                            {item.text}
                            <span className="ml-1 text-base align-baseline text-primary/70">”</span>
                          </p>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Extra space at the bottom so the page can scroll past the last card on the welcome view */}
          {!showMessagesArea && <div className="h-64" />}
        </ConversationStreamProvider>
      </div>
    </div>
  )
}
