'use client'

import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
import { useCreateConversation, useSendMessage } from '@/hooks/useConversations'
import { useStreamingConversation } from '@/hooks/useStreamingConversation'
import { cn } from '@/lib/utils'
import type { AgentModel } from '@starships/protocol'
import { Mic, Paperclip, Send, StopCircle } from 'lucide-react'
import { motion } from 'motion/react'
import { forwardRef, KeyboardEvent, useEffect, useImperativeHandle, useRef, useState } from 'react'

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
    const sendMessage = useSendMessage()
    const { sendMessageWithStreaming, isStreaming } = useStreamingConversation()

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

    const handleSubmit = async () => {
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
            source: 'agent',
            starshipId: starshipId,
          })
          currentConversationId = newConversation.id
          onConversationStart?.(currentConversationId!)
          console.log('Conversation created:', currentConversationId)
        }

        // Notify parent about message activity immediately (for UI state updates)
        onMessageSent?.()

        // Send message using streaming API hook
        await sendMessageWithStreaming.mutateAsync({
          conversationId: currentConversationId!,
          agentId: selectedAgent!.id,
          message: messageToSend,
        })

        // Clear input and reset UI
        setMessage('')
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
            source: 'agent',
            starshipId: starshipId,
          })
          currentConversationId = newConversation.id
          onConversationStart?.(currentConversationId!)
          console.log('Conversation created:', currentConversationId)
        }

        // Notify parent about message activity immediately (for UI state updates)
        onMessageSent?.()

        // Send message using streaming API hook
        await sendMessageWithStreaming.mutateAsync({
          conversationId: currentConversationId!,
          agentId: selectedAgent!.id,
          message: suggestionText,
        })
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
      <motion.div className="relative" initial={{ opacity: 0, y: minimal ? 10 : 20 }} animate={{ opacity: 1, y: 0 }}>
        {/* Input Container */}
        <div
          className={cn(
            'relative transition-all',
            minimal ? 'rounded-xl border border-border/30' : 'rounded-2xl border border-border/40',
            'bg-card/50 backdrop-blur-sm',
            minimal ? 'shadow-sm focus-within:ring-1 focus-within:ring-primary/15' : 'shadow-lg focus-within:ring-2 focus-within:ring-primary/20',
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
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full shrink-0 text-muted-foreground hover:text-foreground" disabled={disabled}>
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
                        canSend ? 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg hover:shadow-xl' : 'bg-muted text-muted-foreground cursor-not-allowed'
                      )}
                    >
                      {sending || isStreaming ? (
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

        {/* Agent Indicator - Only show in non-minimal mode */}
        {!minimal && selectedAgent && (
          <div className="absolute -top-3 left-4 px-2 py-1 bg-primary/10 text-primary text-xs rounded-full border border-primary/20">Chatting with {selectedAgent.name}</div>
        )}
      </motion.div>
    )
  }
)

ConversationMessageInput.displayName = 'ConversationMessageInput'
