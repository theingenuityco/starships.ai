'use client'

import { Agent } from '@/lib/api'
import { Bot, Edit, Trash2, Eye, EyeOff, Star, TestTube, BarChart3 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface AgentCardProps {
  agent: Agent
  isSelected: boolean
  onClick: () => void
  onEdit?: (agent: Agent) => void
  onDelete?: (agent: Agent) => void
  onTest?: (agent: Agent) => void
  onAnalytics?: (agent: Agent) => void
  showActions?: boolean
}

export function AgentCard({
  agent,
  isSelected,
  onClick,
  onEdit,
  onDelete,
  onTest,
  onAnalytics,
  showActions = false,
}: AgentCardProps) {
  const getCategoryColor = (category: Agent['category']) => {
    const colors = {
      general: 'bg-gray-100 text-gray-800',
      coding: 'bg-blue-100 text-blue-800',
      creative: 'bg-purple-100 text-purple-800',
      analysis: 'bg-green-100 text-green-800',
      support: 'bg-orange-100 text-orange-800',
    }
    return colors[category] || colors.general
  }
  return (
    <Card
      className={`
        cursor-pointer transition-all duration-200 hover:shadow-md
        ${isSelected ? 'ring-2 ring-primary bg-primary/5' : 'hover:bg-accent/50'}
      `}
      onClick={onClick}
    >
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-3 flex-1">
            <Avatar className="h-10 w-10">
              <AvatarFallback
                className={`
                ${isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}
              `}
              >
                <Bot className="h-5 w-5" />
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3
                  className={`
                  font-medium text-sm truncate
                  ${isSelected ? 'text-primary' : 'text-foreground'}
                `}
                >
                  {agent.name}
                </h3>

                <Badge className={`text-xs ${getCategoryColor(agent.category)}`}>
                  {agent.category}
                </Badge>

                {!agent.isPublic && <EyeOff className="w-3 h-3 text-muted-foreground" />}

                {agent.rating && (
                  <div className="flex items-center gap-1">
                    <Star className="w-3 h-3 text-yellow-500 fill-current" />
                    <span className="text-xs text-muted-foreground">{agent.rating.toFixed(1)}</span>
                  </div>
                )}
              </div>

              {agent.description && (
                <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                  {agent.description}
                </p>
              )}

              {agent.tags && agent.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {agent.tags.slice(0, 3).map(tag => (
                    <Badge key={tag} variant="outline" className="text-xs px-1 py-0">
                      {tag}
                    </Badge>
                  ))}
                  {agent.tags.length > 3 && (
                    <Badge variant="outline" className="text-xs px-1 py-0">
                      +{agent.tags.length - 3}
                    </Badge>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="bg-secondary/50 px-2 py-1 rounded">{agent.model}</span>

                <div className="flex items-center gap-2">
                  <span>{agent.usageCount || 0} uses</span>
                  <span>v{agent.version || '1.0.0'}</span>
                </div>
              </div>
            </div>
          </div>

          {showActions && (onEdit || onDelete || onTest || onAnalytics) && (
            <div className="flex items-center gap-1 ml-2">
              {onAnalytics && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={e => {
                    e.stopPropagation()
                    onAnalytics(agent)
                  }}
                  title="View Analytics"
                >
                  <BarChart3 className="w-3 h-3" />
                </Button>
              )}

              {onTest && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={e => {
                    e.stopPropagation()
                    onTest(agent)
                  }}
                  title="Test Agent"
                >
                  <TestTube className="w-3 h-3" />
                </Button>
              )}

              {onEdit && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={e => {
                    e.stopPropagation()
                    onEdit(agent)
                  }}
                  title="Edit Agent"
                >
                  <Edit className="w-3 h-3" />
                </Button>
              )}

              {onDelete && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={e => {
                    e.stopPropagation()
                    onDelete(agent)
                  }}
                  className="text-destructive hover:text-destructive"
                  title="Delete Agent"
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
