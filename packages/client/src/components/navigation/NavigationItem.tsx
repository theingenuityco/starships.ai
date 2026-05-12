'use client'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import Icon from '@/components/primitives/Icon'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'motion/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useMemo, type MouseEvent, type ReactNode } from 'react'

interface NavigationItemProps {
  href: string
  label: string
  icon: string
  isActive: boolean
  badgeCount?: number
  showLabels?: boolean
  expanded?: boolean
  onClick?: () => void
  special?: boolean
  onItemClick?: () => void
  trailing?: ReactNode
}

export function NavigationItem({ href, label, icon, isActive, badgeCount, showLabels = false, expanded = false, onClick, special = false, onItemClick, trailing }: NavigationItemProps) {
  const router = useRouter()

  const hasBadge = typeof badgeCount === 'number' && Number.isFinite(badgeCount) && badgeCount > 0
  const badgeLabel = hasBadge ? `${badgeCount > 99 ? '99+' : String(badgeCount)} unread` : ''

  const handleClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
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
          width: '1rem',
          height: '1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: 0,
          pointerEvents: 'none',
        }}
      >
        <Icon name={icon} weight={hasBadge ? 'bold' : 'regular'} className="w-3 h-3" />
      </div>
    )
  }, [icon, hasBadge])

  const motionDiv = (
    <div
      onClick={handleClick}
      className={cn(
        // Match compact channel/DM row styling in the sidebar.
        'group relative rounded-lg flex items-center border w-full h-7 cursor-pointer text-sm px-1 overflow-hidden',
        special
          ? 'text-primary border-transparent hover:bg-muted/70 dark:hover:bg-[#2C2C30]'
          : isActive
            ? 'text-primary bg-primary/10 border-transparent'
            : hasBadge
              ? 'text-foreground border-transparent hover:bg-muted/70 dark:hover:bg-[#2C2C30]'
              : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/70 dark:hover:bg-[#2C2C30]'
      )}
      style={{
        justifyContent: 'flex-start',
        cursor: 'pointer',
        minHeight: '28px',
        transition: 'background-color 0.15s ease',
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
            className={cn(
              'whitespace-nowrap pointer-events-none truncate min-w-0 flex-1 ml-1',
              // Color is controlled by the row container; keep only weight here.
              isActive ? 'font-medium' : hasBadge ? 'font-bold' : 'font-medium'
            )}
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>

      {trailing ? <span className="ml-1 flex-shrink-0 inline-flex items-center">{trailing}</span> : null}

      {hasBadge ? (
        expanded ? (
          <span
            className="ml-1 inline-flex items-center justify-center min-w-[14px] h-[14px] px-1 rounded-full bg-red-500/90 dark:bg-red-400/90 text-white text-[9px] leading-none font-semibold"
            aria-label={badgeLabel}
            title={badgeLabel}
          >
            {badgeCount > 99 ? '99+' : String(badgeCount)}
          </span>
        ) : (
          <span
            className="pointer-events-none absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500/90 dark:bg-red-400/90 shadow-sm"
            aria-label={badgeLabel}
            title={badgeLabel}
          />
        )
      ) : null}
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
      <TooltipContent side="right" sideOffset={12} className="bg-card text-foreground border border-border/40 shadow-lg">
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
