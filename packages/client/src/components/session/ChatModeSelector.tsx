'use client'

import { motion } from 'motion/react'
import { Bot, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ChatMode = 'agent'

interface ChatModeSelectorProps {
  mode: ChatMode
  onModeChange: (mode: ChatMode) => void
  disabled?: boolean
  compact?: boolean
}

export function ChatModeSelector({
  mode,
  onModeChange,
  disabled = false,
  compact = false,
}: ChatModeSelectorProps) {
  const modes = [
    {
      id: 'agent' as const,
      label: 'Agent Mode',
      icon: Users,
      description: 'Specialized agents',
    },
  ] as const

  return (
    <div
      className={cn(
        'flex items-center bg-muted/20 rounded-xl border border-border/40',
        compact ? 'p-0.5' : 'p-1'
      )}
    >
      {modes.map(modeOption => {
        const Icon = modeOption.icon
        const isActive = mode === modeOption.id

        return (
          <motion.button
            key={modeOption.id}
            onClick={() => !disabled && onModeChange(modeOption.id)}
            disabled={disabled}
            className={cn(
              'relative flex items-center rounded-lg font-medium transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              compact ? 'gap-1.5 px-2.5 py-1.5 text-xs' : 'gap-2 px-4 py-2 text-sm',
              isActive
                ? 'text-primary bg-background shadow-sm border border-border/40'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            )}
            whileHover={!disabled ? { scale: 1.02 } : undefined}
            whileTap={!disabled ? { scale: 0.98 } : undefined}
          >
            {isActive && (
              <motion.div
                layoutId="activeMode"
                className="absolute inset-0 bg-background rounded-lg border border-border/40 shadow-sm"
                initial={false}
                transition={{
                  type: 'spring',
                  stiffness: 500,
                  damping: 30,
                }}
              />
            )}

            <Icon
              className={cn(
                'relative z-10',
                compact ? 'h-3 w-3' : 'h-4 w-4',
                isActive ? 'text-primary' : 'text-muted-foreground'
              )}
            />
            <span className="relative z-10">{modeOption.label}</span>
          </motion.button>
        )
      })}
    </div>
  )
}
