'use client'

import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
import { useCreateConversation, useConversationStreamed } from '@/hooks/useConversations'
import { useConversationUsageTotals } from '@/hooks/useUsage'
import { useModelContextLength } from '@/hooks/useOpenRouterModels'
import { cn } from '@/lib/utils'
import { useStarshipUIStore } from '@/store/starship-ui-store'
import type { AgentModel } from '@starships/protocol'
import { Mic, Paperclip, Send, StopCircle } from 'lucide-react'
import { forwardRef, KeyboardEvent, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'

// Simplified message interface for UI callbacks
interface MessageNotification {
  id: string
  content: string
  role: 'user' | 'assistant' | 'system'
  timestamp: string
  conversationId: string
  agentId?: string
}

interface ConversationMessageInputProps {
  selectedAgent?: AgentModel | null
  starshipId?: string
  conversationId?: string | null
  onConversationStart?: (conversationId: string) => void
  onMessageSent?: () => void // Simplified callback for UI state updates
  disabled?: boolean
  minimal?: boolean
  children?: React.ReactNode // For footer content
}

export interface ConversationMessageInputRef {
  handleSuggestionSubmit: (suggestion: string) => Promise<void>
  focusInput: () => void
}

export const ConversationMessageInput = forwardRef<ConversationMessageInputRef, ConversationMessageInputProps>(
  ({ selectedAgent, starshipId, conversationId, onConversationStart, onMessageSent, disabled = false, minimal = false, children }, ref) => {
    const { userId } = useAuth()
    const [message, setMessage] = useState('')
    const [sending, setSending] = useState(false)
    const [isRecording, setIsRecording] = useState(false)
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const createConversation = useCreateConversation()

    // Use streamedQuery-based conversation hook
    const { sendMessage: sendMessageFn, isSending, isResponding } = useConversationStreamed(conversationId ?? null)
    const isStreamingEffective = isResponding

    // Usage and context control
    const { data: totalsData } = useConversationUsageTotals(conversationId ?? null)
    const { contextLength: agentContextLength } = useModelContextLength(selectedAgent?.model || null)
    const tokensUsed = Number(totalsData?.total_tokens ?? 0)
    const contextLimit = Number(agentContextLength ?? 0)
    const hardLimitActive = !!conversationId && contextLimit > 0
    // Track previous streaming state to detect transition to complete and refocus input
    const prevIsStreamingRef = useRef(isStreamingEffective)

    // Consolidated focus management - handles all focus scenarios
    useEffect(() => {
      const shouldFocus = () => {
        // Don't focus if disabled, streaming, or sending
        if (disabled || isStreamingEffective || sending) return false

        // Always focus on component mount or navigation changes
        return true
      }

      // Handle streaming completion focus
      const wasStreaming = prevIsStreamingRef.current
      const streamingCompleted = wasStreaming && !isStreamingEffective

      if (textareaRef.current && shouldFocus()) {
        const delay = streamingCompleted ? 50 : 100 // Faster focus after streaming completes
        const timer = setTimeout(() => {
          textareaRef.current?.focus()
        }, delay)

        // Update streaming ref
        prevIsStreamingRef.current = isStreamingEffective

        return () => clearTimeout(timer)
      }

      // Always update the streaming ref
      prevIsStreamingRef.current = isStreamingEffective
    }, [disabled, isStreamingEffective, sending, selectedAgent, conversationId])

    // Sync local 'sending' with streaming completion to avoid stuck disabled/loading state
    useEffect(() => {
      if (!isStreamingEffective && sending) {
        setSending(false)
      }
    }, [isStreamingEffective, sending])

    const handleSubmit = useCallback(async () => {
      const messageToSend = message.trim()
      if (!messageToSend || sending || disabled) return

      // Validation for agent
      if (!selectedAgent) {
        console.error('No agent selected')
        return
      }

      if (!userId) {
        console.error('User not authenticated')
        return
      }

      try {
        setSending(true)
        // Create conversation if one doesn't exist
        let currentConversationId = conversationId
        if (!currentConversationId) {
          const newConversation = await createConversation.mutateAsync({
            title: `Chat with ${selectedAgent.name}`,
            starshipId: starshipId,
            agentId: selectedAgent.id,
          })
          currentConversationId = newConversation.id
          onConversationStart?.(currentConversationId!)
        }

        // Set agent information in store
        const { setConversationAgent } = useStarshipUIStore.getState()
        setConversationAgent(currentConversationId!, selectedAgent.id, selectedAgent.name)

        // Clear input and reset UI immediately for better UX
        setMessage('')
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto'
        }

        /* optimistic append skipped (server-SSE will add user message) */

        // Streaming UI is driven by TanStack Query status

        // Notify parent about message activity immediately (for UI state updates)
        onMessageSent?.()

        // Fire-and-forget streaming; streaming lifecycle manages completion/cleanup
        void sendMessageFn({
          conversationId: currentConversationId!,
          agentId: selectedAgent!.id,
          content: messageToSend,
          role: 'user',
          starshipId: starshipId!,
          messageType: 'user_input',
        })
          .catch(error => {
            console.error('Failed to send message:', error)
            // Restore message on error
            setMessage(messageToSend)
          })
          .finally(() => {
            setSending(false)
          })

        // Exit early to avoid hitting catch/finally paths
        return
      } catch (error) {
        console.error('Failed to send message:', error)
        // Restore message and ensure local sending cleared on immediate failure
        setMessage(messageToSend)
        setSending(false)
      }
    }, [message, sending, disabled, selectedAgent, userId, conversationId, createConversation, onConversationStart, onMessageSent, sendMessageFn, starshipId])

    // Handle suggestion clicks
    const handleSuggestionSubmit = useCallback(
      async (suggestionText: string) => {
        if (!suggestionText || sending || disabled) return

        // Validation for agent
        if (!selectedAgent) {
          console.error('No agent selected')
          return
        }

        if (!userId) {
          console.error('User not authenticated')
          return
        }

        try {
          setSending(true)
          // Create conversation if one doesn't exist
          let currentConversationId = conversationId
          if (!currentConversationId) {
            const newConversation = await createConversation.mutateAsync({
              title: `Chat with ${selectedAgent.name}`,
              starshipId: starshipId,
              agentId: selectedAgent.id,
            })
            currentConversationId = newConversation.id
            onConversationStart?.(currentConversationId!)
          }

          // Set agent information in store
          const { setConversationAgent } = useStarshipUIStore.getState()
          setConversationAgent(currentConversationId!, selectedAgent.id, selectedAgent.name)

          /* optimistic append skipped (server-SSE will add user message) */

          // Streaming UI is driven by TanStack Query status

          // Notify parent about message activity immediately (for UI state updates)
          onMessageSent?.()

          // Fire-and-forget streaming; streaming lifecycle manages completion/cleanup
          void sendMessageFn({
            conversationId: currentConversationId!,
            agentId: selectedAgent!.id,
            content: suggestionText,
            role: 'user',
            starshipId: starshipId!,
            messageType: 'user_input',
          })
            .catch(error => {
              console.error('Failed to send suggestion:', error)
            })
            .finally(() => {
              setSending(false)
            })

          return
        } catch (error) {
          console.error('Failed to send suggestion:', error)
          setSending(false)
        }
      },
      [sending, disabled, selectedAgent, userId, conversationId, createConversation, onConversationStart, onMessageSent, sendMessageFn, starshipId]
    )

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
      if (isStreamingEffective) return selectedAgent ? `${selectedAgent.name} is responding...` : 'AI is responding...'
      if (sending) return selectedAgent ? `${selectedAgent.name} is thinking...` : 'Thinking...'
      if (hardLimitActive && tokensUsed >= contextLimit) return selectedAgent ? `Context limit reached for ${selectedAgent.name}` : 'Context limit reached'
      return selectedAgent ? `Ask ${selectedAgent.name}...` : 'Select an agent to start chatting'
    }

    const canSend = message.trim() && !disabled && !sending && !isStreamingEffective && selectedAgent

    // Expose methods to parent component via ref
    useImperativeHandle(
      ref,
      () => ({
        handleSuggestionSubmit,
        focusInput: () => {
          textareaRef.current?.focus()
        },
      }),
      [handleSuggestionSubmit]
    )

    return (
      <div className="relative opacity-100">
        {/* Input Container */}
        <div
          className={cn(
            'relative transition-all',
            minimal
              ? 'frosted-glass-card rounded-xl shadow-frosted-xl focus-within:ring-1 focus-within:ring-primary/15'
              : 'frosted-glass-card rounded-2xl shadow-frosted-xl focus-within:ring-2 focus-within:ring-primary/20',
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
                disabled={disabled || sending || isStreamingEffective}
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

            {/* Minimal mode: Send button inline */}
            {minimal && (
              <Button
                onClick={handleSubmit}
                disabled={!canSend}
                size="icon"
                className={cn(
                  'h-8 w-8 rounded-full shrink-0 transition-all ml-2',
                  canSend ? 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg hover:shadow-xl' : 'bg-muted text-muted-foreground cursor-not-allowed'
                )}
              >
                {sending || isStreamingEffective ? <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            )}
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
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full shrink-0 text-muted-foreground hover:text-foreground" disabled={disabled || isStreamingEffective}>
                    <Paperclip className="h-4 w-4" />
                  </Button>

                  {/* Voice Recording */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleVoiceToggle}
                    className={cn('h-8 w-8 rounded-full shrink-0 transition-colors', isRecording ? 'text-red-500 hover:text-red-600 bg-red-500/10' : 'text-muted-foreground hover:text-foreground')}
                    disabled={disabled || isStreamingEffective}
                  >
                    {isRecording ? <StopCircle className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </Button>

                  {/* Send Button */}
                  <Button
                    onClick={handleSubmit}
                    disabled={!canSend}
                    size="icon"
                    className={cn(
                      'h-8 w-8 rounded-full shrink-0 transition-all',
                      canSend ? 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg hover:shadow-xl' : 'bg-muted text-muted-foreground cursor-not-allowed'
                    )}
                  >
                    {sending || isStreamingEffective ? <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Agent Indicator - Only show in non-minimal mode */}
        {!minimal && selectedAgent && (
          <div className="absolute -top-3 left-4 px-2 py-1 frosted-glass-light text-primary text-xs rounded-full">
            {isStreamingEffective ? `${selectedAgent.name} is responding...` : sending ? `${selectedAgent.name} is thinking...` : `Chatting with ${selectedAgent.name}`}
          </div>
        )}
      </div>
    )
  }
)

ConversationMessageInput.displayName = 'ConversationMessageInput'
