"use client"

import * as React from "react"

interface StarThemeProps {
  children: React.ReactNode
  theme: "dark" | "light"
}

export function StarTheme({ children, theme }: StarThemeProps) {
  return (
    <div className={`star-theme-${theme}`}>
      {children}
    </div>
  )
}