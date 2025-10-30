'use client'

import Icon from '@/components/primitives/Icon'

import { ConversationMessageInput, ConversationMessageInputRef } from '@/components/conversation/ConversationMessageInput'
import { ConversationMessageList } from '@/components/conversation/ConversationMessageList'
import { ConversationSummaryBar } from '@/components/conversation/ConversationSummaryBar'
import { useAuth } from '@/hooks/useAuth'
import { useStarshipAgents } from '@/hooks/useAgents'
import { useStarshipConversations, CONVERSATION_QUERY_KEYS } from '@/hooks/useConversations'
import { ConversationStreamProvider, useConversationStreamContextOptional } from '@/hooks/ConversationStreamContext'
import { useQueryClient } from '@tanstack/react-query'
import { useStarshipUIStore } from '@/store/starship-ui-store'
import type { Agent } from '@/lib/api'
import api, { agentAPI, toolAPI } from '@/lib/api'
import { Avatar } from '@/components/ui/avatar'
import AgentAvatar from '@/components/animated/AgentAvatar'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ConversationContextBar } from '@/components/conversation/ConversationContextBar'
import { useModelContextLength } from '@/hooks/useOpenRouterModels'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'motion/react'

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

  // Refs for direct communication with components
  const messageInputRef = useRef<ConversationMessageInputRef>(null)
  // Removed in-conversation builder overlays; now using dedicated routes
  const lastUIActionKeyRef = useRef<string | null>(null)

  // View is always 'conversation' now; builders have dedicated routes
  const [viewMode] = useState<'conversation'>('conversation')
  const viewModeRef = useRef<'conversation'>('conversation')
  // Track applied tool call keys to accumulate across messages
  const appliedToolCallKeysRef = useRef<Set<string>>(new Set())
  // Track last conversation id to reset applied set
  const lastAppliedConversationRef = useRef<string | null>(null)

  // Removed overlay state; no longer used without in-page builders
  const [isMessageOverlayExpanded] = useState(false)
  const wasOpenedByStreamingRef = useRef(false)

  // Track pending tool calls for completion detection
  const pendingToolCallsRef = useRef<Map<string, { toolName: string; args: any; completed?: boolean }>>(new Map())
  // Track toolCallIds we've already navigated for to avoid duplicate route pushes
  const navigatedToolCallIdsRef = useRef<Set<string>>(new Set())

  const queryClient = useQueryClient()

  // Measure floating input height to reserve scroll space and prevent overlap with the floating composer
  const inputContainerRef = useRef<HTMLDivElement>(null)
  const [inputHeight, setInputHeight] = useState<number>(160)
  const [hasWelcomeExited, setHasWelcomeExited] = useState<boolean>(false)
  const [isHeightFrozen, setIsHeightFrozen] = useState<boolean>(false)
  const heightUnfreezeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [dockOffsetPx, setDockOffsetPx] = useState<number>(0)

  // Get agents data from starship
  const { data: starshipAgentsData = [] } = useStarshipAgents(starshipId || '')
  const { data: starshipConversationsData } = useStarshipConversations(starshipId || '', true)
  const conversationData = useStarshipUIStore(s => (currentConversationId ? s.conversations[currentConversationId] : undefined))
  const setConversationAgentStore = useStarshipUIStore(s => s.setConversationAgent)

  // Cache of participants by conversation id (agents involved)
  const [conversationParticipants, setConversationParticipants] = useState<Record<string, any[]>>({})

  // Prefetch participants for top 5 recent conversations when on starter state
  const prefetchRecentParticipants = useCallback(async () => {
    try {
      const list = starshipConversationsData?.conversations || []
      if (!Array.isArray(list) || list.length === 0) return
      const recent = list
        .slice()
        .sort((a: any, b: any) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
        .slice(0, 3)
      for (const conv of recent) {
        const cid = conv?.id
        if (!cid || conversationParticipants[cid]) continue
        try {
          const res = await api.get(`/api/v1/conversations/${cid}/messages`, { params: { limit: 1, page: 1 } })
          const agents = (res as any)?.data?.data?.agents || []
          if (Array.isArray(agents)) {
            setConversationParticipants(prev => ({ ...prev, [cid]: agents }))
          }
        } catch {}
      }
    } catch {}
  }, [starshipConversationsData, conversationParticipants])

  // Kick off prefetch after showMessagesArea is computed
  const shouldPrefetchParticipantsRef = useRef<boolean | null>(null)

  // Gate UI by presence of a conversation id; streaming details are handled in context consumers
  const showMessagesArea = Boolean(currentConversationId)

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
    // Initialize ref after showMessagesArea is available
    shouldPrefetchParticipantsRef.current = !showMessagesArea
    if (shouldPrefetchParticipantsRef.current) {
      void prefetchRecentParticipants()
    }
  }, [showMessagesArea, prefetchRecentParticipants])

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

  // Memoized agent change handler to prevent AgentSelector from remounting
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
      // DON'T reset userSelectedAgentRef - preserve user's choice
      // Allow messages to update naturally without remounting
    } else {
      lastConversationIdForResetRef.current = externalConversationId
    }

    setCurrentConversationId(prev => (prev === externalConversationId ? prev : externalConversationId))
  }, [externalConversationId])

  useEffect(() => {
    // Reset user selection flag when conversation actually changes
    if (currentConversationIdRef.current !== currentConversationId && currentConversationId) {
      userSelectedAgentRef.current = false
    }
    currentConversationIdRef.current = currentConversationId
  }, [currentConversationId])

  // Handle initial agent selection from URL parameter (supports both ID and slug)
  useEffect(() => {
    if (initialAgentId && starshipAgentsData.length > 0 && !selectedAgent) {
      // Try to find by slug first (preferred), then fall back to ID for backward compatibility
      const agent = starshipAgentsData.find(a => a.slug === initialAgentId) || starshipAgentsData.find(a => a.id === initialAgentId)
      if (agent) {
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

    // Wait for agents to load
    if (!Array.isArray(starshipAgentsData) || starshipAgentsData.length === 0) {
      return
    }

    // Set Gaia as default for initial landing page
    const gaiaAgent = starshipAgentsData.find(a => a.slug?.toLowerCase() === 'gaia' || a.name?.toLowerCase() === 'gaia')
    const fallback = gaiaAgent || starshipAgentsData[0]

    if (fallback && typeof fallback.id === 'string') {
      // Set flags BEFORE state update to prevent re-runs
      hasSetInitialDefaultAgentRef.current = true
      hasEverSetAnyAgentRef.current = true
      lastAutoSelectedAgentIdRef.current = fallback.id

      setSelectedAgentWithLogging(fallback)
    }
  }, [starshipAgentsData, setSelectedAgentWithLogging])

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

  // Navigate/select recent conversation from starter state
  const handleRecentConversationSelect = useCallback(
    (conversationId: string) => {
      try {
        if (starshipSlug) {
          router.push(`/ship/${starshipSlug}/conversations/${encodeURIComponent(conversationId)}`)
        }
      } catch {}
      setCurrentConversationId(conversationId)
      onConversationChange?.(conversationId)
    },
    [router, starshipSlug, onConversationChange]
  )

  // Removed manual agent builder toggle (route-based only)

  // Handle UI action payloads (dedup across SSE 'ui_action' and assistant message JSON)
  const handleUIPayload = useCallback((payload: any) => {
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
        case 'tool_call_detected': {
          const toolName = (payload as any).toolName
          const toolNameLc = typeof toolName === 'string' ? toolName.toLowerCase() : ''
          const toolCallId = (payload as any).toolCallId

          // Store tool call info for later completion handling
          if (toolCallId) {
            pendingToolCallsRef.current.set(toolCallId, { toolName, args: {} })
          }

          // Navigate to tool builder route for tool actions
          const toolBuilderSlugFragments = [
            'open-tool',
            'edit-tool',
            'add-tool-blueprint-node',
            'add-tool-blueprint-edge',
            'edit-tool-blueprint-node',
            'remove-tool-blueprint-node',
            'edit-tool-blueprint-edge',
            'remove-tool-blueprint-edge',
          ]
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
          const agentBuilderSlugFragments = ['agent-open', 'agent-edit', 'agent-assign-tool', 'agent-unassign-tool']
          if (agentBuilderSlugFragments.some(s => toolNameLc.includes(s))) {
            try {
              const agentSlug = (payload as any)?.slug || (payload as any)?.agentSlug || 'new'
              const slug = starshipSlug
              if (slug) {
                const convId = currentConversationIdRef.current || externalConversationId || null
                const q = convId ? `?conversationId=${encodeURIComponent(convId)}` : ''
                router.push(`/ship/${slug}/agent/${encodeURIComponent(agentSlug)}${q}`)
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
        const agentTools = ['agent-open', 'agent-edit', 'agent-assign-tool', 'agent-unassign-tool']
        if (agentTools.includes(toolName) && toolArgs?.slug) {
          // Fetch complete agent data by slug
          const agent = await agentAPI.getBySlug(toolArgs.slug)

          // In dedicated route, the page handles syncing; nothing to update here
        }

        // Tool tools - fetch and sync tool data
        const toolTools = [
          'open-tool',
          'edit-tool',
          'add-tool-blueprint-node',
          'add-tool-blueprint-edge',
          'edit-tool-blueprint-node',
          'remove-tool-blueprint-node',
          'edit-tool-blueprint-edge',
          'remove-tool-blueprint-edge',
        ]
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
            // Reset user selection flag so messages remain authoritative
            userSelectedAgentRef.current = false
          }
        }
      }
    }, [liveMessages, currentConversationId, starshipAgentsData, selectedAgent])

    // Focus input when streaming transitions from true -> false
    useEffect(() => {
      const was = prevStreamingRef.current
      if (was && !uiStreaming) {
        setTimeout(() => {
          messageInputRef.current?.focusInput?.()
        }, 50)
      }
      prevStreamingRef.current = Boolean(uiStreaming)
    }, [uiStreaming])

    // Back-compat UI actions parsed from assistant message JSON
    useEffect(() => {
      if (!currentConversationId || !liveMessages.length) return
      const lastMessage = liveMessages[liveMessages.length - 1]
      if (lastMessage?.role === 'assistant' && lastMessage?.content) {
        try {
          const payload = typeof lastMessage.content === 'string' ? JSON.parse(lastMessage.content) : lastMessage.content
          handleUIPayload(payload)
        } catch {}
      }
    }, [currentConversationId, liveMessages])

    // Proactive navigation on tool calls (contains-based slug matching)
    useEffect(() => {
      if (!currentConversationId || !liveMessages.length || !starshipSlug) return
      const recent = (liveMessages as any[]).slice(-10)
      for (let i = recent.length - 1; i >= 0; i--) {
        const msg = recent[i] as any
        if (msg?.role !== 'assistant' || !Array.isArray(msg?.toolCalls)) continue
        for (const tc of msg.toolCalls as any[]) {
          const id = tc?.id as string | undefined
          if (!id || navigatedToolCallIdsRef.current.has(id)) continue
          const rawName = tc?.function?.name as string | undefined
          const name = typeof rawName === 'string' ? rawName.toLowerCase() : ''
          if (!name) continue

          const toolFragments = [
            'open-tool',
            'edit-tool',
            'add-tool-blueprint-node',
            'add-tool-blueprint-edge',
            'edit-tool-blueprint-node',
            'remove-tool-blueprint-node',
            'edit-tool-blueprint-edge',
            'remove-tool-blueprint-edge',
          ]
          const agentFragments = ['agent-open', 'open-agent', 'agent-edit', 'edit-agent', 'agent-assign-tool', 'assign-agent-tool', 'agent-unassign-tool', 'unassign-agent-tool']

          let args: any = tc?.function?.arguments
          if (typeof args === 'string') {
            try {
              args = JSON.parse(args)
            } catch {}
          }

          if (toolFragments.some(f => name.includes(f)) || name.includes('tool-blueprint-')) {
            const toolSlug = args?.slug || args?.toolSlug || 'new'
            const convId = currentConversationIdRef.current || externalConversationId || null
            const q = convId ? `?conversationId=${encodeURIComponent(convId)}` : ''
            try {
              router.push(`/ship/${starshipSlug}/tool/${encodeURIComponent(toolSlug)}${q}`)
            } catch {}
            navigatedToolCallIdsRef.current.add(id)
            return
          }
          if (agentFragments.some(f => name.includes(f))) {
            const agentSlug = args?.slug || args?.agentSlug || 'new'
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
    }, [currentConversationId, externalConversationId, liveMessages, starshipSlug, router])

    // Tool completion follow-ups
    useEffect(() => {
      if (!liveMessages || liveMessages.length === 0) return
      const recentMessages = liveMessages.slice(-5)
      for (const msg of recentMessages) {
        if (msg.role === 'tool' && msg.toolCallId) {
          const pendingCall = pendingToolCallsRef.current.get(msg.toolCallId)
          if (pendingCall && !pendingCall.completed) {
            pendingCall.completed = true
            const assistantMsg = liveMessages.find((m: any) => m.role === 'assistant' && m.toolCalls?.some((tc: any) => tc.id === msg.toolCallId))
            if (assistantMsg) {
              const toolCall = assistantMsg.toolCalls?.find((tc: any) => tc.id === msg.toolCallId)
              if (toolCall?.function?.arguments) {
                pendingCall.args = toolCall.function.arguments
                handleToolComplete(pendingCall.toolName, pendingCall.args)
              }
            }
          }
        }
      }
    }, [liveMessages])

    // Consume clean ui_action channel
    useEffect(() => {
      if (!currentConversationId || !lastUIAction) return
      try {
        handleUIPayload(lastUIAction as any)
      } catch {}
    }, [currentConversationId, lastUIAction])

    return null
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
    <div className="relative flex flex-col h-screen transition-all duration-500 ease-in-out">
      {/* Content container */}
      <div className="relative z-[2] flex flex-col h-full">
        {/* Main Content Area - Conversation only; builders use dedicated routes */}
        {/* Key prop forces provider to remount and create fresh stream when conversation changes */}
        <ConversationStreamProvider key={currentConversationId || 'no-conversation'} conversationId={currentConversationId} starshipId={starshipId}>
          {/* Messages Area or Welcome Screen */}
          {showMessagesArea ? (
            <>
              <ConversationSummaryBar conversationId={currentConversationId} starshipId={starshipId} />
              <div className="relative flex-1 min-h-0">
                <ConversationMessageList conversationId={currentConversationId} starshipId={starshipId} bottomPaddingPx={inputHeight + 24} />
              </div>
              {/* Single place for stream-dependent side-effects to avoid duplicate SSE subscriptions */}
              <StreamSideEffects />
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center px-6 pb-32"></div>
          )}
        </ConversationStreamProvider>

        {/* Floating Input Container - Always bottom-anchored; we animate inner translateY only */}
        <div ref={inputContainerRef} className="absolute left-0 right-0 bottom-0 p-6 pointer-events-none z-30">
          <motion.div
            className="max-w-2xl mx-auto pointer-events-auto opacity-100 relative"
            data-message-input
            initial={false}
            animate={{ y: isInputDocked ? 0 : -dockOffsetPx }}
            transition={{ type: 'spring', stiffness: 210, damping: 24 }}
            style={{ willChange: 'transform' }}
          >
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
              minimal={isInputDocked && !isHeightFrozen}
              onFocus={() => {}}
              onBlur={() => {}}
              onToggleOverlay={handleToggleOverlay}
              showExpandableOverlay={false}
              isOverlayExpanded={false}
              budgetTokens={budgetTokens}
              onAgentChange={handleAgentChange}
              starshipSlug={starshipSlug}
            ></ConversationMessageInput>
            <AnimatePresence initial={false} mode="wait">
              {!showMessagesArea && (
                <motion.div key="welcome-copy" exit={{ opacity: 0, y: -12, transition: { duration: 0.2, ease: 'easeOut' } }} className="absolute inset-x-0 bottom-full mb-6 text-center opacity-100">
                  <h1 className="text-5xl font-light mb-4 bg-gradient-to-b from-foreground via-foreground to-foreground/70 bg-clip-text text-transparent">Let&apos;s Build</h1>
                  <p className="text-muted-foreground text-lg font-light">Choose an AI agent below to start collaborating on your project</p>
                </motion.div>
              )}
            </AnimatePresence>
            <AnimatePresence initial={false} mode="wait">
              {!showMessagesArea && Array.isArray(starshipConversationsData?.conversations) && starshipConversationsData!.conversations.length > 0 && (
                <motion.div key="recent-list" exit={{ opacity: 0, y: -8, transition: { duration: 0.18, ease: 'easeOut' } }} className="absolute inset-x-0 top-full mt-8 opacity-100">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 px-4">Recent conversations</div>
                  <div className="space-y-1">
                    {starshipConversationsData!.conversations
                      .slice()
                      .sort((a: any, b: any) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
                      .slice(0, 3)
                      .map((conv: any) => {
                        const title = conv?.title || `Conversation ${String(conv?.id || '').slice(0, 8)}`
                        const participants = conversationParticipants?.[conv?.id] || []
                        return (
                          <button
                            key={conv.id}
                            className="w-full text-left flex items-center gap-3 px-3 py-2 text-sm rounded-xl transition-all duration-200 border border-border/30 hover:border-primary/40 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 shadow-sm hover:shadow-md group"
                            onClick={() => handleRecentConversationSelect(conv.id)}
                          >
                            <div className="w-8 h-8 rounded-full bg-primary/15 group-hover:bg-primary/25 flex items-center justify-center shrink-0 transition-colors">
                              <Icon name="message-square" className="w-5 h-5 text-primary/80 group-hover:text-primary transition-colors" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="truncate text-foreground group-hover:text-foreground">{title}</p>
                              {participants.length > 0 && (
                                <div className="flex items-center gap-2 mt-1 min-w-0">
                                  <div className="flex items-center gap-1 shrink-0">
                                    {participants.slice(0, 3).map((agent: any) => (
                                      <Avatar key={agent?.id} className="h-4 w-4 ring-1 ring-border/40 rounded-[3px] overflow-hidden">
                                        <AgentAvatar seed={agent?.name || agent?.slug || undefined} size={16} />
                                      </Avatar>
                                    ))}
                                  </div>
                                  <span className="text-[12px] text-muted-foreground truncate">
                                    {participants
                                      .slice(0, 3)
                                      .map((a: any) => a?.name || a?.slug || 'Agent')
                                      .join(', ')}
                                  </span>
                                  {participants.length > 3 && <span className="text-[10px] text-muted-foreground pl-1 shrink-0">+{participants.length - 3}</span>}
                                </div>
                              )}
                            </div>
                          </button>
                        )
                      })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
