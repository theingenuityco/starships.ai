'use client'

import { AgentSelector } from '@/components/conversation/AgentSelector'
import { ConversationMessageInput, ConversationMessageInputRef } from '@/components/conversation/ConversationMessageInput'
import { ConversationMessageList } from '@/components/conversation/ConversationMessageList'
import { useAuth } from '@/hooks/useAuth'
import { useStarshipAgents } from '@/hooks/useAgents'
import { useConversationAgents } from '@/hooks/useConversations'
import { useStarshipUIStore } from '@/store/starship-ui-store'
import type { Agent } from '@/lib/api'
import { Sparkles, Users } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

interface ConversationInterfaceProps {
  starshipId?: string
  conversationId?: string | null
  onConversationChange?: (conversationId: string | null) => void
}

export function ConversationInterface({ starshipId, conversationId: externalConversationId, onConversationChange }: ConversationInterfaceProps) {
  const { userId, isAuthenticated, isLoading } = useAuth()

  // Agent and UI state
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)

  // UI state (conversation id only; message presence is derived from store)
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)

  // Ref for direct communication with message input
  const messageInputRef = useRef<ConversationMessageInputRef>(null)

  // Track streaming state for current conversation to focus input on completion
  const uiStreaming = useStarshipUIStore(s => (currentConversationId ? s.conversationsStreaming[currentConversationId]?.isStreaming === true : false))
  const prevStreamingRef = useRef(false)

  // Measure floating input height to reserve scroll space and prevent overlap with the floating composer
  const inputContainerRef = useRef<HTMLDivElement>(null)
  const [inputHeight, setInputHeight] = useState<number>(160)

  // Get agents data from starship and conversation
  const { data: starshipAgentsData = [] } = useStarshipAgents(starshipId || '')
  const { data: conversationAgents = [] } = useConversationAgents(currentConversationId)
  const conversationData = useStarshipUIStore(s => (currentConversationId ? s.conversations[currentConversationId] : undefined))

  // Derive message presence and UI gating from central store to avoid local state being blocked by streaming
  const uiConvo = useStarshipUIStore(s => (currentConversationId ? s.conversations[currentConversationId] : undefined))
  const hasMessages = !!uiConvo && (Array.isArray(uiConvo?.messages) ? uiConvo!.messages.length > 0 : false)
  const showMessagesArea = Boolean(currentConversationId) && (hasMessages || uiConvo?.isResponding)

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

  // Message presence is derived from store; no local handler

  // Streaming is now handled internally by useConversation hook
  // No need for external event handler management

  // Handle suggestion click
  const handleSuggestionClick = useCallback((suggestion: string) => {
    // Use ref to directly call the input component method
    if (messageInputRef.current?.handleSuggestionSubmit) {
      messageInputRef.current.handleSuggestionSubmit(suggestion)
    }
  }, [])

  // Reset conversation when external conversation ID changes (only when the value actually changes)
  useEffect(() => {
    if (externalConversationId === undefined) return
    setCurrentConversationId(prev => (prev === externalConversationId ? prev : externalConversationId))
  }, [externalConversationId])

  // Restore selected agent from conversation data (fixes refresh issue)
  useEffect(() => {
    if (!currentConversationId) return

    // First priority: Use conversation agents from API (persisted agent relationships)
    if (conversationAgents.length > 0) {
      const conversationAgent = conversationAgents[0] // Use first agent from conversation
      if (conversationAgent && (!selectedAgent || selectedAgent.id !== conversationAgent.id)) {
        setSelectedAgent(conversationAgent)
        return
      }
    }

    // Second priority: Try to restore from UI store conversation data
    if (conversationData?.agentId && starshipAgentsData.length > 0) {
      const storedAgent = starshipAgentsData.find(agent => agent.id === conversationData.agentId)
      if (storedAgent && (!selectedAgent || selectedAgent.id !== storedAgent.id)) {
        setSelectedAgent(storedAgent)
        return
      }
    }

    // Fallback: auto-select first agent if none selected (for new conversations)
    if (!selectedAgent && starshipAgentsData.length > 0) {
      setSelectedAgent(starshipAgentsData[0])
    }
  }, [currentConversationId, conversationAgents, conversationData?.agentId, starshipAgentsData, selectedAgent])

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

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex flex-col h-screen items-center justify-center">
        <div className="text-center space-y-4 opacity-100">
          <div className="w-16 h-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
            <Sparkles className="w-8 h-8 text-primary animate-pulse" />
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
            <Users className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground">Please sign in to start a conversation</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex flex-col h-screen bg-background">
      {/* Messages Area or Welcome Screen */}
      {showMessagesArea ? (
        <div className="flex-1 min-h-0">
          <ConversationMessageList conversationId={currentConversationId} starshipId={starshipId} bottomPaddingPx={inputHeight + 24} />
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center px-6 pb-32">
          {/* Welcome Section */}
          <div className="text-center mb-8 max-w-2xl opacity-100">
            <h1 className="text-5xl font-light mb-4 bg-gradient-to-b from-foreground via-foreground to-foreground/70 bg-clip-text text-transparent">Meet Your AI Agents</h1>
            <p className="text-muted-foreground text-lg font-light">Connect with specialized agents for focused assistance</p>
          </div>

          {/* Spacer for floating input */}
          <div className="h-32 mb-8"></div>

          {/* Suggestions */}
          <div className="space-y-3 max-w-2xl w-full opacity-100">
            {AGENT_SUGGESTIONS.map((suggestion, index) => (
              <button
                key={suggestion}
                className="w-full text-left flex items-center gap-3 p-4 text-sm text-foreground/90 bg-muted/20 hover:bg-muted/30 rounded-xl border border-border/20 transition-all duration-200 backdrop-blur-sm group opacity-100"
                onClick={() => handleSuggestionClick(suggestion)}
              >
                <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                  <Sparkles className="w-3 h-3 text-primary/70 group-hover:text-primary transition-colors" />
                </div>
                <span className="flex-1">{suggestion}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Floating Input - Position changes based on state */}
      <div
        ref={inputContainerRef}
        className="absolute left-0 right-0 p-6 pointer-events-none transition-all duration-300 ease-in-out"
        style={{
          bottom: showMessagesArea ? '0px' : 'calc(50% + 2rem)',
        }}
      >
        <div className="max-w-2xl mx-auto pointer-events-auto opacity-100">
          <ConversationMessageInput
            ref={messageInputRef}
            selectedAgent={selectedAgent}
            starshipId={starshipId}
            conversationId={currentConversationId}
            onConversationStart={handleConversationStart}
            disabled={!selectedAgent}
            minimal={showMessagesArea}
          >
            {/* Footer Content - Agent Selector */}
            <AgentSelector selectedAgent={selectedAgent} onAgentChange={handleAgentChange} starshipId={starshipId} compact={true} />
          </ConversationMessageInput>
        </div>
      </div>
    </div>
  )
}

// Suggestion examples
const AGENT_SUGGESTIONS = ['Help me plan a project timeline with milestones', 'Analyze this data set and find patterns', 'Write code for a responsive navigation component']
