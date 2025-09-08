'use client'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Frown, Heart, Laugh, Plus, Smile, ThumbsDown, ThumbsUp } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { toast } from 'sonner'

interface MessageReaction {
  emoji: string
  count: number
  userReacted: boolean
}

interface MessageReactionsProps {
  messageId: string
  reactions?: MessageReaction[]
  onAddReaction?: (messageId: string, emoji: string) => void
  onRemoveReaction?: (messageId: string, emoji: string) => void
  className?: string
}

const QUICK_REACTIONS = [
  { emoji: '👍', icon: ThumbsUp, label: 'Like' },
  { emoji: '👎', icon: ThumbsDown, label: 'Dislike' },
  { emoji: '😄', icon: Laugh, label: 'Laugh' },
  { emoji: '❤️', icon: Heart, label: 'Love' },
  { emoji: '😢', icon: Frown, label: 'Sad' },
  { emoji: '😊', icon: Smile, label: 'Smile' },
]

export function MessageReactions({ messageId, reactions = [], onAddReaction, onRemoveReaction, className }: MessageReactionsProps) {
  const [showReactionPicker, setShowReactionPicker] = useState(false)

  const handleReactionClick = (emoji: string, userReacted: boolean) => {
    if (userReacted) {
      onRemoveReaction?.(messageId, emoji)
    } else {
      onAddReaction?.(messageId, emoji)
    }
  }

  const handleQuickReaction = (emoji: string) => {
    const existingReaction = reactions.find(r => r.emoji === emoji)
    handleReactionClick(emoji, existingReaction?.userReacted || false)
    setShowReactionPicker(false)
  }

  const handleShowPicker = () => {
    setShowReactionPicker(!showReactionPicker)
  }

  const hasReactions = reactions.length > 0

  return (
    <div className={cn('relative', className)}>
      {/* Existing Reactions */}
      <AnimatePresence>
        {hasReactions && (
          <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} className="flex flex-wrap gap-1 mb-2">
            {reactions.map(reaction => (
              <motion.button
                key={reaction.emoji}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleReactionClick(reaction.emoji, reaction.userReacted)}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 text-xs rounded-full border transition-colors',
                  reaction.userReacted ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-muted/50 border-border hover:bg-muted'
                )}
              >
                <span>{reaction.emoji}</span>
                {reaction.count > 0 && <span className="font-medium">{reaction.count}</span>}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reaction Picker */}
      <AnimatePresence>
        {showReactionPicker && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.9 }}
            className="absolute bottom-full left-0 mb-2 p-2 bg-popover border rounded-lg shadow-lg z-10"
          >
            <div className="flex gap-1">
              {QUICK_REACTIONS.map(({ emoji, icon: Icon, label }) => (
                <Button key={emoji} variant="ghost" size="sm" onClick={() => handleQuickReaction(emoji)} className="h-8 w-8 p-0 hover:scale-110 transition-transform" title={label}>
                  <span className="text-base">{emoji}</span>
                </Button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Reaction Button */}
      <Button variant="ghost" size="sm" onClick={handleShowPicker} className="h-6 w-6 p-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
        <Plus className="w-3 h-3" />
      </Button>
    </div>
  )
}

// Mock reaction handlers for demo purposes
export function useMessageReactions() {
  const [reactions, setReactions] = useState<Record<string, MessageReaction[]>>({})

  const addReaction = async (messageId: string, emoji: string) => {
    setReactions(prev => {
      const messageReactions = prev[messageId] || []
      const existingReaction = messageReactions.find(r => r.emoji === emoji)

      if (existingReaction) {
        if (existingReaction.userReacted) {
          return prev // Already reacted
        }
        return {
          ...prev,
          [messageId]: messageReactions.map(r => (r.emoji === emoji ? { ...r, count: r.count + 1, userReacted: true } : r)),
        }
      }

      return {
        ...prev,
        [messageId]: [...messageReactions, { emoji, count: 1, userReacted: true }],
      }
    })

    toast.success('Reaction added')
  }

  const removeReaction = async (messageId: string, emoji: string) => {
    setReactions(prev => {
      const messageReactions = prev[messageId] || []
      return {
        ...prev,
        [messageId]: messageReactions.map(r => (r.emoji === emoji ? { ...r, count: Math.max(0, r.count - 1), userReacted: false } : r)).filter(r => r.count > 0),
      }
    })

    toast.success('Reaction removed')
  }

  const getMessageReactions = (messageId: string) => {
    return reactions[messageId] || []
  }

  return {
    addReaction,
    removeReaction,
    getMessageReactions,
  }
}
