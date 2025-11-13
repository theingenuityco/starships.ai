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
}

export function NavigationItem({ href, label, icon, isActive, showLabels = false, expanded = false, onClick, special = false }: NavigationItemProps) {
  const router = useRouter()

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      if (onClick) {
        // Custom click handler
        onClick()
      } else {
        // Default navigation with slight delay for animation
        setTimeout(() => router.push(href), 160)
      }
    },
    [href, router, onClick]
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
          width: '1.5rem',
          height: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: 0,
          pointerEvents: 'none',
        }}
      >
        <Icon name={icon} className="w-5 h-5" />
      </div>
    )
  }, [icon])

  const motionDiv = (
    <div
      onClick={handleClick}
      className={`group relative rounded-lg flex items-center border w-full h-8 cursor-pointer text-sm ${
        special
          ? 'text-primary border-transparent hover:bg-muted/40 hover:text-primary'
          : isActive
            ? 'text-primary bg-primary/10 border-primary/30'
            : 'text-muted-foreground hover:text-foreground border-transparent hover:bg-muted/40'
      }`}
      style={{
        paddingLeft: '0.25rem',
        paddingRight: '0.25rem',
        paddingTop: '0.25rem',
        paddingBottom: '0.25rem',
        justifyContent: 'flex-start',
        transition: 'background-color 0.15s ease, transform 0.1s ease',
        cursor: 'pointer',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'scale(1.02)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'scale(1)'
      }}
      onMouseDown={e => {
        e.currentTarget.style.transform = expanded ? 'scale(0.98)' : 'scale(0.95)'
      }}
      onMouseUp={e => {
        e.currentTarget.style.transform = 'scale(1)'
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
            className="ml-3 whitespace-nowrap pointer-events-none text-[13px] font-medium"
            style={{ marginLeft: '0.5rem' }}
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
