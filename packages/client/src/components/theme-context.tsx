'use client'

import * as React from 'react'

interface StarThemeProps {
  children: React.ReactNode
  theme: 'dark' | 'light'
  className?: string
  style?: React.CSSProperties
}

export function StarTheme({ children, theme, className, style }: StarThemeProps) {
  const themeClass = `star-theme-${theme}`
  const classes = className ? `${themeClass} ${className}` : themeClass
  return (
    <div className={classes} style={style}>
      {children}
    </div>
  )
}
