'use client'

import { cn } from '@/lib/utils'
import { LoadingSpinner } from '@/components/primitives/LoadingSpinner'
import type { DemoConvStatus } from '@/components/demo/demoActivity'

/**
 * The small status indicator the demo sidebar puts on rooms and conversations:
 *   live      → spinner (an agent is actively working it)
 *   needs-you → yellow pulsing dot (gated on your approval)
 *   done      → blue pulsing dot (only on the beat it completes — transient)
 *   idle      → nothing (callers fall back to the normal conversation icon)
 */
export function DemoStatusIndicator({ status, className }: { status: DemoConvStatus; className?: string }) {
  if (status === 'idle') return null
  return (
    <span className={cn('flex h-3 w-3 shrink-0 items-center justify-center', className)} aria-hidden>
      {status === 'live' ? (
        <LoadingSpinner size={12} className="text-muted-foreground" />
      ) : status === 'needs-you' ? (
        <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
      ) : (
        <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
      )}
    </span>
  )
}
