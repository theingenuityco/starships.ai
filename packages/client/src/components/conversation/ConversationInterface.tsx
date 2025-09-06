'use client'

import { AgentSelector } from '@/components/conversation/AgentSelector'
import { ConversationMessageInput } from '@/components/conversation/ConversationMessageInput'
import { ConversationMessageList } from '@/components/conversation/ConversationMessageList'
import { useAuth } from '@/hooks/useAuth'
import type { Agent } from '@/lib/api'
import type { Message } from '@/types/chat'
import { Sparkles, Users } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'

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
  const [refreshMessages, setRefreshMessages] = useState(0)
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)

  // Reset conversation when agent/starship changes - let server manage conversation IDs
  useEffect(() => {
    if (userId && isAuthenticated) {
      if (externalConversationId !== undefined) {
        // Use external conversation ID when provided
        setCurrentConversationId(externalConversationId)
        setHasMessages(!!externalConversationId)
        setRefreshMessages(prev => prev + 1)
      } else if (selectedAgent) {
        // Reset conversation for agent - server will provide actual conversation ID
        setCurrentConversationId(null)
        setHasMessages(false)
        setRefreshMessages(prev => prev + 1)
      } else {
        // No conversation without selected agent
        setCurrentConversationId(null)
        setHasMessages(false)
      }
    }
  }, [userId, isAuthenticated, selectedAgent, starshipId, externalConversationId])

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex flex-col h-screen items-center justify-center">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
            <Sparkles className="w-8 h-8 text-primary animate-pulse" />
          </div>
          <p className="text-muted-foreground">Initializing conversation...</p>
        </motion.div>
      </div>
    )
  }

  // Show auth required state
  if (!isAuthenticated) {
    return (
      <div className="flex flex-col h-screen items-center justify-center">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto bg-muted/20 rounded-full flex items-center justify-center">
            <Users className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground">Please sign in to start a conversation</p>
        </motion.div>
      </div>
    )
  }

  // Handle conversation start - receive actual database conversation ID
  const handleConversationStart = (conversationId: string) => {
    console.log('[ConversationInterface] Conversation started with ID:', conversationId)
    setCurrentConversationId(conversationId)
    onConversationChange?.(conversationId)
  }

  // Handle first message to trigger layout transition
  const handleFirstMessage = (_message: Message) => {
    setHasMessages(true)
    setRefreshMessages(prev => prev + 1)
  }

  // Handle suggestion click
  const handleSuggestionClick = (suggestion: string) => {
    if (typeof window !== 'undefined' && (window as any).conversationMessageInputRef) {
      const inputRef = (window as any).conversationMessageInputRef
      if (inputRef.current?.handleSuggestionSubmit) {
        inputRef.current.handleSuggestionSubmit(suggestion)
      }
    }
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Messages Area - Only shown when there are messages */}
      <AnimatePresence>
        {hasMessages && currentConversationId && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} transition={{ duration: 0.4, ease: 'easeInOut' }} className="flex-1 min-h-0 overflow-hidden">
            <ConversationMessageList conversationId={currentConversationId} starshipId={starshipId} key={`${currentConversationId}-${refreshMessages}`} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className="relative flex-1 flex flex-col">
        {/* Centered Content Container */}
        <motion.div
          className="flex-1 flex flex-col"
          animate={{
            justifyContent: hasMessages ? 'flex-end' : 'center',
            alignItems: 'center',
          }}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
        >
          <motion.div
            className="w-full max-w-2xl mx-auto px-6"
            animate={{
              paddingBottom: hasMessages ? '2rem' : '0',
            }}
            transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
          >
            {/* Welcome Section - Only shown when no messages */}
            <AnimatePresence>
              {!hasMessages && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20, transition: { duration: 0.3 } }} className="text-center mb-8">
                  <motion.h1
                    className="text-5xl font-light mb-4 bg-gradient-to-b from-foreground via-foreground to-foreground/70 bg-clip-text text-transparent"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                  >
                    Meet Your AI Agents
                  </motion.h1>
                  <motion.p className="text-muted-foreground text-lg font-light" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                    Connect with specialized agents for focused assistance
                  </motion.p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Main Input Section with Footer Selectors */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: hasMessages ? 0 : 0.35,
                duration: 0.5,
                ease: [0.4, 0, 0.2, 1],
              }}
              className="relative"
            >
              <ConversationMessageInput
                selectedAgent={selectedAgent}
                starshipId={starshipId}
                conversationId={currentConversationId}
                onConversationStart={handleConversationStart}
                onMessageSent={handleFirstMessage}
                onMessageReceived={(message: Message) => {
                  setRefreshMessages(prev => prev + 1)
                }}
                disabled={!selectedAgent}
                minimal={hasMessages}
              >
                {/* Footer Content - Agent Selector */}
                <AgentSelector selectedAgent={selectedAgent} onAgentChange={setSelectedAgent} starshipId={starshipId} compact={true} />
              </ConversationMessageInput>
            </motion.div>

            {/* Suggestions - Only shown when no messages */}
            <AnimatePresence>
              {!hasMessages && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10, transition: { duration: 0.2 } }}
                  transition={{ delay: 0.45, duration: 0.4 }}
                  className="mt-8 space-y-3"
                >
                  {AGENT_SUGGESTIONS.map((suggestion, index) => (
                    <motion.button
                      key={suggestion}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{
                        delay: 0.5 + index * 0.1,
                        duration: 0.3,
                      }}
                      whileHover={{
                        scale: 1.01,
                        backgroundColor: 'hsl(var(--muted) / 0.6)',
                      }}
                      whileTap={{ scale: 0.99 }}
                      className="w-full text-left flex items-center gap-3 p-4 text-sm text-foreground/90 bg-muted/20 hover:bg-muted/30 rounded-xl border border-border/20 transition-all duration-200 backdrop-blur-sm group"
                      onClick={() => handleSuggestionClick(suggestion)}
                    >
                      <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                        <Sparkles className="w-3 h-3 text-primary/70 group-hover:text-primary transition-colors" />
                      </div>
                      <span className="flex-1">{suggestion}</span>
                    </motion.button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      </div>

      {/* Connection Status Indicator - Currently disabled */}
      <AnimatePresence>{/* Connection status functionality not yet implemented */}</AnimatePresence>
    </div>
  )
}

// Suggestion examples
const AGENT_SUGGESTIONS = ['Help me plan a project timeline with milestones', 'Analyze this data set and find patterns', 'Write code for a responsive navigation component']
