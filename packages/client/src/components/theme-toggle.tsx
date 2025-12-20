'use client'

import Icon from '@/components/primitives/Icon'

import * as React from 'react'

import { useTheme } from 'next-themes'

import { cn } from '@/lib/utils'

type ThemeToggleSize = 'xs' | 'sm' | 'md'

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

  // Use a Switch-like layout (flex + translate thumb) to avoid 1–2px drift with borders/tiny sizes.
  const sizeConfig = (() => {
    switch (size) {
      case 'xs':
        return { track: 'h-4 w-7', thumb: 'h-3 w-3', icon: 'h-2.5 w-2.5', translate: 'translate-x-3' }
      case 'sm':
        return { track: 'h-5 w-9', thumb: 'h-4 w-4', icon: 'h-3 w-3', translate: 'translate-x-4' }
      case 'md':
      default:
        return { track: 'h-6 w-11', thumb: 'h-5 w-5', icon: 'h-3.5 w-3.5', translate: 'translate-x-5' }
    }
  })()

  if (!mounted) {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={true}
        disabled
        className={cn(
          'inline-flex shrink-0 cursor-not-allowed items-center rounded-full border-2 border-border/90 bg-muted/80 opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          sizeConfig.track
        )}
      >
        <span className={cn('pointer-events-none flex items-center justify-center rounded-full bg-background shadow-lg ring-0 transition-transform', sizeConfig.thumb, sizeConfig.translate)}>
          <Icon name="moon" className={cn(sizeConfig.icon, 'text-foreground')} weight="fill" />
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
        'inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-border/90 transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        sizeConfig.track,
        'bg-secondary/80 hover:bg-secondary/90'
      )}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <span
        className={cn(
          'pointer-events-none flex items-center justify-center rounded-full bg-background shadow-lg ring-0 transition-transform',
          sizeConfig.thumb,
          isDark ? sizeConfig.translate : 'translate-x-0'
        )}
        style={{ willChange: 'transform' }}
      >
        {isDark ? (
          <Icon name="moon" className={cn(sizeConfig.icon, 'text-foreground transition-opacity duration-200')} weight="fill" />
        ) : (
          <Icon name="sun" className={cn(sizeConfig.icon, 'text-foreground transition-opacity duration-200')} weight="fill" />
        )}
      </span>
    </button>
  )
}
