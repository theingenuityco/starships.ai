'use client'

import { useState, useEffect } from 'react'
import { Check, ChevronDown, Bot } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { useAgents } from '@/hooks/useAgents'
import type { Agent } from '@/lib/api'
import { cn } from '@/lib/utils'

interface AgentSelectorProps {
  selectedAgent: Agent | null
  onAgentChange: (agent: Agent | null) => void
  starshipId?: string
}

export function AgentSelector({ selectedAgent, onAgentChange, starshipId }: AgentSelectorProps) {
  const { agents, loading, error } = useAgents(starshipId)
  const [open, setOpen] = useState(false)

  // Auto-select first agent if none selected
  useEffect(() => {
    if (!selectedAgent && agents.length > 0) {
      onAgentChange(agents[0])
    }
  }, [agents, selectedAgent, onAgentChange])

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg border border-border/40">
        <div className="w-4 h-4 bg-muted animate-pulse rounded" />
        <span className="text-sm text-muted-foreground">Loading agents...</span>
      </div>
    )
  }

  if (error || agents.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-destructive/10 rounded-lg border border-destructive/20">
        <Bot className="w-4 h-4 text-destructive" />
        <span className="text-sm text-destructive">
          {error ? 'Failed to load agents' : 'No agents available'}
        </span>
      </div>
    )
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2 min-w-[200px] justify-between">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4" />
            <span className="truncate">
              {selectedAgent ? selectedAgent.name : 'Select Agent'}
            </span>
            {selectedAgent && (
              <Badge variant="secondary" className="text-xs">
                {selectedAgent.model}
              </Badge>
            )}
          </div>
          <ChevronDown className="w-4 h-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent align="end" className="min-w-[300px]">
        {agents.map((agent) => (
          <DropdownMenuItem
            key={agent.id}
            onClick={() => {
              onAgentChange(agent)
              setOpen(false)
            }}
            className="flex items-start gap-3 p-3 cursor-pointer"
          >
            <div className="flex items-center justify-center w-8 h-8 bg-primary/10 rounded-lg flex-shrink-0 mt-0.5">
              <Bot className="w-4 h-4 text-primary" />
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium truncate">{agent.name}</span>
                {selectedAgent?.id === agent.id && (
                  <Check className="w-4 h-4 text-primary" />
                )}
              </div>
              
              <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
                {agent.description || 'AI Assistant'}
              </p>
              
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="secondary" className="text-xs">
                  {agent.model}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {agent.systemPrompt ? 'Custom prompt' : 'Default prompt'}
                </span>
              </div>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}