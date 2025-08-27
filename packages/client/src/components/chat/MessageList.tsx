'use client'

import { useEffect, useRef } from 'react'
import type { Message } from '@/lib/agent-socket-api'
import { MessageBubble } from './MessageBubble'
import { Loader2, AlertCircle } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { CHAT_TEXT, LOADING_TEXT } from '@/constants/text'

interface MessageListProps<T = Message> {
  messages: T[]
  loading: boolean
  error: string | null
  MessageComponent?: React.ComponentType<{ message: T }>
}

export function MessageList<T = Message>({
  messages,
  loading,
  error,
  MessageComponent = MessageBubble as React.ComponentType<{ message: T }>
}: MessageListProps<T>) {
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new messages arrive
  // Use a more stable scrolling approach to prevent bouncing
  useEffect(() => {
    // Use requestAnimationFrame to ensure DOM has updated before scrolling
    const scrollToBottom = () => {
      if (messagesEndRef.current) {
        // Use instant scroll for code blocks to prevent bouncing
        const hasCodeBlock = messages.some(msg =>
          typeof (msg as Message).content === 'string' &&
          (msg as Message).content.includes('```')
        );
        
        messagesEndRef.current.scrollIntoView({
          behavior: hasCodeBlock ? 'auto' : 'smooth',
          block: 'end'
        });
      }
    };
    
    requestAnimationFrame(scrollToBottom);
  }, [messages]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="text-center">
          <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-3">
            <AlertCircle className="w-6 h-6 text-red-500" />
          </div>
          <p className="text-sm text-red-500">{error}</p>
        </div>
      </div>
    )
  }

  if (loading && messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="text-center">
          <div className="w-12 h-12 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-3">
            <Loader2 className="w-6 h-6 text-blue-500" />
          </div>
          <p className="text-sm text-zinc-400">{LOADING_TEXT.MESSAGES}</p>
        </div>
      </div>
    )
  }

  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="text-center">
          <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-zinc-400"
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
          <h3 className="font-medium text-white mb-1">{CHAT_TEXT.START_CONVERSATION_TITLE}</h3>
          <p className="text-sm text-zinc-400">
            {CHAT_TEXT.START_CONVERSATION_MESSAGE}
          </p>
        </div>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4">
        {messages.map((message) => {
          // Check if MessageComponent is MessageBubble and pass streaming prop
          const isMessageBubble = MessageComponent === MessageBubble;
          const streamingProp = isMessageBubble ? { streaming: (message as Message).streaming } : {};
          
          return (
            <MessageComponent
              key={(message as Message).id}
              message={message}
              {...(streamingProp as Record<string, unknown>)}
            />
          );
        })}
        <div ref={messagesEndRef} />
      </div>
    </ScrollArea>
  )
}