'use client'

import { motion } from 'motion/react'
import { SibilMessage } from '@/lib/sibil-api'
import { formatTime } from '@/lib/utils'
import { Bot, User, Loader2, Zap, Sparkles } from 'lucide-react'
import { IntelligentContentRenderer } from './renderers/IntelligentContentRenderer'
import { messageVariants, avatarVariants, streamingVariants } from '@/lib/animations'

interface SibilMessageBubbleProps {
  message: SibilMessage
}

const PROVIDER_INFO = {
  openai: {
    name: 'OpenAI',
    color: 'var(--sibil-openai)',
    icon: <Zap className="h-3 w-3" />
  },
  anthropic: {
    name: 'Anthropic',
    color: 'var(--sibil-anthropic)',
    icon: <Sparkles className="h-3 w-3" />
  }
}

export function SibilMessageBubble({ message }: SibilMessageBubbleProps) {
  const isUser = message.role === 'user'
  const isSending = message.sending === true
  const isStreaming = message.streaming === true
  const providerInfo = message.provider ? PROVIDER_INFO[message.provider] : null

  return (
    <motion.div 
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
      variants={messageVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      layout
    >
      <div className={`flex max-w-[80%] ${isUser ? 'flex-row-reverse' : 'flex-row'} items-start gap-3`}>
        {/* Enhanced Avatar */}
        <motion.div 
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 relative overflow-hidden"
          style={{
            background: isUser ? 
              'var(--sibil-gradient-secondary)' :
              (providerInfo ? 
                `linear-gradient(135deg, ${providerInfo.color} 0%, color-mix(in srgb, ${providerInfo.color} 80%, white) 100%)` :
                'var(--sibil-gradient-primary)')
          }}
          variants={avatarVariants}
          initial="hidden"
          animate="visible"
          whileHover="hover"
        >
          {isUser ? (
            <User className="h-5 w-5 text-white" />
          ) : (
            <Bot className="h-5 w-5 text-white" />
          )}
          
          {/* Animated glow effect */}
          <motion.div
            className="absolute inset-0 rounded-full"
            animate={{
              boxShadow: [
                `0 0 0 0 ${isUser ? 'rgba(240, 147, 251, 0.4)' : (providerInfo?.color || 'var(--sibil-accent)') + '40'}`,
                `0 0 0 6px ${isUser ? 'rgba(240, 147, 251, 0)' : (providerInfo?.color || 'var(--sibil-accent)') + '00'}`,
                `0 0 0 0 ${isUser ? 'rgba(240, 147, 251, 0)' : (providerInfo?.color || 'var(--sibil-accent)') + '00'}`
              ]
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeOut"
            }}
          />
        </motion.div>
        
        {/* Enhanced Message Content */}
        <motion.div
          className={`
            px-4 py-3 rounded-xl break-words relative overflow-hidden
            ${isUser 
              ? 'sibil-glass text-foreground border border-white/20' 
              : 'sibil-glass text-foreground border border-white/10'
            }
            ${isSending || isStreaming ? 'opacity-70' : ''}
          `}
          style={{
            background: isUser ? 
              'var(--sibil-gradient-accent)' : 
              'rgba(255, 255, 255, 0.05)'
          }}
          variants={isStreaming ? streamingVariants : undefined}
          animate={isStreaming ? "typing" : "complete"}
          whileHover={{ scale: 1.02 }}
          transition={{ duration: 0.2 }}
        >
          {/* Background pattern for user messages */}
          {isUser && (
            <div 
              className="absolute inset-0 opacity-20"
              style={{
                background: 'var(--sibil-gradient-primary)'
              }}
            />
          )}
          
          <div className="relative">
            {/* Provider Badge for Assistant Messages */}
            {!isUser && providerInfo && (
              <motion.div 
                className="mb-2 flex items-center gap-2"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <div 
                  className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium sibil-glass border"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${providerInfo.color} 10%, transparent)`,
                    borderColor: `color-mix(in srgb, ${providerInfo.color} 20%, transparent)`,
                    color: providerInfo.color
                  }}
                >
                  {providerInfo.icon}
                  <span>{providerInfo.name}</span>
                  {message.model && (
                    <>
                      <span className="text-muted-foreground">•</span>
                      <span className="text-muted-foreground">{message.model}</span>
                    </>
                  )}
                </div>
              </motion.div>
            )}
            
            {/* Content Rendering */}
            <IntelligentContentRenderer
              content={message.content}
              structured_content={message.structured_content}
              isStreaming={isStreaming}
            />
            
            {/* Streaming indicator */}
            {isStreaming && (
              <motion.div
                className="inline-flex items-center gap-1 ml-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <div className="sibil-streaming-dots text-muted-foreground" />
              </motion.div>
            )}
            
            {/* Timestamp and Status */}
            <motion.div 
              className={`
                text-xs mt-2 flex items-center justify-between
                ${isUser 
                  ? 'text-white/70' 
                  : 'text-muted-foreground'
                }
              `}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              <span>{formatTime(message.timestamp)}</span>
              {(isSending || isStreaming) && (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                >
                  <Loader2 className="h-3 w-3 ml-2" />
                </motion.div>
              )}
            </motion.div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  )
}