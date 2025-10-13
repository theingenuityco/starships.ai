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
}

export function NavigationItem({ href, label, icon, isActive }: NavigationItemProps) {
  const router = useRouter()

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      // Delay navigation slightly so the icon click animation is visible
      e.preventDefault()
      setTimeout(() => router.push(href), 160)
    },
    [href, router]
  )

  const content = (
    <Link href={href}>
      <motion.div
        onClick={handleClick}
        className={`group relative transition-all duration-300 mx-auto rounded-xl w-12 h-12 flex items-center justify-center border ${
          isActive
            ? 'text-primary bg-gradient-to-r from-primary/20 to-primary/15 shadow-lg border-primary/30'
            : 'text-muted-foreground hover:text-foreground border-transparent hover:bg-gradient-to-r hover:from-muted/40 hover:to-muted/30 hover:shadow-md'
        }`}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <LordIcon src={getLordiconUrl(icon)} width={32} height={32} className="w-[32px] h-[32px]" trigger="click" />
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
