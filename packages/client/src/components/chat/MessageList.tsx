'use client'

import { useEffect, useRef } from 'react'
import { Message } from '@/lib/api'
import { MessageBubble } from './MessageBubble'
import { Loader2, AlertCircle } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { CHAT_TEXT, LOADING_TEXT } from '@/constants/text'

interface MessageListProps {
  messages: Message[]
  loading: boolean
  error: string | null
}

export function MessageList({ messages, loading, error }: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new messages arrive
  // TODO: Add cleanup to prevent memory leaks
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (error) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="text-center">
          <div className="w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-3">
            <AlertCircle className="w-6 h-6 text-destructive" />
          </div>
          <p className="text-sm text-destructive">{error}</p>
        </div>
      </div>
    )
  }

  if (loading && messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="text-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">{LOADING_TEXT.MESSAGES}</p>
        </div>
      </div>
    )
  }

  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="text-center">
          <div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-muted-foreground"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
          </div>
          <h3 className="font-medium mb-1">{CHAT_TEXT.START_CONVERSATION_TITLE}</h3>
          <p className="text-sm text-muted-foreground">
            {CHAT_TEXT.START_CONVERSATION_MESSAGE}
          </p>
        </div>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>
    </ScrollArea>
  )
} 