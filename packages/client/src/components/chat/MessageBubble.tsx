'use client'

import { Message } from '@/lib/api'
import { formatTime } from '@/lib/utils'
import { Bot, User, Loader2 } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { IntelligentContentRenderer } from '@/components/sibil/renderers/IntelligentContentRenderer'

interface MessageBubbleProps {
  message: Message
  streaming?: boolean
  typewriterContent?: string
}

export function MessageBubble({ message, streaming = false, typewriterContent }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const isSending = message.sending === true
  
  // Use typewriter content during streaming, otherwise use message content
  const displayContent = streaming && typewriterContent ? typewriterContent : message.content
  
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex max-w-[80%] ${isUser ? 'flex-row-reverse' : 'flex-row'} items-start`}>
        {/* Avatar */}
        <Avatar className="h-8 w-8 flex-shrink-0">
          <AvatarFallback className={`
            ${isUser 
              ? 'bg-primary text-primary-foreground' 
              : 'bg-muted text-muted-foreground'
            }
          `}>
            {isUser ? (
              <User className="h-4 w-4" />
            ) : (
              <Bot className="h-4 w-4" />
            )}
          </AvatarFallback>
        </Avatar>
        
        {/* Message Content */}
        <div className={`
          px-4 py-2 rounded-lg break-words relative
          ${isUser 
            ? 'bg-primary text-primary-foreground mr-2' 
            : 'bg-muted text-foreground ml-2'
          }
          ${isSending ? 'opacity-70' : ''}
        `}>
          {/* Use IntelligentContentRenderer for all content */}
          <div className="text-sm">
            <IntelligentContentRenderer
              content={displayContent}
              isStreaming={streaming}
            />
          </div>
          
          <div className={`
            text-xs mt-1 flex items-center justify-between
            ${isUser 
              ? 'text-primary-foreground/70' 
              : 'text-muted-foreground'
            }
          `}>
            <span>{formatTime(message.timestamp)}</span>
            {isSending && (
              <Loader2 className="h-3 w-3 animate-spin ml-2" />
            )}
          </div>
        </div>
      </div>
    </div>
  )
} 