'use client'

import Icon from '@/components/primitives/Icon'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Avatar } from '@/components/ui/avatar'
import AgentAvatar from '@/components/animated/AgentAvatar'
import { useStarshipAgents } from '@/hooks/useAgents'
import { useMessageAttachments } from '@/hooks/useFileUpload'
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

  const avatarAttachmentIds = useMemo(() => {
    const ids = agents.map(a => (a as any).avatarAttachmentId as string | undefined).filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    return Array.from(new Set(ids))
  }, [agents])

  const { data: avatarAttachments = [] } = useMessageAttachments(avatarAttachmentIds, starshipId)

  const avatarUrlById = useMemo(() => {
    const map = new Map<string, string>()
    for (const a of avatarAttachments) {
      if (a.previewUrl) map.set(a.id, a.previewUrl)
    }
    return map
  }, [avatarAttachments])

  // Auto-select first agent when agents are loaded
  useEffect(() => {
    if (!loading && agents.length > 0 && !selectedAgent) {
      onAgentChange(agents[0])
    }
  }, [agents, loading, selectedAgent, onAgentChange])

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            // Match ConversationMessageInput container styling
            'justify-between bg-card border border-border/60 rounded-2xl shadow-sm transition-all hover:bg-card focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary/70',
            // Match ConversationMessageInput inner padding: minimal => px-2 py-2, default => px-3 py-3
            compact ? 'h-auto px-2 py-1.5 text-xs min-w-[140px]' : 'h-auto px-3 py-2 text-sm min-w-[220px]'
          )}
          disabled={loading}
        >
          <div className="flex items-center gap-2 min-w-0">
            {selectedAgent ? (
              <Avatar className={cn(compact ? 'h-5 w-5' : 'h-6 w-6', 'ring-1 ring-border/40 rounded-full')}>
                <AgentAvatar
                  seed={selectedAgent.name}
                  imageUrl={avatarUrlById.get((selectedAgent as any).avatarAttachmentId)}
                  size={compact ? 20 : 24}
                  rounded
                />
              </Avatar>
            ) : (
              <Icon name="bot" className={compact ? 'h-3 w-3' : 'h-4 w-4'} />
            )}
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
                    <Avatar className={cn('h-7 w-7 ring-1 ring-border/40 rounded-full')}>
                      <AgentAvatar seed={agent.name} imageUrl={avatarUrlById.get((agent as any).avatarAttachmentId)} size={28} rounded />
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
