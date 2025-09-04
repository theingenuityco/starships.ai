'use client'

import { useState, useRef, KeyboardEvent } from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CHAT_TEXT } from '@/constants/text'

interface MessageInputProps {
  onSendMessage: (message: string) => Promise<void>
  disabled?: boolean
}

export function MessageInput({ onSendMessage, disabled = false }: MessageInputProps) {
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSubmit = async () => {
    const trimmedMessage = message.trim()
    if (!trimmedMessage || sending || disabled) return

    try {
      setSending(true)
      await onSendMessage(trimmedMessage)
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
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`
  }

  return (
    <div className="flex items-end space-x-2">
      <div className="flex-1">
        <textarea
          ref={textareaRef}
          value={message}
          onChange={handleTextareaChange}
          onKeyPress={handleKeyPress}
          placeholder={CHAT_TEXT.MESSAGE_PLACEHOLDER}
          disabled={disabled || sending}
          className="
            w-full min-h-[44px] max-h-[120px] p-3 rounded-lg
            bg-zinc-800 text-white placeholder-zinc-500 border-none
            resize-none focus:outline-none focus:ring-1 focus:ring-blue-500
            disabled:opacity-50 disabled:cursor-not-allowed
          "
          rows={1}
        />
      </div>

      <Button
        onClick={handleSubmit}
        disabled={!message.trim() || disabled || sending}
        size="icon"
        className="h-11 w-11 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
        title={sending ? CHAT_TEXT.SENDING_MESSAGE : 'Send message'}
      >
        {sending ? <div className="h-4 w-4 bg-white/50 rounded-full"></div> : <Send className="h-4 w-4" />}
      </Button>
    </div>
  )
}
