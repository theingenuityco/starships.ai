'use client'

import Icon from '@/components/primitives/Icon'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Avatar } from '@/components/ui/avatar'
import AnimatedAvatar from '@/components/animated/AnimatedAvatar'
import { useStarshipAgents } from '@/hooks/useAgents'
import { cn } from '@/lib/utils'
import type { AgentModel } from '@starships/protocol'

import LoadingSpinner from '@/components/primitives/LoadingSpinner'
import { useEffect, useMemo, useState } from 'react'

interface AgentSelectorProps {
  selectedAgent: AgentModel | null
  onAgentChange: (agent: AgentModel | null) => void
  starshipId?: string
  compact?: boolean
}

export function AgentSelector({ selectedAgent, onAgentChange, starshipId, compact = false }: AgentSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const { data: agentsData = [], isLoading: loading } = useStarshipAgents(starshipId || '')

  // Memoize agents array to prevent unnecessary rerenders
  const agents = useMemo(() => agentsData, [agentsData])

  // Auto-select first agent when agents are loaded
  useEffect(() => {
    if (!loading && agents.length > 0 && !selectedAgent) {
      onAgentChange(agents[0])
    }
  }, [agents, loading, selectedAgent, onAgentChange])

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn('justify-between', compact ? 'h-8 px-3 text-xs min-w-[120px]' : 'min-w-[180px]')} disabled={loading}>
          <div className="flex items-center gap-2">
            <Icon name="bot" className={compact ? 'h-3 w-3' : 'h-4 w-4'} />
            <span className="truncate">{selectedAgent ? selectedAgent.name : compact ? 'Select Agent' : 'Select an agent'}</span>
          </div>
          {loading ? <LoadingSpinner className={cn(compact ? 'h-3 w-3' : 'h-4 w-4')} /> : <Icon name="chevron-down" className={cn(compact ? 'h-3 w-3' : 'h-4 w-4', isOpen && 'rotate-180')} />}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={8}
        className={cn('p-0 rounded-lg shadow-frosted-lg text-sm leading-6', compact ? 'w-80' : 'min-w-[320px] w-[min(420px,calc(100vw-40px))]')}
      >
        <div className="p-2 max-h-64 overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <LoadingSpinner className="h-4 w-4" />
              <span className="ml-2 text-sm text-muted-foreground">Loading agents...</span>
            </div>
          ) : agents.length === 0 ? (
            <div className="text-center py-4 text-sm text-muted-foreground">No agents available</div>
          ) : (
            <>
              {agents.map(agent => (
                <button
                  key={agent.id}
                  onClick={() => {
                    onAgentChange(agent)
                    setIsOpen(false)
                  }}
                  className={cn(
                    'w-full text-left px-3 py-2 rounded-sm transition-colors focus-visible-ring',
                    selectedAgent?.id === agent.id ? 'bg-primary/5 text-foreground' : 'text-foreground hover:bg-primary/5'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Avatar className={cn('h-7 w-7 ring-1 ring-border/40')}>
                      <AnimatedAvatar seed={agent.id} name={agent.name} size={28} />
                    </Avatar>
                    <div className="min-w-0">
                      <div className="font-medium leading-5">{agent.name}</div>
                      {agent.description && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{agent.description}</div>}
                    </div>
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
