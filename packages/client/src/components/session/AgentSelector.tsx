'use client'

import { Button } from '@/components/ui/button'
import { useAgents } from '@/hooks/useAgents'
import type { Agent } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Bot, ChevronDown, Loader2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'

interface AgentSelectorProps {
  selectedAgent: Agent | null
  onAgentChange: (agent: Agent | null) => void
  starshipId?: string
  compact?: boolean
}

export function AgentSelector({ selectedAgent, onAgentChange, starshipId, compact = false }: AgentSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const { agents, loading } = useAgents(starshipId)

  // Auto-select first agent when agents are loaded
  useEffect(() => {
    if (!loading && agents.length > 0 && !selectedAgent) {
      onAgentChange(agents[0])
    }
  }, [agents, loading, selectedAgent, onAgentChange])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element
      if (!target.closest('[data-agent-selector]')) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [isOpen])

  return (
    <div className="relative" data-agent-selector>
      <Button variant="outline" onClick={() => setIsOpen(!isOpen)} className={cn('justify-between', compact ? 'h-8 px-3 text-xs min-w-[120px]' : 'min-w-[180px]')} disabled={loading}>
        <div className="flex items-center gap-2">
          <Bot className={compact ? 'h-3 w-3' : 'h-4 w-4'} />
          <span className="truncate">{selectedAgent ? selectedAgent.name : compact ? 'Select Agent' : 'Select an agent'}</span>
        </div>
        {loading ? <Loader2 className={cn(compact ? 'h-3 w-3' : 'h-4 w-4', 'animate-spin')} /> : <ChevronDown className={cn(compact ? 'h-3 w-3' : 'h-4 w-4', isOpen && 'rotate-180')} />}
      </Button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className={cn('absolute top-full left-0 mt-2 bg-card border border-border rounded-lg shadow-lg z-50', compact ? 'w-48' : 'w-full min-w-[250px]')}
          >
            <div className="p-2 max-h-64 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="ml-2 text-sm text-muted-foreground">Loading agents...</span>
                </div>
              ) : agents.length === 0 ? (
                <div className="text-center py-4 text-sm text-muted-foreground">No agents available</div>
              ) : (
                <>
                  {selectedAgent && (
                    <button
                      onClick={() => {
                        onAgentChange(null)
                        setIsOpen(false)
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-muted-foreground hover:bg-muted rounded-md transition-colors"
                    >
                      Clear selection
                    </button>
                  )}
                  {agents.map(agent => (
                    <button
                      key={agent.id}
                      onClick={() => {
                        onAgentChange(agent)
                        setIsOpen(false)
                      }}
                      className={cn('w-full text-left px-3 py-2 rounded-md transition-colors', selectedAgent?.id === agent.id ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted')}
                    >
                      <div className="font-medium">{agent.name}</div>
                      {agent.description && <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{agent.description}</div>}
                    </button>
                  ))}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
