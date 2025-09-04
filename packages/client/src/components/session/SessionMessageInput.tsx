'use client'

import { useState, useRef, KeyboardEvent } from 'react'
import { Send, Paperclip, Mic, StopCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'
import { agentSocketAPI } from '@/lib/agent-socket-api'
import { generateId } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { useCreateSession } from '@/hooks/useSessions'
import type { Agent } from '@/lib/api'
import type { ChatMode } from './ChatModeSelector'
import type { Message } from '@/lib/agent-socket-api'

interface SessionMessageInputProps {
  mode: ChatMode
  selectedAgent?: Agent | null
  provider?: 'openai' | 'anthropic'
  model?: string
  starshipId?: string
  sessionId?: string | null
  onSessionStart?: (sessionId: string) => void
  onMessageSent?: (message: Message) => void
  onMessageReceived?: (message: Message) => void
  disabled?: boolean
  minimal?: boolean
  children?: React.ReactNode // For footer content
}

export function SessionMessageInput({
  mode,
  selectedAgent,
  provider = 'openai',
  model = 'gpt-4',
  starshipId,
  sessionId,
  onSessionStart,
  onMessageSent,
  onMessageReceived,
  disabled = false,
  minimal = false,
  children,
}: SessionMessageInputProps) {
  const { userId } = useAuth()
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const currentStreamRef = useRef<{ abort: () => void } | null>(null)
  const createSession = useCreateSession()

  const handleSubmit = async () => {
    const messageToSend = message.trim()
    if (!messageToSend || sending || disabled) return

    // Validation for agent mode
    if (mode === 'agent' && !selectedAgent) {
      console.error('No agent selected for agent mode')
      return
    }

    if (!userId) {
      console.error('User not authenticated')
      return
    }

    try {
      setSending(true)

      // Create session if one doesn't exist
      let currentSessionId = sessionId
      if (!currentSessionId) {
        console.log('Creating new session for agent chat...')
        const newSession = await createSession.mutateAsync({
          source: 'agent',
          agentId: selectedAgent!.id,
          starshipId: starshipId,
        })
        currentSessionId = newSession.id
        onSessionStart?.(currentSessionId)
        console.log('Session created:', currentSessionId)
      }

      // Create user message
      const userMessage: Message = {
        id: generateId(),
        content: messageToSend,
        role: 'user',
        timestamp: new Date().toISOString(),
        sessionId: currentSessionId,
        agentId: selectedAgent!.id,
      }

      // Emit user message
      onMessageSent?.(userMessage)

      // Send to agent API with valid sessionId
      currentStreamRef.current = agentSocketAPI.sendMessageStream(
        selectedAgent!.id,
        { sessionId: currentSessionId, message: messageToSend },
        {
          onChunk: (chunk, accumulatedContent) => {
            // Handle streaming updates if needed
          },
          onComplete: assistantMessage => {
            // Use the session ID from server response
            if (assistantMessage.sessionId) {
              onSessionStart?.(assistantMessage.sessionId)
            }
            onMessageReceived?.(assistantMessage)
            currentStreamRef.current = null
          },
          onError: error => {
            console.error('Agent chat error:', error)
            currentStreamRef.current = null
          },
        }
      )

      setMessage('')

      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    } catch (error) {
      console.error('Failed to send message:', error)
    } finally {
      setSending(false)
    }
  }

  // Handle suggestion clicks
  const handleSuggestionSubmit = async (suggestionText: string) => {
    if (!suggestionText || sending || disabled) return

    // Validation for agent mode
    if (mode === 'agent' && !selectedAgent) {
      console.error('No agent selected for agent mode')
      return
    }

    if (!userId) {
      console.error('User not authenticated')
      return
    }

    try {
      setSending(true)

      // Create session if one doesn't exist
      let currentSessionId = sessionId
      if (!currentSessionId) {
        console.log('Creating new session for agent chat suggestion...')
        const newSession = await createSession.mutateAsync({
          source: 'agent',
          agentId: selectedAgent!.id,
          starshipId: starshipId,
        })
        currentSessionId = newSession.id
        onSessionStart?.(currentSessionId)
        console.log('Session created:', currentSessionId)
      }

      // Create user message
      const userMessage: Message = {
        id: generateId(),
        content: suggestionText,
        role: 'user',
        timestamp: new Date().toISOString(),
        sessionId: currentSessionId,
        agentId: selectedAgent!.id,
      }

      // Emit user message
      onMessageSent?.(userMessage)

      // Send to agent API with valid sessionId
      currentStreamRef.current = agentSocketAPI.sendMessageStream(
        selectedAgent!.id,
        { sessionId: currentSessionId, message: suggestionText },
        {
          onChunk: (chunk, accumulatedContent) => {
            // Handle streaming updates if needed
          },
          onComplete: assistantMessage => {
            // Use the session ID from server response
            if (assistantMessage.sessionId) {
              onSessionStart?.(assistantMessage.sessionId)
            }
            onMessageReceived?.(assistantMessage)
            currentStreamRef.current = null
          },
          onError: error => {
            console.error('Agent chat error:', error)
            currentStreamRef.current = null
          },
        }
      )
    } catch (error) {
      console.error('Failed to send suggestion:', error)
    } finally {
      setSending(false)
    }
  }

  const handleKeyPress = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value)

    // Auto-resize textarea
    const textarea = e.target
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, minimal ? 80 : 120)}px`
  }

  const handleVoiceToggle = () => {
    setIsRecording(!isRecording)
    // TODO: Implement voice recording
  }

  const getPlaceholder = () => {
    if (mode === 'agent') {
      return selectedAgent ? `Ask ${selectedAgent.name}...` : 'Select an agent to start chatting'
    }
    return minimal ? 'Ask anything...' : 'Ask anything...'
  }

  const canSend = message.trim() && !disabled && !sending && mode === 'agent' && selectedAgent

  // Expose handleSuggestionSubmit for parent component
  const inputRef = useRef({ handleSuggestionSubmit })
  if (typeof window !== 'undefined') {
    ;(window as any).sessionMessageInputRef = inputRef
  }

  return (
    <motion.div
      className="relative"
      initial={{ opacity: 0, y: minimal ? 10 : 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* Input Container */}
      <div
        className={cn(
          'relative transition-all',
          minimal ? 'rounded-xl border border-border/30' : 'rounded-2xl border border-border/40',
          'bg-card/50 backdrop-blur-sm',
          minimal
            ? 'shadow-sm focus-within:ring-1 focus-within:ring-primary/15'
            : 'shadow-lg focus-within:ring-2 focus-within:ring-primary/20',
          'focus-within:border-primary/40',
          disabled && 'opacity-50'
        )}
      >
        {/* Main Input Section - Only Text Input */}
        <div className={cn('flex items-end', minimal ? 'p-3' : 'p-4')}>
          {/* Text Input */}
          <div className="flex-1 min-w-0">
            <textarea
              ref={textareaRef}
              value={message}
              onChange={handleTextareaChange}
              onKeyPress={handleKeyPress}
              placeholder={getPlaceholder()}
              disabled={disabled || sending}
              className={cn(
                'w-full bg-transparent resize-none',
                minimal ? 'min-h-[20px] max-h-[80px]' : 'min-h-[24px] max-h-[120px]',
                'text-foreground placeholder-muted-foreground',
                'border-0 outline-none focus:ring-0',
                'scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent',
                minimal && 'text-sm'
              )}
              rows={1}
            />
          </div>
        </div>

        {/* Footer Section - Selectors and Action Buttons */}
        {!minimal && (
          <div className="border-t border-border/20 bg-muted/10 px-4 py-3">
            <div className="flex items-center justify-between">
              {/* Left Side - Selectors */}
              <div className="flex items-center gap-3">{children}</div>

              {/* Right Side - Action Buttons */}
              <div className="flex items-center gap-2">
                {/* File Attachment */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full shrink-0 text-muted-foreground hover:text-foreground"
                  disabled={disabled}
                >
                  <Paperclip className="h-4 w-4" />
                </Button>

                {/* Voice Recording */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleVoiceToggle}
                  className={cn(
                    'h-8 w-8 rounded-full shrink-0 transition-colors',
                    isRecording
                      ? 'text-red-500 hover:text-red-600 bg-red-500/10'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  disabled={disabled}
                >
                  {isRecording ? <StopCircle className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </Button>

                {/* Send Button */}
                <motion.div
                  animate={{
                    scale: canSend ? 1 : 0.8,
                    opacity: canSend ? 1 : 0.5,
                  }}
                >
                  <Button
                    onClick={handleSubmit}
                    disabled={!canSend}
                    size="icon"
                    className={cn(
                      'h-8 w-8 rounded-full shrink-0 transition-all',
                      canSend
                        ? 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg hover:shadow-xl'
                        : 'bg-muted text-muted-foreground cursor-not-allowed'
                    )}
                  >
                    {sending ? (
                      <motion.div
                        className="h-4 w-4 border-2 border-current border-t-transparent rounded-full"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </motion.div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mode Indicator - Only show in non-minimal mode */}
      {!minimal && mode === 'agent' && selectedAgent && (
        <div className="absolute -top-3 left-4 px-2 py-1 bg-primary/10 text-primary text-xs rounded-full border border-primary/20">
          Chatting with {selectedAgent.name}
        </div>
      )}
    </motion.div>
  )
}
