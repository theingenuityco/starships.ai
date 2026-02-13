'use client'

import * as React from 'react'

type MobileNavContextValue = {
  isMobile: boolean
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
}

const MobileNavContext = React.createContext<MobileNavContextValue | undefined>(undefined)

export function MobileNavProvider({
  value,
  children,
}: {
  value: MobileNavContextValue
  children: React.ReactNode
}) {
  return <MobileNavContext.Provider value={value}>{children}</MobileNavContext.Provider>
}

export function useMobileNav(): MobileNavContextValue {
  const ctx = React.useContext(MobileNavContext)
  if (!ctx) {
    throw new Error('useMobileNav must be used within a MobileNavProvider')
  }
  return ctx
}

