'use client'

import Icon from '@/components/primitives/Icon'

import { ConversationMessageInput, ConversationMessageInputRef } from '@/components/conversation/ConversationMessageInput'
import { ConversationMessageList } from '@/components/conversation/ConversationMessageList'
import { useAuth } from '@/hooks/useAuth'
import { useStarshipAgents } from '@/hooks/useAgents'
import { useConversationAgents, useConversationStreamed, useStarshipConversations, CONVERSATION_QUERY_KEYS } from '@/hooks/useConversations'
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

interface ConversationInterfaceProps {
  starshipId: string
  conversationId?: string | null
  onConversationChange?: (conversationId: string | null) => void
  initialAgentId?: string
  starshipSlug?: string
}

export function ConversationInterface({ starshipId, conversationId: externalConversationId, onConversationChange, initialAgentId, starshipSlug }: ConversationInterfaceProps) {
  const { userId, isAuthenticated, isLoading } = useAuth()
  const router = useRouter()

  // Agent and UI state
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const lastAutoSelectedAgentIdRef = useRef<string | null>(null)
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

  // Track streaming state for current conversation to focus input on completion
  const { isStreaming: uiStreaming, messages: liveMessages = [], lastUIAction } = useConversationStreamed(currentConversationId, starshipId)
  const prevStreamingRef = useRef(false)
  const queryClient = useQueryClient()

  // Measure floating input height to reserve scroll space and prevent overlap with the floating composer
  const inputContainerRef = useRef<HTMLDivElement>(null)
  const [inputHeight, setInputHeight] = useState<number>(160)

  // Get agents data from starship and conversation
  const { data: starshipAgentsData = [] } = useStarshipAgents(starshipId || '')
  const { data: conversationAgents = [] } = useConversationAgents(currentConversationId)
  const { data: starshipConversationsData } = useStarshipConversations(starshipId || '', true)
  const conversationData = useStarshipUIStore(s => (currentConversationId ? s.conversations[currentConversationId] : undefined))

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

  // Derive message presence and UI gating from streamed query (not store)
  const hasMessages = Array.isArray(liveMessages) && liveMessages.length > 0
  const showMessagesArea = Boolean(currentConversationId) && (hasMessages || uiStreaming)

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
  }, [showMessagesArea, currentConversationId])

  // Memoized agent change handler to prevent AgentSelector from remounting
  const handleAgentChange = useCallback((agent: Agent | null) => {
    setSelectedAgent(agent)
  }, [])

  // Handle conversation start - receive actual database conversation ID
  const handleConversationStart = useCallback(
    (conversationId: string) => {
      setCurrentConversationId(conversationId)
      onConversationChange?.(conversationId)
    },
    [onConversationChange]
  )

  // Overlay disabled; keep a no-op for prop compatibility
  const handleToggleOverlay = useCallback(() => {}, [])

  // Reset conversation when external conversation ID changes
  useEffect(() => {
    if (externalConversationId === undefined) return
    setCurrentConversationId(prev => (prev === externalConversationId ? prev : externalConversationId))
  }, [externalConversationId])

  useEffect(() => {
    currentConversationIdRef.current = currentConversationId
  }, [currentConversationId])

  // Handle initial agent selection from URL parameter
  useEffect(() => {
    if (initialAgentId && starshipAgentsData.length > 0 && !selectedAgent) {
      const agent = starshipAgentsData.find(a => a.id === initialAgentId)
      if (agent) {
        setSelectedAgent(agent)
      }
    }
  }, [initialAgentId, starshipAgentsData, selectedAgent])

  // Restore selected agent from conversation data (with stable guard to avoid loops)
  useEffect(() => {
    // Priority 1: first linked conversation agent
    if (currentConversationId && Array.isArray(conversationAgents) && conversationAgents.length > 0) {
      const conversationAgent = conversationAgents[0]
      if (conversationAgent && typeof conversationAgent.id === 'string') {
        const currentId = selectedAgent?.id || null
        const targetId = conversationAgent.id
        if (currentId !== targetId && lastAutoSelectedAgentIdRef.current !== targetId) {
          lastAutoSelectedAgentIdRef.current = targetId
          setSelectedAgent(conversationAgent)
          return
        }
      }
    }

    // Priority 2: agent id from conversation store
    if (conversationData?.agentId && Array.isArray(starshipAgentsData) && starshipAgentsData.length > 0) {
      const storedAgent = starshipAgentsData.find(agent => agent.id === conversationData.agentId) || null
      if (storedAgent) {
        const currentId = selectedAgent?.id || null
        const targetId = storedAgent.id
        if (currentId !== targetId && lastAutoSelectedAgentIdRef.current !== targetId) {
          lastAutoSelectedAgentIdRef.current = targetId
          setSelectedAgent(storedAgent)
          return
        }
      }
    }

    // Priority 3: fallback to first starship agent when none selected
    if (!selectedAgent && Array.isArray(starshipAgentsData) && starshipAgentsData.length > 0) {
      const fallback = starshipAgentsData[0]
      if (fallback && typeof fallback.id === 'string') {
        const targetId = fallback.id
        if (lastAutoSelectedAgentIdRef.current !== targetId) {
          lastAutoSelectedAgentIdRef.current = targetId
          setSelectedAgent(fallback)
        }
      }
    }
  }, [currentConversationId, conversationAgents, conversationData?.agentId, starshipAgentsData])

  // Keep guard ref in sync with user-driven agent changes
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

  // Focus input when streaming transitions from true -> false
  useEffect(() => {
    const was = prevStreamingRef.current
    if (was && !uiStreaming) {
      setTimeout(() => {
        messageInputRef.current?.focusInput?.()
      }, 50)
    }
    prevStreamingRef.current = uiStreaming
  }, [uiStreaming])

  // Focus after first message or when conversation becomes ready
  useEffect(() => {
    if (hasMessages && currentConversationId) {
      const t = setTimeout(() => {
        messageInputRef.current?.focusInput?.()
      }, 100)
      return () => clearTimeout(t)
    }
  }, [hasMessages, currentConversationId])

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
          const toolCallId = (payload as any).toolCallId

          console.log('🎯 Tool call detected:', { toolName, toolCallId })

          // Store tool call info for later completion handling
          if (toolCallId) {
            pendingToolCallsRef.current.set(toolCallId, { toolName, args: {} })
          }

          // Navigate to tool builder route for tool actions
          const openToolBuilderSlugs = new Set([
            'tool-open',
            'tool-edit',
            'tool-add-blueprint-node',
            'tool-add-blueprint-edge',
            'tool-blueprint-edit-node',
            'tool-blueprint-remove-node',
            'tool-blueprint-edit-edge',
            'tool-blueprint-remove-edge',
          ])
          if (openToolBuilderSlugs.has(toolName) || toolName?.startsWith?.('tool-blueprint-')) {
            console.log('📂 Navigating to tool builder page for', toolName)
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
          const openAgentBuilderSlugs = new Set(['agent-open', 'agent-edit', 'agent-assign-tool', 'agent-unassign-tool'])
          if (openAgentBuilderSlugs.has(toolName)) {
            console.log('🌍 Navigating to agent builder page for', toolName)
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
          console.log('🔄 Fetching agent after tool completion:', toolArgs.slug)

          // Fetch complete agent data by slug
          const agent = await agentAPI.getBySlug(toolArgs.slug)

          // In dedicated route, the page handles syncing; nothing to update here
        }

        // Tool tools - fetch and sync tool data
        const toolTools = [
          'tool-open',
          'tool-edit',
          'tool-add-blueprint-node',
          'tool-add-blueprint-edge',
          'tool-blueprint-edit-node',
          'tool-blueprint-remove-node',
          'tool-blueprint-edit-edge',
          'tool-blueprint-remove-edge',
        ]
        if (toolTools.includes(toolName) && toolArgs?.slug) {
          console.log('🔄 Fetching tool after tool completion:', toolArgs.slug)

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

  // Detect special UI action responses from assistant messages (back-compat path)
  useEffect(() => {
    if (!currentConversationId || !liveMessages.length) return
    // Only handle back-compat UI actions during active streaming of the current turn
    if (!uiStreaming) return
    const hasStreamingAssistant = (liveMessages as any[]).some(m => m?.role === 'assistant' && (m as any)?.streaming === true)
    if (!hasStreamingAssistant) return

    const lastMessage = liveMessages[liveMessages.length - 1]
    if (lastMessage?.role === 'assistant' && lastMessage?.content) {
      try {
        const payload = typeof lastMessage.content === 'string' ? JSON.parse(lastMessage.content) : lastMessage.content
        handleUIPayload(payload)
      } catch {
        // Not JSON or doesn't have UI action, ignore
      }
    }
  }, [currentConversationId, liveMessages, handleUIPayload])

  // Proactively navigate when assistant tool calls are detected (without waiting for ui_action)
  useEffect(() => {
    if (!currentConversationId || !liveMessages.length || !starshipSlug) return
    // Only react during active streaming to avoid replays causing navigation
    if (!uiStreaming) return
    const hasStreamingAssistant = (liveMessages as any[]).some(m => m?.role === 'assistant' && (m as any)?.streaming === true)
    if (!hasStreamingAssistant) return

    // Scan the most recent assistant messages for new tool calls
    const recent = (liveMessages as any[]).slice(-10)
    for (let i = recent.length - 1; i >= 0; i--) {
      const msg = recent[i] as any
      if (msg?.role !== 'assistant' || !Array.isArray(msg?.toolCalls)) continue
      for (const tc of msg.toolCalls as any[]) {
        const id = tc?.id as string | undefined
        if (!id || navigatedToolCallIdsRef.current.has(id)) continue
        const name = tc?.function?.name as string | undefined
        if (!name) continue

        // Define which calls should trigger navigation
        const openToolBuilderSlugs = new Set([
          'tool-open',
          'tool-edit',
          'tool-add-blueprint-node',
          'tool-add-blueprint-edge',
          'tool-blueprint-edit-node',
          'tool-blueprint-remove-node',
          'tool-blueprint-edit-edge',
          'tool-blueprint-remove-edge',
        ])
        const openAgentBuilderSlugs = new Set(['agent-open', 'agent-edit', 'agent-assign-tool', 'agent-unassign-tool'])

        // Parse args if present to extract slug
        let args: any = tc?.function?.arguments
        if (typeof args === 'string') {
          try {
            args = JSON.parse(args)
          } catch {
            // keep as-is
          }
        }

        if (openToolBuilderSlugs.has(name) || name.startsWith?.('tool-blueprint-')) {
          const toolSlug = args?.slug || args?.toolSlug || 'new'
          const convId = currentConversationIdRef.current || externalConversationId || null
          const q = convId ? `?conversationId=${encodeURIComponent(convId)}` : ''
          try {
            router.push(`/ship/${starshipSlug}/tool/${encodeURIComponent(toolSlug)}${q}`)
          } catch {}
          navigatedToolCallIdsRef.current.add(id)
          return
        }

        if (openAgentBuilderSlugs.has(name)) {
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
  }, [currentConversationId, externalConversationId, liveMessages, starshipSlug, router, uiStreaming])

  // Detect tool completion from streaming messages
  useEffect(() => {
    if (!liveMessages || liveMessages.length === 0) return

    // Check last few messages for tool results
    const recentMessages = liveMessages.slice(-5)

    for (const msg of recentMessages) {
      if (msg.role === 'tool' && msg.toolCallId) {
        const pendingCall = pendingToolCallsRef.current.get(msg.toolCallId)

        if (pendingCall && !pendingCall.completed) {
          // Mark as completed
          pendingCall.completed = true

          // Extract tool arguments from the conversation history
          // Look for assistant message with this toolCallId
          const assistantMsg = liveMessages.find(m => m.role === 'assistant' && m.toolCalls?.some(tc => tc.id === msg.toolCallId))

          if (assistantMsg) {
            const toolCall = assistantMsg.toolCalls?.find(tc => tc.id === msg.toolCallId)
            if (toolCall?.function?.arguments) {
              pendingCall.args = toolCall.function.arguments

              // Trigger fetch after tool completes
              handleToolComplete(pendingCall.toolName, pendingCall.args)
            }
          }
        }
      }
    }
  }, [liveMessages, handleToolComplete])

  // Consume SSE 'ui_action' events directly (clean channel)
  useEffect(() => {
    if (!currentConversationId || !lastUIAction) return
    // Only react to UI actions while actively streaming/responding in this conversation
    if (!uiStreaming) return
    const hasStreamingAssistant = (liveMessages as any[]).some(m => m?.role === 'assistant' && (m as any)?.streaming === true)
    if (!hasStreamingAssistant) return
    try {
      handleUIPayload(lastUIAction as any)
    } catch {
      // ignore
    }
  }, [currentConversationId, lastUIAction, handleUIPayload, uiStreaming, liveMessages])

  // Removed overlay UI effects

  // Removed streaming into in-page tool builder (handled in dedicated route)
  useEffect(() => {
    return
  }, [currentConversationId, liveMessages])

  // Removed streaming into in-page agent builder (handled in dedicated route)
  useEffect(() => {
    return
  }, [currentConversationId, liveMessages])

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
        <>
          {/* Messages Area or Welcome Screen */}
          {showMessagesArea ? (
            <>
              <ConversationContextBar conversationId={currentConversationId} {...(budgetTokens !== undefined && { budgetTokens })} />
              <div className="flex-1 min-h-0">
                <ConversationMessageList conversationId={currentConversationId} starshipId={starshipId} bottomPaddingPx={inputHeight + 24} />
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center px-6 pb-32"></div>
          )}
        </>

        {/* Floating Input Container - Always visible, position changes based on state */}
        <div
          ref={inputContainerRef}
          className="absolute left-0 right-0 p-6 pointer-events-none transition-all duration-300 ease-in-out z-30"
          style={showMessagesArea ? { bottom: '0px' } : { top: '50%', transform: 'translateY(-50%)', marginTop: '-64px' }}
        >
          <div className="max-w-2xl mx-auto pointer-events-auto opacity-100" data-message-input>
            {!showMessagesArea && (
              <div className="text-center mb-6 opacity-100">
                <h1 className="text-5xl font-light mb-4 bg-gradient-to-b from-foreground via-foreground to-foreground/70 bg-clip-text text-transparent">Let&apos;s Build</h1>
                <p className="text-muted-foreground text-lg font-light">Choose an AI agent below to start collaborating on your project</p>
              </div>
            )}
            <ConversationMessageInput
              ref={messageInputRef}
              selectedAgent={selectedAgent}
              starshipId={starshipId}
              conversationId={currentConversationId}
              onConversationStart={handleConversationStart}
              onToggleToolForm={handleToggleToolBuilder}
              isToolFormOpen={false}
              disabled={false}
              minimal={showMessagesArea}
              onFocus={() => {}}
              onBlur={() => {}}
              onToggleOverlay={handleToggleOverlay}
              showExpandableOverlay={false}
              isOverlayExpanded={false}
              budgetTokens={budgetTokens}
              onAgentChange={handleAgentChange}
            ></ConversationMessageInput>

            {!showMessagesArea && Array.isArray(starshipConversationsData?.conversations) && starshipConversationsData!.conversations.length > 0 && (
              <div className="mt-8 opacity-100">
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
                                      <AgentAvatar seed={agent?.name || agent?.slug || 'Agent'} size={16} />
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
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
