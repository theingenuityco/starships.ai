'use client'

import { cn } from '@/lib/utils'
import type { MessageModel } from '@starships/protocol'
import { useEffect, useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'

interface AccessibilityEnhancementsProps {
  messages: MessageModel[]
  onNavigateMessage?: (messageId: string) => void
  onSelectMessage?: (messageId: string) => void
  onStartSearch?: () => void
  className?: string
}

export function AccessibilityEnhancements({ messages, onNavigateMessage, onSelectMessage, onStartSearch, className }: AccessibilityEnhancementsProps) {
  const [currentMessageIndex, setCurrentMessageIndex] = useState(-1)
  const [announceText, setAnnounceText] = useState('')

  // Keyboard navigation
  useHotkeys(
    'j, ArrowDown',
    () => {
      if (currentMessageIndex < messages.length - 1) {
        const newIndex = currentMessageIndex + 1
        setCurrentMessageIndex(newIndex)
        onNavigateMessage?.(messages[newIndex].id)
        announceMessage(messages[newIndex])
      }
    },
    { preventDefault: true }
  )

  useHotkeys(
    'k, ArrowUp',
    () => {
      if (currentMessageIndex > 0) {
        const newIndex = currentMessageIndex - 1
        setCurrentMessageIndex(newIndex)
        onNavigateMessage?.(messages[newIndex].id)
        announceMessage(messages[newIndex])
      }
    },
    { preventDefault: true }
  )

  useHotkeys(
    'Enter, Space',
    () => {
      if (currentMessageIndex >= 0) {
        onSelectMessage?.(messages[currentMessageIndex].id)
        setAnnounceText('Message selected')
      }
    },
    { preventDefault: true }
  )

  useHotkeys(
    '/',
    () => {
      onStartSearch?.()
      setAnnounceText('Search activated')
    },
    { preventDefault: true }
  )

  useHotkeys(
    'Escape',
    () => {
      setCurrentMessageIndex(-1)
      setAnnounceText('Navigation cleared')
    },
    { preventDefault: true }
  )

  const announceMessage = (message: MessageModel) => {
    const role = message.role === 'user' ? 'You' : 'Assistant'
    const time = new Date(message.timestamp).toLocaleTimeString()
    setAnnounceText(`${role} said: ${message.content.substring(0, 100)}... at ${time}`)
  }

  return (
    <div className={cn('sr-only', className)}>
      {/* Screen reader announcements */}
      <div aria-live="polite" aria-atomic="true">
        {announceText}
      </div>

      {/* Skip navigation */}
      <a href="#message-input" className="sr-only-focusable bg-primary text-primary-foreground px-4 py-2 rounded">
        Skip to message input
      </a>

      {/* Instructions for screen readers */}
      <div aria-label="Message navigation instructions">
        <p>Use J or Down arrow to navigate to next message</p>
        <p>Use K or Up arrow to navigate to previous message</p>
        <p>Press Enter or Space to select current message</p>
        <p>Press / to start search</p>
        <p>Press Escape to clear navigation</p>
      </div>
    </div>
  )
}

interface MessageAccessibilityProps {
  message: MessageModel
  index: number
  isSelected?: boolean
  isFocused?: boolean
  totalMessages: number
}

export function MessageAccessibility({ message, index, isSelected, isFocused, totalMessages }: MessageAccessibilityProps) {
  const role = message.role === 'user' ? 'You' : 'Assistant'
  const time = new Date(message.timestamp).toLocaleString()

  return {
    'aria-label': `Message ${index + 1} of ${totalMessages} from ${role} at ${time}`,
    'aria-selected': isSelected,
    'aria-current': isFocused ? ('true' as const) : undefined,
    role: 'option',
    tabIndex: isFocused ? 0 : -1,
  }
}

export function useAccessibilityFeatures() {
  const [isHighContrast, setIsHighContrast] = useState(false)
  const [isReducedMotion, setIsReducedMotion] = useState(false)

  useEffect(() => {
    // Check for user preferences
    const highContrastQuery = window.matchMedia('(prefers-contrast: high)')
    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

    setIsHighContrast(highContrastQuery.matches)
    setIsReducedMotion(reducedMotionQuery.matches)

    const handleHighContrastChange = (e: MediaQueryListEvent) => setIsHighContrast(e.matches)
    const handleReducedMotionChange = (e: MediaQueryListEvent) => setIsReducedMotion(e.matches)

    highContrastQuery.addEventListener('change', handleHighContrastChange)
    reducedMotionQuery.addEventListener('change', handleReducedMotionChange)

    return () => {
      highContrastQuery.removeEventListener('change', handleHighContrastChange)
      reducedMotionQuery.removeEventListener('change', handleReducedMotionChange)
    }
  }, [])

  return {
    isHighContrast,
    isReducedMotion,
  }
}
