'use client'

import { cn } from '@/lib/utils'
import type { MessageModel } from '@starships/protocol'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef } from 'react'

interface VirtualizedMessageListProps {
  messages: MessageModel[]
  renderMessage: (message: MessageModel, index: number) => React.ReactNode
  className?: string
  estimateSize?: number
  overscan?: number
}

export function VirtualizedMessageList({ messages, renderMessage, className, estimateSize = 120, overscan = 5 }: VirtualizedMessageListProps) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
    paddingStart: 16,
    paddingEnd: 16,
  })

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
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualItem.size}px`,
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            <div className="px-2 sm:px-4 py-2">{renderMessage(messages[virtualItem.index], virtualItem.index)}</div>
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
