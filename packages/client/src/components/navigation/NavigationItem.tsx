'use client'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { motion } from 'motion/react'
import Link from 'next/link'

interface NavigationItemProps {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  isActive: boolean
}

export function NavigationItem({ href, label, icon: Icon, isActive }: NavigationItemProps) {
  const content = (
    <Link href={href}>
      <motion.div
        className={`group relative transition-all duration-300 mx-1 p-2 rounded-xl ${
          isActive ? 'bg-gradient-to-r from-primary/20 to-primary/15 shadow-lg border border-primary/30' : 'hover:bg-gradient-to-r hover:from-muted/40 hover:to-muted/30 hover:shadow-md'
        }`}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <div className="flex items-center justify-center">
          <Icon className={`w-5 h-5 ${isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'} transition-colors`} />
        </div>
      </motion.div>
    </Link>
  )

  // Always wrap with tooltip since we're in icon-only mode
  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent side="right" className="bg-popover border border-border shadow-xl rounded-lg text-popover-foreground font-medium z-[1001]" sideOffset={12} style={{ zIndex: 1001 }}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
