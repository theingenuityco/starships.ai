"use client"

import * as React from "react"

interface FixedThemeProps {
  children: React.ReactNode
  theme: "dark" | "light"
}

export function FixedTheme({ children, theme }: FixedThemeProps) {
  return (
    <div className={`fixed-theme-${theme}`}>
      {children}
    </div>
  )
}