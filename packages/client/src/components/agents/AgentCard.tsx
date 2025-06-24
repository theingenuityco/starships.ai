'use client'

import { Agent } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { Bot, Clock } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { AGENT_TEXT } from '@/constants/text'

interface AgentCardProps {
  agent: Agent
  isSelected: boolean
  onClick: () => void
}

export function AgentCard({ agent, isSelected, onClick }: AgentCardProps) {
  return (
    <Card
      className={`
        cursor-pointer transition-all duration-200 hover:shadow-md
        ${isSelected 
          ? 'ring-2 ring-primary bg-primary/5' 
          : 'hover:bg-accent/50'
        }
      `}
      onClick={onClick}
    >
      <div className="p-4">
        <div className="flex items-start space-x-3">
          <Avatar className="h-10 w-10">
            <AvatarFallback className={`
              ${isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}
            `}>
              <Bot className="h-5 w-5" />
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 min-w-0">
            <h3 className={`
              font-medium text-sm truncate
              ${isSelected ? 'text-primary' : 'text-foreground'}
            `}>
              {agent.name}
            </h3>
            
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {agent.description}
            </p>
            
            <div className="flex items-center mt-2 text-xs text-muted-foreground">
              <Clock className="h-3 w-3 mr-1" />
              <span>{AGENT_TEXT.CREATED_PREFIX} {formatDate(agent.createdAt)}</span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
} 