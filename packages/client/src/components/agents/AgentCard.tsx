'use client'

import { Agent } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { Bot, Clock } from 'lucide-react'

interface AgentCardProps {
  agent: Agent
  isSelected: boolean
  onClick: () => void
}

export function AgentCard({ agent, isSelected, onClick }: AgentCardProps) {
  return (
    <button
      onClick={onClick}
      className={`
        w-full p-4 text-left rounded-lg border transition-all duration-200
        ${isSelected 
          ? 'bg-primary/10 border-primary shadow-sm' 
          : 'bg-background border-border hover:bg-muted/50 hover:border-muted-foreground/20'
        }
      `}
    >
      <div className="flex items-start space-x-3">
        <div className={`
          w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0
          ${isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}
        `}>
          <Bot className="w-5 h-5" />
        </div>
        
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
            <Clock className="w-3 h-3 mr-1" />
            <span>Created {formatDate(agent.createdAt)}</span>
          </div>
        </div>
      </div>
    </button>
  )
} 