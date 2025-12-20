'use client'

import Icon from '@/components/primitives/Icon'

import * as React from 'react'

import { useTheme } from 'next-themes'

import { cn } from '@/lib/utils'

type ThemeToggleSize = 'sm' | 'md'

interface ThemeToggleProps {
  size?: ThemeToggleSize
}

export function ThemeToggle({ size = 'md' }: ThemeToggleProps) {
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

  const trackClassName =
    size === 'sm'
      ? 'h-6 w-10'
      : 'h-7 w-12'

  const thumbClassName =
    size === 'sm'
      ? 'h-5 w-5'
      : 'h-6 w-6'

  // Keep the thumb inside the track border by using a fixed inset + translateX.
  // Track has `border-2`, so `left-0.5` (2px) aligns the thumb to the inner edge in "off" state.
  const thumbInsetClassName = 'left-0.5'
  const thumbTranslateOnClassName = size === 'sm' ? 'translate-x-3' : 'translate-x-4'

  const iconClassName =
    size === 'sm'
      ? 'h-3 w-3'
      : 'h-3.5 w-3.5'

  if (!mounted) {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={true}
        disabled
        className={cn(
          'relative inline-flex shrink-0 cursor-not-allowed items-center rounded-full border-2 border-border/90 bg-muted/80 opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          trackClassName
        )}
      >
        <span
          className={cn(
            'pointer-events-none absolute top-1/2 -translate-y-1/2 flex items-center justify-center rounded-full bg-background shadow-lg ring-0',
            thumbInsetClassName,
            thumbClassName
          )}
        >
          <Icon name="moon" className={cn(iconClassName, 'text-foreground')} />
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
        'relative inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-border/90 transition-all duration-300 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        trackClassName,
        'bg-secondary/80 hover:bg-secondary/90'
      )}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <span
        className={cn(
          'pointer-events-none absolute top-1/2 -translate-y-1/2 flex items-center justify-center rounded-full bg-background shadow-lg ring-0',
          thumbInsetClassName,
          thumbClassName,
          'transition-transform duration-300 ease-in-out',
          isDark ? thumbTranslateOnClassName : 'translate-x-0'
        )}
        style={{ willChange: 'transform' }}
      >
        {isDark ? (
          <Icon name="moon" className={cn(iconClassName, 'text-foreground transition-opacity duration-200')} weight="fill" />
        ) : (
          <Icon name="sun" className={cn(iconClassName, 'text-foreground transition-opacity duration-200')} weight="fill" />
        )}
      </span>
    </button>
  )
}
