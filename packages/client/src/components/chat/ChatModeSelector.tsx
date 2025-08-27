'use client'

import { motion } from 'motion/react'
import { Bot, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ChatMode = 'agent' | 'sibil'

interface ChatModeSelectorProps {
  mode: ChatMode
  onModeChange: (mode: ChatMode) => void
  disabled?: boolean
}

export function ChatModeSelector({ mode, onModeChange, disabled = false }: ChatModeSelectorProps) {
  const modes = [
    {
      id: 'sibil' as const,
      label: 'AI Mode',
      icon: Bot,
      description: 'General AI assistance'
    },
    {
      id: 'agent' as const,
      label: 'Agent Mode',
      icon: Users,
      description: 'Specialized agents'
    }
  ] as const

  return (
    <div className="flex items-center bg-muted/20 rounded-xl p-1 border border-border/40">
      {modes.map((modeOption) => {
        const Icon = modeOption.icon
        const isActive = mode === modeOption.id
        
        return (
          <motion.button
            key={modeOption.id}
            onClick={() => !disabled && onModeChange(modeOption.id)}
            disabled={disabled}
            className={cn(
              "relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              isActive
                ? "text-primary bg-background shadow-sm border border-border/40"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
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
                  type: "spring",
                  stiffness: 500,
                  damping: 30
                }}
              />
            )}
            
            <Icon className={cn(
              "relative h-4 w-4 z-10",
              isActive ? "text-primary" : "text-muted-foreground"
            )} />
            <span className="relative z-10">{modeOption.label}</span>
          </motion.button>
        )
      })}
    </div>
  )
}