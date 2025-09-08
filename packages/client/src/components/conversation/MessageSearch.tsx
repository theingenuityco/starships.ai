'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { MessageModel } from '@starships/protocol'
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useState } from 'react'

interface MessageSearchProps {
  messages: MessageModel[]
  onSearchResultClick?: (messageId: string, index: number) => void
  onClose?: () => void
  className?: string
}

export function MessageSearch({ messages, onSearchResultClick, onClose, className }: MessageSearchProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [currentResultIndex, setCurrentResultIndex] = useState(0)
  const [isVisible, setIsVisible] = useState(false)

  const searchResults = useMemo(() => {
    if (!searchTerm.trim()) return []

    const term = searchTerm.toLowerCase()
    return messages
      .map((message, index) => ({
        message,
        originalIndex: index,
        matches: message.content.toLowerCase().includes(term),
      }))
      .filter(result => result.matches)
  }, [messages, searchTerm])

  const handlePrevious = useCallback(() => {
    if (searchResults.length > 0) {
      const newIndex = currentResultIndex > 0 ? currentResultIndex - 1 : searchResults.length - 1
      setCurrentResultIndex(newIndex)
      const result = searchResults[newIndex]
      onSearchResultClick?.(result.message.id, result.originalIndex)
    }
  }, [currentResultIndex, searchResults, onSearchResultClick])

  const handleNext = useCallback(() => {
    if (searchResults.length > 0) {
      const newIndex = currentResultIndex < searchResults.length - 1 ? currentResultIndex + 1 : 0
      setCurrentResultIndex(newIndex)
      const result = searchResults[newIndex]
      onSearchResultClick?.(result.message.id, result.originalIndex)
    }
  }, [currentResultIndex, searchResults, onSearchResultClick])

  const handleClose = () => {
    setSearchTerm('')
    setCurrentResultIndex(0)
    setIsVisible(false)
    onClose?.()
  }

  useEffect(() => {
    setIsVisible(true)
  }, [])

  useEffect(() => {
    if (searchResults.length > 0 && searchTerm) {
      setCurrentResultIndex(0)
      const result = searchResults[0]
      onSearchResultClick?.(result.message.id, result.originalIndex)
    }
  }, [searchTerm, searchResults, onSearchResultClick])

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className={cn('sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b p-3', className)}
        >
          <div className="flex items-center gap-2 max-w-md mx-auto">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input type="search" placeholder="Search messages..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10 pr-4" autoFocus />
            </div>

            {searchResults.length > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {currentResultIndex + 1} of {searchResults.length}
                </span>

                <Button variant="ghost" size="icon" onClick={handlePrevious} className="h-8 w-8" disabled={searchResults.length === 0}>
                  <ChevronUp className="w-4 h-4" />
                </Button>

                <Button variant="ghost" size="icon" onClick={handleNext} className="h-8 w-8" disabled={searchResults.length === 0}>
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </div>
            )}

            <Button variant="ghost" size="icon" onClick={handleClose} className="h-8 w-8">
              <X className="w-4 h-4" />
            </Button>
          </div>

          {searchTerm && searchResults.length === 0 && <div className="text-center text-sm text-muted-foreground mt-2">No messages found</div>}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

interface MessageHighlightProps {
  content: string
  searchTerm: string
  className?: string
}

export function MessageHighlight({ content, searchTerm, className }: MessageHighlightProps) {
  if (!searchTerm.trim()) {
    return <span className={className}>{content}</span>
  }

  const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  const parts = content.split(regex)

  return (
    <span className={className}>
      {parts.map((part, index) =>
        regex.test(part) ? (
          <mark key={index} className="bg-yellow-200 text-yellow-900 dark:bg-yellow-900 dark:text-yellow-100 px-1 rounded">
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        )
      )}
    </span>
  )
}

export function useMessageSearch(messages: MessageModel[]) {
  const [isSearching, setIsSearching] = useState(false)
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null)

  const startSearch = useCallback(() => {
    setIsSearching(true)
  }, [])

  const stopSearch = useCallback(() => {
    setIsSearching(false)
    setHighlightedMessageId(null)
  }, [])

  const highlightMessage = useCallback((messageId: string) => {
    setHighlightedMessageId(messageId)
    // Clear highlight after a few seconds
    setTimeout(() => {
      setHighlightedMessageId(null)
    }, 3000)
  }, [])

  return {
    isSearching,
    highlightedMessageId,
    startSearch,
    stopSearch,
    highlightMessage,
  }
}
