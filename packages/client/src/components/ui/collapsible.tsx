'use client'

import Icon from '@/components/primitives/Icon'

import * as React from 'react'
import { cn } from '@/lib/utils'


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
  contentId: string
  triggerId: string
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
  const baseId = React.useId()
  const contentId = `${baseId}-content`
  const triggerId = `${baseId}-trigger`

  const toggle = React.useCallback(() => {
    setIsOpen(prev => !prev)
  }, [])

  const contextValue = React.useMemo(
    () => ({
      isOpen,
      toggle,
      contentId,
      triggerId,
    }),
    [isOpen, toggle, contentId, triggerId]
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
  const { isOpen, toggle, contentId, triggerId } = useCollapsible()

  return (
    <button
      ref={ref}
      id={triggerId}
      aria-expanded={isOpen}
      aria-controls={contentId}
      className={cn('flex items-center justify-between w-full text-left transition-colors hover:bg-muted/50 rounded-md p-2', className)}
      onClick={toggle}
      {...props}
    >
      <div className="flex items-center gap-2">
        {isOpen ? <Icon name="chevron-down" className="w-4 h-4 text-muted-foreground" /> : <Icon name="chevron-right" className="w-4 h-4 text-muted-foreground" />}
        {children}
      </div>
    </button>
  )
})
CollapsibleTrigger.displayName = 'CollapsibleTrigger'

const CollapsibleContent = React.forwardRef<HTMLDivElement, CollapsibleContentProps>(({ children, className, ...props }, ref) => {
  const { isOpen, contentId, triggerId } = useCollapsible()

  return (
    <div
      ref={ref}
      id={contentId}
      role="region"
      aria-labelledby={triggerId}
      className={cn('transition-all duration-300 ease-out', className)}
      style={{
        display: 'grid',
        gridTemplateRows: isOpen ? '1fr' : '0fr',
        visibility: isOpen ? 'visible' : 'hidden',
      }}
      {...props}
    >
      <div className="overflow-hidden min-h-0">
        {children}
      </div>
    </div>
  )
})
CollapsibleContent.displayName = 'CollapsibleContent'

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
