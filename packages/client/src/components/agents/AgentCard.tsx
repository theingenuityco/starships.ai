'use client'

import { Agent, starshipAPI, Starship } from '@/lib/api'
import { useState, useEffect } from 'react'
import {
  Bot,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  Star,
  TestTube,
  BarChart3,
  Code,
  Lightbulb,
  BarChart2,
  HeartPulse,
  Headphones,
  Database,
  PenTool,
  MoreVertical,
  Rocket,
  Loader2,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'

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
  const [starship, setStarship] = useState<Starship | null>(null)
  const [loadingStarship, setLoadingStarship] = useState(false)

  // Fetch starship information if agent has starshipId
  useEffect(() => {
    const fetchStarship = async () => {
      if (!(agent as any)?.starshipId) return

      try {
        setLoadingStarship(true)
        console.log('[AGENT-CARD] Attempting to fetch starship:', (agent as any).starshipId)
        console.log('[AGENT-CARD] Agent details:', {
          id: agent.id,
          name: agent.name,
          starshipId: (agent as any).starshipId,
        })

        const starshipData = await starshipAPI.getStarship((agent as any).starshipId)
        console.log('[AGENT-CARD] Successfully fetched starship:', starshipData.starship.name)
        setStarship(starshipData.starship)
      } catch (error) {
        console.error('[AGENT-CARD] Failed to fetch starship:', {
          starshipId: (agent as any).starshipId,
          agentId: agent.id,
          agentName: agent.name,
          error: error,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          errorStatus: (error as any)?.response?.status,
          timestamp: new Date().toISOString(),
        })
      } finally {
        setLoadingStarship(false)
      }
    }

    fetchStarship()
  }, [(agent as any)?.starshipId])

  const getStarshipIcon = (starshipClass: 'scout' | 'cruiser') => {
    return starshipClass === 'scout' ? '🚀' : '🛸'
  }

  const getStarshipStatusColor = (status: 'active' | 'inactive') => {
    return status === 'active'
      ? 'bg-green-500/20 text-green-400 border-green-500/30'
      : 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  }

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

  const getAvatarBackgroundColor = (category: Agent['category']) => {
    const colors = {
      general: 'bg-gray-200',
      coding: 'bg-gray-200',
      creative: 'bg-gray-200',
      analysis: 'bg-gray-200',
      support: 'bg-gray-200',
    }
    return colors[category] || colors.general
  }
  const getCategoryIcon = (category: Agent['category']) => {
    switch (category) {
      case 'coding':
        return <Code className="w-3.5 h-3.5 mr-1" />
      case 'creative':
        return <Lightbulb className="w-3.5 h-3.5 mr-1" />
      case 'analysis':
        return <BarChart2 className="w-3.5 h-3.5 mr-1" />
      case 'support':
        return <HeartPulse className="w-3.5 h-3.5 mr-1" />
      default:
        return <Bot className="w-3.5 h-3.5 mr-1" />
    }
  }

  const getAgentAvatarIcon = (agent: Agent) => {
    // Determine icon based on agent name or category
    if (agent.name.toLowerCase().includes('support') || agent.category === 'support') {
      return <Headphones className="h-6 w-6" />
    } else if (
      agent.name.toLowerCase().includes('data') ||
      agent.name.toLowerCase().includes('analyst') ||
      agent.category === 'analysis'
    ) {
      return <Database className="h-6 w-6" />
    } else if (agent.name.toLowerCase().includes('creative') || agent.category === 'creative') {
      return <PenTool className="h-6 w-6" />
    } else if (
      agent.name.toLowerCase().includes('code') ||
      agent.name.toLowerCase().includes('coding') ||
      agent.category === 'coding'
    ) {
      return <Code className="h-6 w-6" />
    } else {
      return <Bot className="h-6 w-6" />
    }
  }

  const getAgentAvatarContent = (agent: Agent) => {
    // Determine emoji-like icon based on agent name or category
    if (agent.name.toLowerCase().includes('support') || agent.category === 'support') {
      return '🎧' // Headphones emoji
    } else if (
      agent.name.toLowerCase().includes('data') ||
      agent.name.toLowerCase().includes('analyst') ||
      agent.category === 'analysis'
    ) {
      return '📊' // Bar chart emoji
    } else if (agent.name.toLowerCase().includes('creative') || agent.category === 'creative') {
      return '✏️' // Pencil emoji
    } else if (
      agent.name.toLowerCase().includes('code') ||
      agent.name.toLowerCase().includes('coding') ||
      agent.category === 'coding'
    ) {
      return '🔍' // Magnifying glass emoji
    } else {
      return '🤖' // Robot emoji as default
    }
  }

  return (
    <Card
      className={`
        cursor-pointer transition-all duration-200 hover:shadow-md relative rounded-lg
        ${isSelected ? 'ring-2 ring-primary bg-primary/5' : 'hover:bg-accent/50'}
      `}
      onClick={onClick}
    >
      <div className="px-3 py-5">
        <div className="grid grid-cols-[auto_1fr_auto] gap-4 items-start">
          {/* Left Column: Avatar + Info below it */}
          <div className="flex flex-col items-center space-y-2">
            <Avatar className="h-12 w-12 ring-2 ring-background shadow-sm">
              <AvatarFallback
                className={`
                ${isSelected ? 'bg-primary text-primary-foreground' : `${getAvatarBackgroundColor(agent.category)} text-foreground`}
              `}
              >
                <span className="text-xl">{getAgentAvatarContent(agent)}</span>
              </AvatarFallback>
            </Avatar>

            {/* Version info below avatar */}
            <div className="flex flex-col items-center text-xs text-muted-foreground">
              <span>v{agent.version || '1.0.0'}</span>
            </div>
          </div>

          {/* Center Column: Main content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <h3
                  className={`
                  font-semibold text-base
                  ${isSelected ? 'text-primary' : 'text-foreground'}
                `}
                >
                  {agent.name}
                </h3>
                {!agent.isPublic && <EyeOff className="w-4 h-4 text-muted-foreground" />}
              </div>

              {agent.rating && (
                <div className="flex items-center gap-1">
                  <Star className="w-4 h-4 text-yellow-500 fill-current" />
                  <span className="text-sm font-medium">{agent.rating.toFixed(1)}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 mb-3">
              <Badge className={`text-xs ${getCategoryColor(agent.category)} flex items-center`}>
                {getCategoryIcon(agent.category)}
                {agent.category.charAt(0).toUpperCase() + agent.category.slice(1)}
              </Badge>
              <span className="text-xs text-muted-foreground font-mono bg-secondary/30 px-2 py-0.5 rounded">
                {agent.model}
              </span>
            </div>

            {agent.description && (
              <p className="text-sm text-muted-foreground mb-3 line-clamp-2 leading-relaxed">
                {agent.description}
              </p>
            )}

            {/* Tags display */}
            {agent.tags && agent.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {agent.tags.slice(0, 4).map(tag => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className="text-xs px-1.5 py-0 h-5 rounded bg-secondary/30 border-secondary/50"
                  >
                    {tag.charAt(0).toUpperCase() + tag.slice(1)}
                  </Badge>
                ))}
                {agent.tags.length > 4 && (
                  <Badge
                    variant="outline"
                    className="text-xs px-1.5 py-0 h-5 rounded bg-secondary/30 border-secondary/50"
                  >
                    +{agent.tags.length - 4}
                  </Badge>
                )}
              </div>
            )}
          </div>

          {/* Right Column: Action menu */}
          {showActions && (onEdit || onDelete || onTest || onAnalytics) && (
            <div className="flex flex-col items-center">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={e => e.stopPropagation()}
                    className="h-8 w-8 p-0 rounded-full bg-background/90 hover:bg-primary/10 hover:text-primary shadow-sm border border-border/30 hover:border-primary/50 transition-all duration-200"
                    title="Agent Actions"
                  >
                    <MoreVertical className="w-4 h-4" />
                    <span className="sr-only">Open agent actions menu</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-48 bg-background/95 backdrop-blur-sm border border-border/50 shadow-lg"
                  onClick={e => e.stopPropagation()}
                >
                  {onAnalytics && (
                    <DropdownMenuItem
                      onClick={e => {
                        e.stopPropagation()
                        onAnalytics(agent)
                      }}
                      className="flex items-center gap-2 cursor-pointer hover:bg-primary/10 focus:bg-primary/10"
                    >
                      <BarChart3 className="w-4 h-4 text-muted-foreground" />
                      <span>View Analytics</span>
                    </DropdownMenuItem>
                  )}

                  {onTest && (
                    <DropdownMenuItem
                      onClick={e => {
                        e.stopPropagation()
                        onTest(agent)
                      }}
                      className="flex items-center gap-2 cursor-pointer hover:bg-primary/10 focus:bg-primary/10"
                    >
                      <TestTube className="w-4 h-4 text-muted-foreground" />
                      <span>Test Agent</span>
                    </DropdownMenuItem>
                  )}

                  {onEdit && (
                    <DropdownMenuItem
                      onClick={e => {
                        e.stopPropagation()
                        onEdit(agent)
                      }}
                      className="flex items-center gap-2 cursor-pointer hover:bg-primary/10 focus:bg-primary/10"
                    >
                      <Edit className="w-4 h-4 text-muted-foreground" />
                      <span>Edit Agent</span>
                    </DropdownMenuItem>
                  )}

                  {onDelete && (
                    <>
                      {(onAnalytics || onTest || onEdit) && <DropdownMenuSeparator />}
                      <DropdownMenuItem
                        onClick={e => {
                          e.stopPropagation()
                          onDelete(agent)
                        }}
                        className="flex items-center gap-2 cursor-pointer hover:bg-destructive/10 focus:bg-destructive/10 text-destructive focus:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Delete Agent</span>
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
