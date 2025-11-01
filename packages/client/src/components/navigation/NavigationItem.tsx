'use client'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { LordIcon } from '@/components/animated/LordIcon'
import { getLordiconUrl } from '@/components/primitives/lordiconMap'
import { motion, AnimatePresence } from 'motion/react'
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

  const motionDiv = (
    <motion.div
      onClick={handleClick}
      className={`group relative transition-all duration-300 rounded-xl flex items-center border w-full h-10 cursor-pointer ${
        isActive
          ? 'text-primary bg-gradient-to-r from-primary/20 to-primary/15 shadow-lg border-primary/30'
          : 'text-muted-foreground hover:text-foreground border-transparent hover:bg-gradient-to-r hover:from-muted/40 hover:to-muted/30 hover:shadow-md'
      }`}
      style={{ 
        paddingLeft: '0.75rem',
        paddingRight: '0.75rem',
        paddingTop: '0.5rem',
        paddingBottom: '0.5rem',
        justifyContent: 'flex-start'
      }}
      whileHover={{ scale: expanded ? 1.02 : 1.05 }}
      whileTap={{ scale: expanded ? 0.98 : 0.95 }}
    >
      {special ? (
        <div className="rounded-full flex items-center justify-center w-6 h-6 bg-[#DD961C] hover:bg-[#CC860C] transition-all duration-300 flex-shrink-0" style={{ margin: 0 }}>
          <LordIcon 
            src={getLordiconUrl(icon)} 
            width={16} 
            height={16} 
            className="w-4 h-4 text-white" 
            trigger="click" 
          />
        </div>
      ) : (
        <div className="flex-shrink-0" style={{ width: '1.5rem', height: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', margin: 0 }}>
          <LordIcon 
            src={getLordiconUrl(icon)} 
            width={24} 
            height={24} 
            className="w-6 h-6" 
            trigger="click" 
          />
        </div>
      )}
      <AnimatePresence mode="wait">
        {expanded && (
          <motion.span
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
            className="ml-3 text-sm font-medium whitespace-nowrap"
            style={{ marginLeft: '0.75rem' }}
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
