'use client'

import Icon from '@/components/primitives/Icon'

import React from 'react'
import type { AgentModel } from '@starships/protocol'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import AgentAvatar from '@/components/animated/AgentAvatar'
import { Badge } from '@/components/ui/badge'

interface DeployedAgentCardProps {
  agent: AgentModel
  onClick: () => void
}

export function DeployedAgentCard({ agent, onClick }: DeployedAgentCardProps) {
  return (
    <Card className="frosted-glass-card shadow-frosted-lg hover:shadow-frosted-lg group relative overflow-hidden transition-shadow duration-300 cursor-pointer" onClick={onClick}>
      <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
      <CardHeader className="pb-3 relative z-10">
        <div className="mb-1 flex items-center gap-2">
          <Avatar className="h-6 w-6 ring-1 ring-border/40">
            <AgentAvatar seed={agent.name} size={24} />
          </Avatar>
          <CardTitle className="truncate text-base font-semibold">{agent.name}</CardTitle>
        </div>
        <CardDescription className="line-clamp-2 text-xs">{agent.description || 'No description provided'}</CardDescription>
      </CardHeader>
      <CardContent className="relative z-10 pt-0">
        <div className="flex items-center justify-between">
          <Badge variant="secondary" className="text-xs">
            {agent.model || 'N/A'}
          </Badge>
          <div className="flex items-center gap-1 text-muted-foreground">
            <Icon name="fingerprint" className="h-3.5 w-3.5" />
            <span className="text-[10px]">{agent.id.slice(0, 6)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default DeployedAgentCard
