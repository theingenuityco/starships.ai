'use client'

import { SibilMessage } from '@/lib/sibil-api'
import { formatTime } from '@/lib/utils'
import { Bot, User, Loader2 } from 'lucide-react'
import { IntelligentContentRenderer } from './renderers/IntelligentContentRenderer'

interface SibilMessageBubbleProps {
  message: SibilMessage
}

export function SibilMessageBubble({ message }: SibilMessageBubbleProps) {
  const isUser = message.role === 'user'
  const isSending = message.sending === true
  const isStreaming = message.streaming === true

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`flex max-w-[85%] ${isUser ? 'flex-row-reverse mr-20' : 'flex-row ml-2'} items-start gap-2`}>
        {/* Simple Avatar - matching standard chat */}
        <div 
          className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 
            ${isUser ? 'bg-blue-600' : 'bg-emerald-600'}`}
        >
          {isUser ? (
            <User className="h-4 w-4 text-white" />
          ) : (
            <Bot className="h-4 w-4 text-white" />
          )}
        </div>
        
        {/* Clean Message Content - matching standard chat */}
        <div
          className={`
            px-4 py-3 break-words
            ${isUser
              ? 'bg-blue-600 text-white rounded-t-2xl rounded-bl-2xl rounded-br-sm'
              : 'bg-zinc-800 text-white rounded-t-2xl rounded-br-2xl rounded-bl-sm'
            }
            ${isSending || isStreaming ? 'opacity-70' : ''}
            min-w-[200px] max-w-full
            transition-all duration-100 ease-in-out
          `}
        >
          {/* Provider info - simplified */}
          {!isUser && message.provider && (
            <div className="text-sm text-white/70 mb-1">
              Sibil AI
              {message.model && ` • ${message.model}`}
            </div>
          )}
          
          {/* Content Rendering */}
          <div className="text-sm overflow-hidden">
            <div className="w-full overflow-hidden">
              <IntelligentContentRenderer
                content={message.content}
                isStreaming={isStreaming}
              />
            </div>
          </div>
          
          {/* Timestamp and Status */}
          <div className="text-xs mt-2 text-white/70 flex justify-between items-center">
            <span>{formatTime(message.timestamp)}</span>
            {(isSending || isStreaming) && (
              <Loader2 className="h-3 w-3 ml-2 animate-spin" />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}