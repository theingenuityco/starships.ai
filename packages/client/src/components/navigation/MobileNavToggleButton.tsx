'use client'

import Icon from '@/components/primitives/Icon'
import { cn } from '@/lib/utils'
import { useMobileNav } from '@/components/navigation/MobileNavContext'

export function MobileNavToggleButton({ className }: { className?: string }) {
  const nav = useMobileNav()
  if (!nav.isMobile) return null
  if (nav.isOpen) return null

  return (
    <button
      type="button"
      onClick={nav.open}
      className={cn(
        'inline-flex items-center justify-center h-8 w-8 rounded-lg border border-border/60 bg-card text-muted-foreground shadow-sm',
        'hover:bg-accent hover:text-foreground transition-colors',
        className
      )}
      aria-label="Open navigation menu"
      title="Open navigation menu"
    >
      <Icon name="sidebar" className="h-4 w-4" />
    </button>
  )
}

