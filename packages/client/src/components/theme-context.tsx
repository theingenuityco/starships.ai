'use client'

import * as React from 'react'
import { useTheme } from 'next-themes'

interface StarThemeProps {
  children: React.ReactNode
  theme?: 'dark' | 'light' // Optional now - will use next-themes if not provided
  className?: string
  style?: React.CSSProperties
}

export function StarTheme({ children, theme: propTheme, className, style }: StarThemeProps) {
  const { theme: currentTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  // Avoid hydration mismatch
  React.useEffect(() => {
    setMounted(true)
  }, [])

  // If propTheme is explicitly provided, ALWAYS use it (ignore global theme)
  // Otherwise, use next-themes current theme
  const theme = propTheme !== undefined ? propTheme : mounted ? currentTheme : 'dark'

  // Build class list: star-theme class + dark class if dark theme (for child component compatibility)
  const themeClass = `star-theme-${theme}`
  const darkClass = theme === 'dark' ? 'dark' : ''
  const classes = className ? `${themeClass} ${darkClass} ${className}`.trim() : `${themeClass} ${darkClass}`.trim()

  return (
    <div className={classes} style={style}>
      {children}
    </div>
  )
}
