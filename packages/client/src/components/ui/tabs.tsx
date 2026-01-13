'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

interface TabsContextValue {
  value: string
  onValueChange: (value: string) => void
}

const TabsContext = React.createContext<TabsContextValue | undefined>(undefined)

interface TabsProps {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  children: React.ReactNode
  className?: string
}

const Tabs = React.forwardRef<HTMLDivElement, TabsProps>(({ value, defaultValue, onValueChange, children, className, ...props }, ref) => {
  const [internalValue, setInternalValue] = React.useState(defaultValue || '')
  const currentValue = value !== undefined ? value : internalValue

  const handleValueChange = React.useCallback(
    (newValue: string) => {
      if (value === undefined) {
        setInternalValue(newValue)
      }
      onValueChange?.(newValue)
    },
    [value, onValueChange]
  )

  const contextValue = React.useMemo(
    () => ({
      value: currentValue,
      onValueChange: handleValueChange,
    }),
    [currentValue, handleValueChange]
  )

  return (
    <TabsContext.Provider value={contextValue}>
      <div ref={ref} className={className} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  )
})
Tabs.displayName = 'Tabs'

const TabsList = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      // Card-like surface to match /agents deployed agent cards
      'inline-flex min-h-8 items-center justify-center rounded-lg bg-card border border-border/40 p-1 text-muted-foreground shadow-sm',
      className
    )}
    {...props}
  />
))
TabsList.displayName = 'TabsList'

interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string
}

const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(({ className, value, ...props }, ref) => {
  const context = React.useContext(TabsContext)
  if (!context) {
    throw new Error('TabsTrigger must be used within a Tabs component')
  }

  const isActive = context.value === value

  // Check if className includes padding classes - if so, don't apply full-width/full-height
  const hasCustomPadding = className?.includes('px-') || className?.includes('py-') || className?.includes('p-')

  return (
    <button
      ref={ref}
      className={cn(
        // Make triggers behave like navigation list items (hover + selected)
        'inline-flex items-center justify-center whitespace-nowrap text-[13px] font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
        isActive
          ? hasCustomPadding
            ? 'text-primary bg-primary/10 rounded-lg'
            : 'text-primary bg-primary/10 h-full w-full rounded-lg'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg px-2.5 py-1',
        className
      )}
      onClick={() => context.onValueChange(value)}
      {...props}
    />
  )
})
TabsTrigger.displayName = 'TabsTrigger'

interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string
}

const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(({ className, value, ...props }, ref) => {
  const context = React.useContext(TabsContext)
  if (!context) {
    throw new Error('TabsContent must be used within a Tabs component')
  }

  if (context.value !== value) {
    return null
  }

  return <div ref={ref} className={cn('mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2', className)} {...props} />
})
TabsContent.displayName = 'TabsContent'

export { Tabs, TabsList, TabsTrigger, TabsContent }
