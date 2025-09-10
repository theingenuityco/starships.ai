'use client'

import { AgentSelector } from '@/components/conversation/AgentSelector'
import { ConversationMessageInput, ConversationMessageInputRef } from '@/components/conversation/ConversationMessageInput'
import { ConversationMessageList } from '@/components/conversation/ConversationMessageList'
import { useAuth } from '@/hooks/useAuth'
import { useConversation } from '@/hooks/useConversations'
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

  // UI state
  const [hasMessages, setHasMessages] = useState(false)
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)
  const [streamingEventHandler, setStreamingEventHandler] = useState<((event: any) => void) | null>(null)

  // Ref for direct communication with message input
  const messageInputRef = useRef<ConversationMessageInputRef>(null)

  // Conversation data
  const { data: conversationData } = useConversation(currentConversationId || '', !!currentConversationId)

  // Memoized agent change handler to prevent AgentSelector from remounting
  const handleAgentChange = useCallback((agent: Agent | null) => {
    setSelectedAgent(agent)
  }, [])

  // Handle conversation start - receive actual database conversation ID
  const handleConversationStart = useCallback(
    (conversationId: string) => {
      console.log('[ConversationInterface] Conversation started with ID:', conversationId)
      setCurrentConversationId(conversationId)
      onConversationChange?.(conversationId)
    },
    [onConversationChange]
  )

  // Handle first message to trigger layout transition
  const handleFirstMessage = useCallback(() => {
    setHasMessages(true)
  }, [])

  // Handle streaming event handler from message list
  const handleStreamingEvent = useCallback((handler: (event: any) => void) => {
    setStreamingEventHandler(() => handler)
  }, [])

  // Handle suggestion click
  const handleSuggestionClick = useCallback((suggestion: string) => {
    // Use ref to directly call the input component method
    if (messageInputRef.current?.handleSuggestionSubmit) {
      messageInputRef.current.handleSuggestionSubmit(suggestion)
    }
  }, [])

  // Reset conversation when external conversation ID changes
  useEffect(() => {
    if (userId && isAuthenticated) {
      if (externalConversationId !== undefined) {
        setCurrentConversationId(externalConversationId)
        setHasMessages(!!externalConversationId)
      } else {
        // Only reset if we don't have an external conversation ID
        setCurrentConversationId(null)
        setHasMessages(false)
      }
    }
  }, [userId, isAuthenticated, externalConversationId])

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
      {hasMessages && currentConversationId ? (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <ConversationMessageList conversationId={currentConversationId} starshipId={starshipId} enableAccessibility={true} onStreamingEvent={handleStreamingEvent} />
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
        className="absolute left-0 right-0 p-6 pointer-events-none transition-all duration-300 ease-in-out"
        style={{
          bottom: hasMessages && currentConversationId ? '0px' : 'calc(50% + 2rem)',
        }}
      >
        <div className="max-w-2xl mx-auto pointer-events-auto opacity-100">
          <ConversationMessageInput
            ref={messageInputRef}
            selectedAgent={selectedAgent}
            starshipId={starshipId}
            conversationId={currentConversationId}
            onConversationStart={handleConversationStart}
            onMessageSent={handleFirstMessage}
            disabled={!selectedAgent}
            minimal={hasMessages && !!currentConversationId}
            streamingEventHandler={streamingEventHandler}
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
