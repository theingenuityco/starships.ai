'use client'

import { Badge } from '@/components/ui/badge'
import { useToolUpdateCheck } from '@/hooks/useToolUpdate'
import Icon from '@/components/primitives/Icon'
import { motion } from 'motion/react'

interface ToolUpdateBadgeProps {
  toolId: string
  toolName: string
}

export function ToolUpdateBadge({ toolId, toolName }: ToolUpdateBadgeProps) {
  const { data: updateCheck, isLoading } = useToolUpdateCheck(toolId)

  // Don't show anything if loading or no update available
  if (isLoading || !updateCheck?.needsUpdate) {
    return null
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <Badge
        className="text-[10px] px-1.5 py-0.5 font-medium relative overflow-hidden flex items-center"
        style={{
          background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.12), rgba(124, 58, 237, 0.08))',
          borderColor: 'rgba(139, 92, 246, 0.3)',
          color: 'rgb(139, 92, 246)',
          boxShadow: '0 0 8px rgba(139, 92, 246, 0.15)',
        }}
      >
        <motion.div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.15), transparent)',
          }}
          animate={{
            x: ['-100%', '100%'],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'linear',
          }}
        />
        <span className="relative z-10 flex items-center gap-1">
          <Icon name="arrow-up-circle" className="w-2.5 h-2.5" />
          NEW UPDATE AVAILABLE
        </span>
      </Badge>
    </motion.div>
  )
}
