'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export function HoverProfilePopover({
  trigger,
  content,
  align = 'start',
  side = 'bottom',
  sideOffset = 6,
  contentClassName,
  triggerClassName,
}: {
  trigger: ReactNode
  content: ReactNode
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'bottom' | 'left' | 'right'
  sideOffset?: number
  contentClassName?: string
  triggerClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const triggerRef = useRef<HTMLSpanElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  const openPopover = useCallback(() => {
    clearCloseTimer()
    setOpen(prev => (prev ? prev : true))
  }, [clearCloseTimer])

  const closePopover = useCallback(
    (delayMs = 160) => {
      if (!open) return
      if (closeTimerRef.current) return
      closeTimerRef.current = setTimeout(() => {
        closeTimerRef.current = null
        setOpen(false)
      }, delayMs)
    },
    [open]
  )

  const handleTriggerPointerLeave = useCallback(
    (e: React.PointerEvent) => {
      const next = e.relatedTarget as Node | null
      const contentEl = contentRef.current
      if (next && contentEl && contentEl.contains(next)) return
      closePopover(200)
    },
    [closePopover]
  )

  const handleContentPointerLeave = useCallback(
    (e: React.PointerEvent) => {
      const next = e.relatedTarget as Node | null
      const triggerEl = triggerRef.current
      if (next && triggerEl && triggerEl.contains(next)) return
      closePopover(200)
    },
    [closePopover]
  )

  useEffect(() => {
    return () => {
      clearCloseTimer()
    }
  }, [clearCloseTimer])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span
          ref={triggerRef}
          className={cn('inline-flex items-center group/hover-name', triggerClassName)}
          onPointerEnter={openPopover}
          onPointerLeave={handleTriggerPointerLeave}
          onFocusCapture={openPopover}
          onBlurCapture={() => closePopover(0)}
        >
          {trigger}
        </span>
      </PopoverTrigger>
      <PopoverContent
        ref={contentRef}
        align={align}
        side={side}
        sideOffset={sideOffset}
        onPointerEnter={openPopover}
        onPointerLeave={handleContentPointerLeave}
        onFocus={openPopover}
        className={cn('w-80 p-3', contentClassName)}
      >
        {content}
      </PopoverContent>
    </Popover>
  )
}
