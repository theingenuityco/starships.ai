'use client'

import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
import { useCreateConversation, useConversation } from '@/hooks/useConversations'
import { cn } from '@/lib/utils'
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
}

export const ConversationMessageInput = forwardRef<ConversationMessageInputRef, ConversationMessageInputProps>(
  ({ selectedAgent, starshipId, conversationId, onConversationStart, onMessageSent, disabled = false, minimal = false, children }, ref) => {
    const { userId } = useAuth()
    const [message, setMessage] = useState('')
    const [sending, setSending] = useState(false)
    const [isRecording, setIsRecording] = useState(false)
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const createConversation = useCreateConversation()

    // Use unified conversation hook (convert undefined to null for the hook)
    const { sendMessage: sendMessageFn, isSending, isStreaming } = useConversation(conversationId ?? null)

    // Auto-focus on textarea when component mounts and when agent is selected
    useEffect(() => {
      if (textareaRef.current && selectedAgent && !disabled) {
        // Small delay to ensure the component is fully rendered
        const timer = setTimeout(() => {
          textareaRef.current?.focus()
        }, 100)
        return () => clearTimeout(timer)
      }
    }, [selectedAgent, disabled])

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
          console.log('Creating new conversation for agent chat...')
          const newConversation = await createConversation.mutateAsync({
            title: `Chat with ${selectedAgent.name}`,
            starshipId: starshipId,
            agentId: selectedAgent.id,
          })
          currentConversationId = newConversation.id
          onConversationStart?.(currentConversationId!)
          console.log('Conversation created:', currentConversationId)
        }

        // Clear input and reset UI immediately for better UX
        setMessage('')
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto'
        }

        // Notify parent about message activity immediately (for UI state updates)
        onMessageSent?.()

        // Send message with streaming (this handles everything: saves message + gets agent response)
        await sendMessageFn({
          conversationId: currentConversationId!,
          agentId: selectedAgent!.id,
          content: messageToSend,
          role: 'user',
          starshipId: starshipId!,
          messageType: 'user_input',
          stream: true,
        })
      } catch (error) {
        console.error('Failed to send message:', error)
        // Restore message on error
        setMessage(messageToSend)
      } finally {
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
            console.log('Creating new conversation for agent chat suggestion...')
            const newConversation = await createConversation.mutateAsync({
              title: `Chat with ${selectedAgent.name}`,
              starshipId: starshipId,
              agentId: selectedAgent.id,
            })
            currentConversationId = newConversation.id
            onConversationStart?.(currentConversationId!)
            console.log('Conversation created:', currentConversationId)
          }

          // Notify parent about message activity immediately (for UI state updates)
          onMessageSent?.()

          // Send message with streaming (this handles everything: saves message + gets agent response)
          await sendMessageFn({
            conversationId: currentConversationId!,
            agentId: selectedAgent!.id,
            content: suggestionText,
            role: 'user',
            starshipId: starshipId!,
            messageType: 'user_input',
            stream: true,
          })
        } catch (error) {
          console.error('Failed to send suggestion:', error)
        } finally {
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
      if (isStreaming) return 'AI is thinking...'
      return selectedAgent ? `Ask ${selectedAgent.name}...` : 'Select an agent to start chatting'
    }

    const canSend = message.trim() && !disabled && !sending && !isStreaming && selectedAgent

    // Expose methods to parent component via ref
    useImperativeHandle(
      ref,
      () => ({
        handleSuggestionSubmit,
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
              ? 'frosted-glass-light rounded-xl shadow-frosted-xl focus-within:ring-1 focus-within:ring-primary/15'
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
                disabled={disabled || sending || isStreaming}
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
                {sending || isStreaming ? <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Send className="h-4 w-4" />}
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
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full shrink-0 text-muted-foreground hover:text-foreground" disabled={disabled || isStreaming}>
                    <Paperclip className="h-4 w-4" />
                  </Button>

                  {/* Voice Recording */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleVoiceToggle}
                    className={cn('h-8 w-8 rounded-full shrink-0 transition-colors', isRecording ? 'text-red-500 hover:text-red-600 bg-red-500/10' : 'text-muted-foreground hover:text-foreground')}
                    disabled={disabled || isStreaming}
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
                    {sending || isStreaming ? <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Agent Indicator - Only show in non-minimal mode */}
        {!minimal && selectedAgent && (
          <div className="absolute -top-3 left-4 px-2 py-1 frosted-glass-light text-primary text-xs rounded-full">
            {isStreaming ? `${selectedAgent.name} is thinking...` : `Chatting with ${selectedAgent.name}`}
          </div>
        )}
      </div>
    )
  }
)

ConversationMessageInput.displayName = 'ConversationMessageInput'
