'use client'

import { cn } from '@/lib/utils'
import type { MessageModel } from '@starships/protocol'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useRef } from 'react'

interface VirtualizedMessageListProps {
  messages: MessageModel[]
  renderMessage: (message: MessageModel, index: number) => React.ReactNode
  className?: string
  estimateSize?: number
  overscan?: number
  reverseOrder?: boolean
}

export function VirtualizedMessageList({ messages, renderMessage, className, estimateSize = 120, overscan = 5, reverseOrder = true }: VirtualizedMessageListProps) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
    paddingStart: 16,
    paddingEnd: 16,
    // Enable dynamic sizing to prevent overlapping
    measureElement: element => {
      // Measure the actual height of the rendered element
      return element?.getBoundingClientRect().height ?? estimateSize
    },
  })

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    if (parentRef.current && messages.length > 0) {
      const scrollElement = parentRef.current
      const shouldAutoScroll = scrollElement.scrollTop + scrollElement.clientHeight >= scrollElement.scrollHeight - 100

      if (shouldAutoScroll) {
        setTimeout(() => {
          scrollElement.scrollTop = scrollElement.scrollHeight
        }, 100)
      }
    }
  }, [messages.length])

  // Initial scroll to bottom when component mounts with messages
  useEffect(() => {
    if (parentRef.current && messages.length > 0) {
      setTimeout(() => {
        parentRef.current!.scrollTop = parentRef.current!.scrollHeight
      }, 100)
    }
  }, [])

  return (
    <div
      ref={parentRef}
      className={cn('h-full overflow-y-auto message-scroll-area', className)}
      style={{
        contain: 'strict',
      }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map(virtualItem => (
          <div
            key={virtualItem.key}
            data-index={virtualItem.index}
            ref={virtualizer.measureElement}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualItem.start}px)`,
              minHeight: `${virtualItem.size}px`,
            }}
          >
            <div className="px-2 sm:px-4 py-2">{renderMessage(messages[reverseOrder ? messages.length - 1 - virtualItem.index : virtualItem.index], virtualItem.index)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function useMessageVirtualization() {
  const scrollToBottom = (parentRef: React.RefObject<HTMLDivElement>) => {
    if (parentRef.current) {
      parentRef.current.scrollTo({
        top: parentRef.current.scrollHeight,
        behavior: 'smooth',
      })
    }
  }

  const scrollToMessage = (parentRef: React.RefObject<HTMLDivElement>, messageIndex: number, estimateSize: number = 120) => {
    if (parentRef.current) {
      const scrollTop = messageIndex * estimateSize
      parentRef.current.scrollTo({
        top: scrollTop,
        behavior: 'smooth',
      })
    }
  }

  return {
    scrollToBottom,
    scrollToMessage,
  }
}
