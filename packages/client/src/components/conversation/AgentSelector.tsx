'use client'

import Icon from '@/components/primitives/Icon'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Avatar } from '@/components/ui/avatar'
import AgentAvatar from '@/components/animated/AgentAvatar'
import { useStarshipAgents } from '@/hooks/useAgents'
import { useMessageAttachments } from '@/hooks/useFileUpload'
import { cn } from '@/lib/utils'
import { formatAgentDisplayName } from '@/lib/agentDisplay'
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

  const defaultAgent = useMemo(() => {
    if (!Array.isArray(agents) || agents.length === 0) return null
    const aria = agents.find(a => typeof a.slug === 'string' && a.slug.toLowerCase().startsWith('aria'))
    return aria ?? agents[0] ?? null
  }, [agents])

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

  // Auto-select default agent (prefer aria*) when agents are loaded
  useEffect(() => {
    if (!loading && !selectedAgent && defaultAgent) {
      onAgentChange(defaultAgent)
    }
  }, [defaultAgent, loading, selectedAgent, onAgentChange])

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          aria-label={selectedAgent ? `Selected agent: ${formatAgentDisplayName(selectedAgent)}. Change agent.` : 'Select an agent'}
          className={cn(
            // Match ConversationMessageInput container styling
            'justify-between bg-card border border-border/60 rounded-2xl shadow-sm transition-all hover:bg-card focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary/70',
            // Match ConversationMessageInput inner padding: minimal => pl-3 pr-2 py-2, default => px-3 py-3
            compact ? 'h-auto px-2 py-1 text-xs min-w-[120px]' : 'h-auto px-3 py-2 text-sm min-w-[220px]'
          )}
          disabled={loading}
        >
          <div className="flex items-center gap-2 min-w-0">
            {selectedAgent ? (
              <Avatar className={cn(compact ? 'h-4.5 w-4.5' : 'h-6 w-6', 'ring-1 ring-border/40 rounded-full')}>
                <AgentAvatar
                  seed={selectedAgent.name}
                  imageUrl={avatarUrlById.get((selectedAgent as any).avatarAttachmentId)}
                  size={compact ? 18 : 24}
                  rounded
                />
              </Avatar>
            ) : (
              <Icon name="bot" className={compact ? 'h-3 w-3' : 'h-4 w-4'} />
            )}
            <span className="truncate">{selectedAgent ? formatAgentDisplayName(selectedAgent) : compact ? 'Select Agent' : 'Select an agent'}</span>
          </div>
          {loading ? <LoadingSpinner className={cn(compact ? 'h-3 w-3' : 'h-4 w-4')} /> : <Icon name="chevron-down" className={cn(compact ? 'h-3 w-3' : 'h-4 w-4', isOpen && 'rotate-180')} />}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={8}
        aria-label="Agent options"
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
                    // Match NavigationItem hover/active styling
                    'w-full text-left px-3 py-2 rounded-lg transition-colors focus-visible-ring',
                    selectedAgent?.id === agent.id
                      ? 'text-primary bg-primary/10 border-transparent'
                      : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-primary/15 hover:shadow-sm'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Avatar className={cn('h-11 w-11 ring-1 ring-border/40 rounded-full flex-shrink-0')}>
                      <AgentAvatar seed={agent.name} imageUrl={avatarUrlById.get((agent as any).avatarAttachmentId)} size={44} rounded />
                    </Avatar>
                    <div className="min-w-0 flex flex-col">
                      <div className="font-medium leading-5 text-foreground">{formatAgentDisplayName(agent)}</div>
                      <div className="mt-0.5 text-xs leading-4 text-muted-foreground line-clamp-2">
                        {typeof (agent as any)?.description === 'string' && (agent as any).description.trim().length > 0 ? (agent as any).description.trim() : 'No description'}
                      </div>
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
