'use client'

import Icon from '@/components/primitives/Icon'

import * as React from 'react'

import { useTheme } from 'next-themes'

import { cn } from '@/lib/utils'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  // Avoid hydration mismatch
  React.useEffect(() => {
    setMounted(true)
  }, [])

  const isDark = mounted ? theme === 'dark' : true

  const handleToggle = () => {
    if (mounted) {
      setTheme(theme === 'light' ? 'dark' : 'light')
    }
  }

  if (!mounted) {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={true}
        disabled
        className="relative inline-flex h-7 w-12 shrink-0 cursor-not-allowed items-center rounded-full border-2 border-border/90 bg-muted/80 opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <span className="pointer-events-none absolute left-0.5 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full bg-background shadow-lg ring-0">
          <Icon name="moon" className="h-3.5 w-3.5 text-foreground" />
        </span>
      </button>
    )
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      onClick={handleToggle}
      className={cn(
        'relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-border/90 transition-all duration-300 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'bg-secondary/80 hover:bg-secondary/90'
      )}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <span
        className={cn(
          'pointer-events-none absolute top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full bg-background shadow-lg ring-0',
          isDark ? 'left-[20px]' : 'left-0.5'
        )}
        style={{
          transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          willChange: 'left',
        }}
      >
        {isDark ? (
          <Icon name="moon" className="h-3.5 w-3.5 text-foreground transition-opacity duration-200" weight="fill" />
        ) : (
          <Icon name="sun" className="h-3.5 w-3.5 text-foreground transition-opacity duration-200" weight="fill" />
        )}
      </span>
    </button>
  )
}
