'use client'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { motion } from 'motion/react'
import Link from 'next/link'

interface NavigationItemProps {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  isActive: boolean
  compact?: boolean
  iconOnly?: boolean
}

export function NavigationItem({ href, label, icon: Icon, isActive, compact = false, iconOnly = false }: NavigationItemProps) {
  const content = (
    <Link href={href}>
      <motion.div
        className={`group relative transition-all duration-300 ${
          iconOnly
            ? `mx-1 p-2 rounded-xl ${
                isActive ? 'bg-gradient-to-r from-primary/20 to-primary/15 shadow-lg border border-primary/30' : 'hover:bg-gradient-to-r hover:from-muted/40 hover:to-muted/30 hover:shadow-md'
              }`
            : `mx-3 px-2 py-1.5 rounded-lg ${
                isActive
                  ? 'bg-gradient-to-r from-primary/15 to-primary/10 backdrop-blur-sm shadow-sm border border-primary/20'
                  : 'hover:bg-gradient-to-r hover:from-muted/50 hover:to-muted/30 hover:shadow-sm'
              }`
        }`}
        whileHover={{ scale: iconOnly ? 1.05 : 1.02, x: iconOnly ? 0 : 4 }}
        whileTap={{ scale: 0.95 }}
      >
        {iconOnly ? (
          // Icon-only mode
          <div className="flex items-center justify-center">
            <Icon className={`w-5 h-5 ${isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'} transition-colors`} />
          </div>
        ) : (
          // Full mode with label
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative flex-shrink-0">
              <div className={`p-1.5 rounded-md transition-all duration-300 ${isActive ? 'bg-primary/20' : 'bg-muted/30 group-hover:bg-muted/50'}`}>
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'} transition-colors`} />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <span
                className={`font-semibold ${compact ? 'text-sm' : 'text-sm'} truncate block ${isActive ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'} transition-colors`}
              >
                {label}
              </span>
            </div>
          </div>
        )}
      </motion.div>
    </Link>
  )

  // Wrap with tooltip in icon-only mode
  if (iconOnly) {
    return (
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="right" className="bg-popover border border-border shadow-xl rounded-lg text-popover-foreground font-medium z-[1001]" sideOffset={12} style={{ zIndex: 1001 }}>
          {label}
        </TooltipContent>
      </Tooltip>
    )
  }

  return content
}
