'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Bot, Users, Settings, Sparkles } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useSocketConnection } from '@/hooks/useSocketConnection'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { UnifiedMessageInput } from './UnifiedMessageInput'
import { UnifiedMessageList } from './UnifiedMessageList'
import { ChatModeSelector } from './ChatModeSelector'
import { AgentSelector } from './AgentSelector'
import { ProviderSelector } from './ProviderSelector'
import type { Agent } from '@/lib/api'
import type { Message } from '@/lib/agent-socket-api'
import type { SibilMessage } from '@/lib/sibil-api'
import type { ChatSourceType } from '@starships/protocol'

export type ChatMode = 'agent' | 'sibil'

interface UnifiedChatInterfaceProps {
  defaultMode?: ChatMode
  starshipId?: string
}

export function UnifiedChatInterface({ 
  defaultMode = 'sibil',
  starshipId 
}: UnifiedChatInterfaceProps) {
  const { userId, isAuthenticated, isLoading } = useAuth()
  const { isConnected, connectionStatus } = useSocketConnection()
  
  // Chat mode state
  const [chatMode, setChatMode] = useState<ChatMode>(defaultMode)
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [provider, setProvider] = useState<'openai' | 'anthropic'>('openai')
  const [model, setModel] = useState<string>('gpt-4')
  
  // UI state
  const [showSettings, setShowSettings] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)
  const [refreshMessages, setRefreshMessages] = useState(0)
  
  const sessionId = useRef<string | null>(null)

  // Initialize session
  useEffect(() => {
    if (userId && isAuthenticated) {
      setIsInitialized(true)
    }
  }, [userId, isAuthenticated])

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex flex-col h-screen items-center justify-center bg-gradient-to-br from-background via-background/95 to-muted/10">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-4"
        >
          <div className="w-16 h-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
            <Sparkles className="w-8 h-8 text-primary animate-pulse" />
          </div>
          <p className="text-muted-foreground">Initializing chat session...</p>
        </motion.div>
      </div>
    )
  }

  // Show auth required state
  if (!isAuthenticated) {
    return (
      <div className="flex flex-col h-screen items-center justify-center bg-gradient-to-br from-background via-background/95 to-muted/10">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-4"
        >
          <div className="w-16 h-16 mx-auto bg-muted/20 rounded-full flex items-center justify-center">
            <Users className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground">Please sign in to start chatting</p>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-background via-background/95 to-muted/10">
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex-shrink-0 border-b border-border/40 bg-card/50 backdrop-blur-sm"
      >
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Logo and Title */}
            <div className="flex items-center gap-4">
              <motion.div 
                className="relative"
                whileHover={{ scale: 1.05 }}
              >
                <div className="absolute inset-0 bg-primary/10 blur-sm rounded-xl" />
                <div className="relative bg-gradient-to-br from-primary/15 to-primary/5 p-3 rounded-xl border border-primary/20">
                  {chatMode === 'agent' ? (
                    <Users className="h-6 w-6 text-primary" />
                  ) : (
                    <Bot className="h-6 w-6 text-primary" />
                  )}
                </div>
              </motion.div>
              
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
                  Chat
                </h1>
                <p className="text-sm text-muted-foreground">
                  {chatMode === 'agent' ? 'Agent Assistant' : 'AI Assistant'}
                </p>
              </div>
            </div>

            {/* Connection Status & Settings */}
            <div className="flex items-center gap-3">
              {/* Connection Status */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className={`w-2 h-2 rounded-full ${
                  connectionStatus === 'connected' ? 'bg-green-500' :
                  connectionStatus === 'reconnecting' ? 'bg-yellow-500 animate-pulse' :
                  'bg-red-500'
                }`} />
                {connectionStatus === 'connected' ? 'Connected' :
                 connectionStatus === 'reconnecting' ? 'Reconnecting...' :
                 'Disconnected'}
              </div>

              {/* Settings Toggle */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowSettings(!showSettings)}
                className="h-9 w-9"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Mode Selector and Controls */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="mt-4 flex items-center justify-between"
          >
            <ChatModeSelector
              mode={chatMode}
              onModeChange={setChatMode}
              disabled={!isConnected}
            />

            <AnimatePresence>
              {showSettings && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="flex items-center gap-3"
                >
                  {chatMode === 'agent' ? (
                    <AgentSelector
                      selectedAgent={selectedAgent}
                      onAgentChange={setSelectedAgent}
                      starshipId={starshipId}
                    />
                  ) : (
                    <ProviderSelector
                      provider={provider}
                      model={model}
                      onProviderChange={setProvider}
                      onModelChange={setModel}
                    />
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </motion.div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Welcome Message */}
        <AnimatePresence>
          {!sessionId.current && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex-shrink-0 max-w-4xl mx-auto px-6 py-8"
            >
              <div className="text-center space-y-4">
                <motion.h2 
                  className="text-3xl font-bold text-foreground"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  {chatMode === 'agent' ? 'Meet Your Agent' : 'Meet AI Mode'}
                </motion.h2>
                <motion.p 
                  className="text-muted-foreground text-lg max-w-2xl mx-auto"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                >
                  {chatMode === 'agent' 
                    ? 'Connect with specialized AI agents to boost your productivity and creativity'
                    : 'Ask detailed questions for better responses'
                  }
                </motion.p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Messages */}
        <div className="flex-1 min-h-0">
          <UnifiedMessageList
            mode={chatMode}
            sessionId={sessionId.current}
            starshipId={starshipId}
            key={`${chatMode}-${sessionId.current}-${refreshMessages}`}
          />
        </div>

        {/* Input Area */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex-shrink-0 max-w-4xl mx-auto w-full px-6 py-6"
        >
          <UnifiedMessageInput
            mode={chatMode}
            selectedAgent={selectedAgent}
            provider={provider}
            model={model}
            starshipId={starshipId}
            onSessionStart={(id: string) => {
              sessionId.current = id
              setRefreshMessages(prev => prev + 1) // Refresh message list
            }}
            onMessageSent={(message: Message | SibilMessage) => {
              // Trigger refresh to show user message immediately
              setRefreshMessages(prev => prev + 1)
            }}
            onMessageReceived={(message: Message | SibilMessage) => {
              // Trigger refresh to show assistant message
              setRefreshMessages(prev => prev + 1)
            }}
            disabled={!isConnected || (chatMode === 'agent' && !selectedAgent)}
          />
          
          {/* Quick Suggestions */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-4 flex flex-wrap gap-2 justify-center"
          >
            {(chatMode === 'agent' ? AGENT_SUGGESTIONS : SIBIL_SUGGESTIONS).map((suggestion, index) => (
              <motion.button
                key={suggestion}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1 * index }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="px-3 py-1.5 text-sm text-muted-foreground bg-muted/50 hover:bg-muted/80 rounded-full border border-border/40 transition-colors"
                onClick={() => {
                  // TODO: Implement suggestion click
                }}
              >
                {suggestion}
              </motion.button>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </div>
  )
}

// Quick suggestion examples
const AGENT_SUGGESTIONS = [
  "Help me plan my project",
  "Analyze this data",
  "Write code for me",
  "Research this topic"
]

const SIBIL_SUGGESTIONS = [
  "Help me pack for my trip to Jaipur next week",
  "Compare leather sofas vs fabric sofas", 
  "How to identify if the pashmina shawl I am buying is genuine?",
  "What are the best productivity apps?"
]