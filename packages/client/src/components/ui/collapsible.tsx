'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface CollapsibleProps {
  children: React.ReactNode
  className?: string
  defaultOpen?: boolean
}

interface CollapsibleTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode
}

interface CollapsibleContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

interface CollapsibleContextValue {
  isOpen: boolean
  toggle: () => void
}

const CollapsibleContext = React.createContext<CollapsibleContextValue | undefined>(undefined)

const useCollapsible = () => {
  const context = React.useContext(CollapsibleContext)
  if (!context) {
    throw new Error('useCollapsible must be used within a Collapsible component')
  }
  return context
}

const Collapsible = React.forwardRef<HTMLDivElement, CollapsibleProps>(({ children, className, defaultOpen = false, ...props }, ref) => {
  const [isOpen, setIsOpen] = React.useState(defaultOpen)

  const toggle = React.useCallback(() => {
    setIsOpen(prev => !prev)
  }, [])

  const contextValue = React.useMemo(
    () => ({
      isOpen,
      toggle,
    }),
    [isOpen, toggle]
  )

  return (
    <CollapsibleContext.Provider value={contextValue}>
      <div ref={ref} className={cn('space-y-2', className)} {...props}>
        {children}
      </div>
    </CollapsibleContext.Provider>
  )
})
Collapsible.displayName = 'Collapsible'

const CollapsibleTrigger = React.forwardRef<HTMLButtonElement, CollapsibleTriggerProps>(({ children, className, ...props }, ref) => {
  const { isOpen, toggle } = useCollapsible()

  return (
    <button ref={ref} className={cn('flex items-center justify-between w-full text-left transition-colors hover:bg-muted/50 rounded-md p-2', className)} onClick={toggle} {...props}>
      <div className="flex items-center gap-2">
        {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        {children}
      </div>
    </button>
  )
})
CollapsibleTrigger.displayName = 'CollapsibleTrigger'

const CollapsibleContent = React.forwardRef<HTMLDivElement, CollapsibleContentProps>(({ children, className, ...props }, ref) => {
  const { isOpen } = useCollapsible()

  if (!isOpen) {
    return null
  }

  return (
    <div ref={ref} className={cn('animate-in slide-in-from-top-2 duration-200', className)} {...props}>
      {children}
    </div>
  )
})
CollapsibleContent.displayName = 'CollapsibleContent'

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
