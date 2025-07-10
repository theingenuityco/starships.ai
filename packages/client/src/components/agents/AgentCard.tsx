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
      <div className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-4 flex-1">
            <Avatar className="h-12 w-12 ring-2 ring-background shadow-sm">
              <AvatarFallback
                className={`
                ${isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}
              `}
              >
                <Bot className="h-6 w-6" />
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-2">
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

                {!agent.isPublic && (
                  <span className="inline-flex items-center">
                    <EyeOff className="w-3 h-3 text-muted-foreground mr-1" />
                    <span className="text-xs text-muted-foreground">Private</span>
                  </span>
                )}

                {agent.rating && (
                  <div className="flex items-center gap-1">
                    <Star className="w-3 h-3 text-yellow-500 fill-current" />
                    <span className="text-xs text-muted-foreground">{agent.rating.toFixed(1)}</span>
                  </div>
                )}
              </div>

              {agent.description && (
                <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
                  {agent.description}
                </p>
              )}

              {agent.tags && agent.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {agent.tags.slice(0, 3).map(tag => (
                    <Badge key={tag} variant="outline" className="text-xs px-2 py-0.5 rounded-md">
                      {tag}
                    </Badge>
                  ))}
                  {agent.tags.length > 3 && (
                    <Badge variant="outline" className="text-xs px-2 py-0.5 rounded-md">
                      +{agent.tags.length - 3}
                    </Badge>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="bg-secondary/50 px-2.5 py-1 rounded-md font-mono">
                  {agent.model}
                </span>

                <div className="flex items-center gap-3">
                  <span className="flex items-center">
                    <svg
                      className="w-3 h-3 mr-1 text-muted-foreground/70"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    {agent.usageCount || 0} uses
                  </span>
                  <span className="flex items-center">
                    <svg
                      className="w-3 h-3 mr-1 text-muted-foreground/70"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2z"
                      />
                    </svg>
                    v{agent.version || '1.0.0'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {showActions && (onEdit || onDelete || onTest || onAnalytics) && (
            <div className="flex items-center gap-2 ml-3">
              {onAnalytics && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={e => {
                    e.stopPropagation()
                    onAnalytics(agent)
                  }}
                  title="View Analytics"
                  className="h-8 w-8 p-0 rounded-full"
                >
                  <BarChart3 className="w-4 h-4" />
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
                  className="h-8 w-8 p-0 rounded-full"
                >
                  <TestTube className="w-4 h-4" />
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
                  className="h-8 w-8 p-0 rounded-full"
                >
                  <Edit className="w-4 h-4" />
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
                  className="text-destructive hover:text-destructive h-8 w-8 p-0 rounded-full"
                  title="Delete Agent"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
