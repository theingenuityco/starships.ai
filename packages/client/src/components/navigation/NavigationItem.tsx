'use client'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { LordIcon } from '@/components/animated/LordIcon'
import { getLordiconUrl } from '@/components/primitives/lordiconMap'
import { motion } from 'motion/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback } from 'react'

interface NavigationItemProps {
  href: string
  label: string
  icon: string
  isActive: boolean
  showLabels?: boolean
  expanded?: boolean
  onClick?: () => void
}

export function NavigationItem({ href, label, icon, isActive, showLabels = false, expanded = false, onClick }: NavigationItemProps) {
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

  const motionDiv = (
    <motion.div
      onClick={handleClick}
      className={`group relative transition-all duration-300 rounded-xl flex items-center border ${
        expanded ? 'w-full px-3 py-2 h-10 justify-start' : 'w-10 h-10 justify-center mx-auto'
      } ${
        isActive
          ? 'text-primary bg-gradient-to-r from-primary/20 to-primary/15 shadow-lg border-primary/30'
          : 'text-muted-foreground hover:text-foreground border-transparent hover:bg-gradient-to-r hover:from-muted/40 hover:to-muted/30 hover:shadow-md'
      }`}
      whileHover={{ scale: expanded ? 1.02 : 1.05 }}
      whileTap={{ scale: expanded ? 0.98 : 0.95 }}
    >
      <LordIcon 
        src={getLordiconUrl(icon)} 
        width={expanded ? 20 : 28} 
        height={expanded ? 20 : 28} 
        className={expanded ? "w-[20px] h-[20px]" : "w-[28px] h-[28px]"} 
        trigger="click" 
      />
      {expanded && (
        <motion.span
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -10 }}
          transition={{ duration: 0.2, delay: 0.1 }}
          className="ml-3 text-sm font-medium whitespace-nowrap"
        >
          {label}
        </motion.span>
      )}
      {showLabels && !expanded && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.2 }}
          className="absolute top-full mt-1 left-1/2 transform -translate-x-1/2 z-10"
        >
          <span className="text-[10px] font-medium text-center whitespace-nowrap bg-primary/90 text-primary-foreground px-1.5 py-0.5 rounded shadow-md">
            {label}
          </span>
        </motion.div>
      )}
    </motion.div>
  )

  const content = href === '#' || onClick ? motionDiv : <Link href={href}>{motionDiv}</Link>

  // Only wrap with tooltip if not expanded and not showing labels
  if (expanded || showLabels) {
    return content
  }

  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent side="right" className="bg-popover border border-border shadow-xl rounded-lg text-popover-foreground font-medium z-[1001]" sideOffset={12} style={{ zIndex: 1001 }}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
