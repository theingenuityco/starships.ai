'use client'

import Icon from '@/components/primitives/Icon'
import { cn } from '@/lib/utils'
import { useMobileNav } from '@/components/navigation/MobileNavContext'

export function MobileNavToggleButton({ className }: { className?: string }) {
  const nav = useMobileNav()
  if (!nav.isMobile) return null

  return (
    <Icon
      name={nav.isOpen ? 'x' : 'sidebar'}
      role="button"
      tabIndex={0}
      onClick={nav.isOpen ? nav.close : nav.open}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          ;(nav.isOpen ? nav.close : nav.open)()
        }
      }}
      className={cn(
        // Ghost icon (no button chrome / container styles).
        'h-5 w-5 text-muted-foreground cursor-pointer select-none transition-colors',
        'hover:text-foreground',
        // Keep accessible focus styling even without a button element.
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className
      )}
      aria-label={nav.isOpen ? 'Close navigation menu' : 'Open navigation menu'}
      title={nav.isOpen ? 'Close navigation menu' : 'Open navigation menu'}
    />
  )
}

