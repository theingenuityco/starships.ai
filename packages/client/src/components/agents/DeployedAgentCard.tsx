'use client'

import Icon from '@/components/primitives/Icon'

import React from 'react'
import type { AgentModel } from '@starships/protocol'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import AgentAvatar from '@/components/animated/AgentAvatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface DeployedAgentCardProps {
  agent: AgentModel
  onClick: () => void
  onChat?: (agent: AgentModel) => void
  onEdit?: (agent: AgentModel) => void
  onDelete?: (agent: AgentModel) => void
  showActions?: boolean
  hideChatControl?: boolean
}

export function DeployedAgentCard({ agent, onClick, onChat, onEdit, onDelete, showActions = false, hideChatControl = false }: DeployedAgentCardProps) {
  // Check if this is a system agent (Gaia or Daedalus)
  const isSystemAgent = agent.name === 'Gaia' || agent.name === 'Daedalus'
  
  return (
    <Card className="frosted-glass-card shadow-frosted-lg hover:shadow-frosted-xl group relative overflow-hidden transition-all duration-300 cursor-pointer border-border/20 hover:border-border/40" onClick={onClick}>
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
      
      {/* Actions dropdown - moved outside header */}
      {showActions && onDelete && (
        <div className="absolute top-2 right-2 z-30">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 bg-transparent hover:bg-white/20 rounded-full"
                onClick={e => e.stopPropagation()}
              >
                <span className="text-white text-lg font-bold leading-none">⋮</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              {onDelete && !isSystemAgent && (
                <DropdownMenuItem
                  onClick={e => {
                    e.stopPropagation()
                    onDelete(agent)
                  }}
                  className="flex items-center gap-2 cursor-pointer hover:bg-destructive/10 focus:bg-destructive/10 text-destructive focus:text-destructive"
                >
                  <Icon name="trash" className="w-4 h-4" />
                  <span>Delete Agent</span>
                </DropdownMenuItem>
              )}
              
              {onDelete != null && isSystemAgent && (
                <DropdownMenuItem
                  disabled
                  className="flex items-center gap-2 opacity-50"
                >
                  <Icon name="shield" className="w-4 h-4" />
                  <span>Protected Agent</span>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      
      <CardHeader className="pb-3 relative z-10">
        <div className="mb-1 flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Avatar className="h-6 w-6 ring-1 ring-border/40">
              <AgentAvatar seed={agent.name} size={24} />
            </Avatar>
            <CardTitle className="truncate text-base font-semibold">{agent.name}</CardTitle>
            {isSystemAgent && (
              <Badge variant="outline" className="text-[10px] px-1 py-0">
                System
              </Badge>
            )}
          </div>
        </div>
        <CardDescription className="line-clamp-2 text-xs">{agent.description || 'No description provided'}</CardDescription>
      </CardHeader>
      <CardContent className="relative z-10 pt-0">
        <div className="flex items-center justify-between">
          <Badge variant="secondary" className="text-xs">
            {agent.model || 'N/A'}
          </Badge>
          {onChat ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-8"
              onClick={e => {
                e.stopPropagation()
                onChat(agent)
              }}
            >
              <Icon name="message-square" className="mr-1 h-3.5 w-3.5" />
              Chat
            </Button>
          ) : hideChatControl ? null : (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Icon name="fingerprint" className="h-3.5 w-3.5" />
              <span className="text-[10px]">{agent.id.slice(0, 6)}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default DeployedAgentCard
