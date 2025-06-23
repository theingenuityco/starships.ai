'use client'

import { Message } from '@/lib/api'
import { formatTime } from '@/lib/utils'
import { Bot, User } from 'lucide-react'

interface MessageBubbleProps {
  message: Message
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex max-w-[80%] ${isUser ? 'flex-row-reverse' : 'flex-row'} items-start space-x-2`}>
        {/* Avatar */}
        <div className={`
          w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
          ${isUser 
            ? 'bg-primary text-primary-foreground' 
            : 'bg-muted text-muted-foreground'
          }
        `}>
          {isUser ? (
            <User className="w-4 h-4" />
          ) : (
            <Bot className="w-4 h-4" />
          )}
        </div>
        
        {/* Message Content */}
        <div className={`
          px-4 py-2 rounded-lg break-words
          ${isUser 
            ? 'bg-primary text-primary-foreground ml-2' 
            : 'bg-muted text-foreground mr-2'
          }
        `}>
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          <div className={`
            text-xs mt-1
            ${isUser 
              ? 'text-primary-foreground/70' 
              : 'text-muted-foreground'
            }
          `}>
            {formatTime(message.timestamp)}
          </div>
        </div>
      </div>
    </div>
  )
} 