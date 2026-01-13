'use client'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import Icon from '@/components/primitives/Icon'
import { motion, AnimatePresence } from 'motion/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useMemo } from 'react'

interface NavigationItemProps {
  href: string
  label: string
  icon: string
  isActive: boolean
  showLabels?: boolean
  expanded?: boolean
  onClick?: () => void
  special?: boolean
  onItemClick?: () => void
}

export function NavigationItem({ href, label, icon, isActive, showLabels = false, expanded = false, onClick, special = false, onItemClick }: NavigationItemProps) {
  const router = useRouter()

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (onClick) {
        // Custom click handler
        onClick()
      } else {
        // Default navigation with slight delay for animation
        setTimeout(() => router.push(href), 160)
      }
      // Always call onItemClick for mobile close
      if (onItemClick) onItemClick()
    },
    [href, router, onClick, onItemClick]
  )

  // Create stable icon component that never changes - memoized at component level
  const StableIcon = useMemo(() => {
    // Don't render icon if icon prop is empty
    if (!icon || icon === '') {
      return null
    }
    return (
      <div
        className="flex-shrink-0"
        style={{
          width: '1.25rem',
          height: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: 0,
          pointerEvents: 'none',
        }}
      >
        <Icon name={icon} className="w-4 h-4" />
      </div>
    )
  }, [icon])

  const motionDiv = (
    <div
      onClick={handleClick}
      className={`group relative rounded-lg flex items-center border w-full h-8 cursor-pointer text-sm px-2 ${
        special
          ? 'text-primary border-transparent hover:text-primary hover:bg-muted'
          : isActive
            ? 'text-primary bg-primary/10 border-transparent'
            : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-muted'
      }`}
      style={{
        justifyContent: 'flex-start',
        transition: 'background-color 0.15s ease',
        cursor: 'pointer',
        minHeight: '32px',
        fontSize: '14px',
      }}
    >
      {StableIcon}
      <AnimatePresence mode="wait">
        {expanded && (
          <motion.span
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.12, ease: [0.4, 0, 0.2, 1] }}
            className="whitespace-nowrap pointer-events-none font-medium"
            style={{ fontSize: '14px', marginLeft: '0.375rem' }}
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
      {showLabels && !expanded && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.2 }}
          className="absolute top-full mt-1 left-1/2 transform -translate-x-1/2 z-10"
        >
          <span className="text-[10px] font-medium text-center whitespace-nowrap bg-primary/90 text-primary-foreground px-1.5 py-0.5 rounded shadow-md">{label}</span>
        </motion.div>
      )}
    </div>
  )

  const content =
    href === '#' || onClick ? (
      motionDiv
    ) : (
      <Link href={href} style={{ cursor: 'pointer' }}>
        {motionDiv}
      </Link>
    )

  // Only wrap with tooltip if not expanded and not showing labels
  if (expanded || showLabels) {
    return content
  }

  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild className="cursor-pointer">
        {content}
      </TooltipTrigger>
      <TooltipContent side="right" className="bg-popover border border-border shadow-xl rounded-lg text-popover-foreground font-medium z-[1001]" sideOffset={12} style={{ zIndex: 1001 }}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
