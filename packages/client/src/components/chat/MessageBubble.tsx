'use client'

import type { Message } from '@/lib/agent-socket-api'
import { formatTime } from '@/lib/utils'
import { Bot, User } from 'lucide-react'
import { IntelligentContentRenderer } from '@/components/sibil/renderers/IntelligentContentRenderer'

interface MessageBubbleProps {
  message: Message
  streaming?: boolean
}

export function MessageBubble({ message, streaming = false }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const isSending = message.sending === true
  
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`flex max-w-[85%] ${isUser ? 'flex-row-reverse mr-4' : 'flex-row'} items-start gap-2`}>
        {/* Simple Avatar */}
        <div 
          className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 
            ${isUser ? 'bg-blue-600' : 'bg-zinc-700'}`}
        >
          {isUser ? (
            <User className="h-4 w-4 text-white" />
          ) : (
            <Bot className="h-4 w-4 text-white" />
          )}
        </div>
        
        {/* Clean Message Content */}
        <div
          className={`
            px-4 py-3 break-words
            ${isUser 
              ? 'bg-blue-600 text-white rounded-t-2xl rounded-bl-2xl rounded-br-sm' 
              : 'bg-zinc-800 text-white rounded-t-2xl rounded-br-2xl rounded-bl-sm'
            }
            ${isSending ? 'opacity-70' : ''}
          `}
        >
          {/* Content Rendering */}
          <div className="text-sm">
            <IntelligentContentRenderer
              content={message.content}
              isStreaming={streaming}
            />
          </div>
          
          {/* Timestamp and Status */}
          <div className="text-xs mt-2 text-white/70 flex justify-between">
            {!isSending && (<span>{formatTime(message.timestamp)}</span>)}
            {isSending && (
              <span>Sending</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}