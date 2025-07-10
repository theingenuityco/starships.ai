'use client'

import { motion } from 'motion/react'
import { Square, Loader2, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { streamingIndicatorVariants } from '@/lib/animations'
import type { ConnectionStatus } from '@starships/protocol'

interface StreamingIndicatorProps {
  onStop: () => void
  connectionStatus?: ConnectionStatus
  isTyping?: boolean
}

export function StreamingIndicator({
  onStop,
  connectionStatus = 'connected',
  isTyping = false
}: StreamingIndicatorProps) {
  return (
    <motion.div
      className="flex items-center gap-2 px-4 py-2 sibil-glass border-white/20 rounded-full backdrop-blur-md"
      variants={streamingIndicatorVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      style={{
        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(6, 182, 212, 0.1) 100%)',
        borderColor: 'rgba(59, 130, 246, 0.3)'
      }}
    >
      {/* Animated streaming icon */}
      <motion.div
        animate={{
          rotate: 360,
          scale: [1, 1.1, 1]
        }}
        transition={{
          rotate: { duration: 2, repeat: Infinity, ease: "linear" },
          scale: { duration: 1, repeat: Infinity, ease: "easeInOut" }
        }}
      >
        <Zap className="h-3 w-3 text-blue-400" />
      </motion.div>
      
      {/* Connection status indicator */}
      <div className={`w-2 h-2 rounded-full ${
        connectionStatus === 'connected' ? 'bg-green-500' :
        connectionStatus === 'reconnecting' ? 'bg-yellow-500 animate-pulse' :
        'bg-red-500'
      }`} />
      
      {/* Streaming/Typing text with dots animation */}
      {isTyping && (
        <motion.div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">Sibil is typing</span>
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-1 h-1 bg-current rounded-full"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  delay: i * 0.2
                }}
              />
            ))}
          </div>
        </motion.div>
      )}
      
      {!isTyping && (
        <span className="text-xs font-medium text-blue-400 sibil-streaming-dots">
          Streaming
        </span>
      )}
      
      {/* Stop button with hover animation */}
      <motion.div
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
      >
        <Button
          size="sm"
          variant="ghost"
          onClick={onStop}
          className="h-6 w-6 p-0 hover:bg-red-500/20 hover:text-red-400 transition-colors duration-200"
        >
          <Square className="h-2.5 w-2.5" />
        </Button>
      </motion.div>
      
      {/* Animated background pulse */}
      <motion.div
        className="absolute inset-0 rounded-full"
        animate={{
          boxShadow: [
            '0 0 0 0 rgba(59, 130, 246, 0.4)',
            '0 0 0 8px rgba(59, 130, 246, 0)',
            '0 0 0 0 rgba(59, 130, 246, 0)'
          ]
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeOut"
        }}
      />
    </motion.div>
  )
}