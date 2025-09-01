'use client';

import React from 'react';
import type { AgentModel } from '@starships/protocol';
import {
  Bot,
  Edit,
  Trash2,
  EyeOff,
  Star,
  TestTube,
  BarChart3,
  Code,
  Lightbulb,
  BarChart2,
  HeartPulse,
  MoreVertical,
  Sparkles,
  Brain,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

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
  const getCategoryColor = (category: AgentModel['category']) => {
    const colors = {
      general: 'bg-gradient-to-r from-gray-500/10 to-gray-500/20 text-gray-700 dark:text-gray-300 border-gray-500/30',
      coding: 'bg-gradient-to-r from-blue-500/10 to-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/30',
      creative: 'bg-gradient-to-r from-purple-500/10 to-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-500/30',
      analysis: 'bg-gradient-to-r from-green-500/10 to-green-500/20 text-green-700 dark:text-green-300 border-green-500/30',
      support: 'bg-gradient-to-r from-orange-500/10 to-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-500/30',
    }
    return colors[category] || colors.general
  }

  const getAvatarBackgroundColor = (category: AgentModel['category']) => {
    const colors = {
      general: 'bg-gradient-to-br from-gray-500/20 to-gray-500/30',
      coding: 'bg-gradient-to-br from-blue-500/20 to-blue-500/30',
      creative: 'bg-gradient-to-br from-purple-500/20 to-purple-500/30',
      analysis: 'bg-gradient-to-br from-green-500/20 to-green-500/30',
      support: 'bg-gradient-to-br from-orange-500/20 to-orange-500/30',
    }
    return colors[category] || colors.general
  }
  const getCategoryIcon = (category: AgentModel['category']) => {
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


  const getAgentAvatarContent = (agent: AgentModel) => {
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
    <div className="transition-all duration-200">
      <Card
        className={`
          cursor-pointer transition-all duration-300 hover:shadow-xl relative rounded-xl overflow-hidden group border-2
          ${isSelected 
            ? 'ring-2 ring-primary bg-gradient-to-br from-primary/10 to-primary/5 border-primary/70 shadow-lg shadow-primary/20' 
            : 'hover:bg-gradient-to-br hover:from-card hover:to-primary/5 border-border hover:border-primary/70'
          }
        `}
        onClick={onClick}
      >
        
        <div className="px-3 py-3">
          <div className="grid grid-cols-[auto_1fr_auto] gap-3 items-start">
          {/* Left Column: Enhanced Avatar */}
          <div className="flex flex-col items-center space-y-2">
            <div className="relative">
              <div className={`absolute inset-0 ${isSelected ? 'bg-primary/10' : 'bg-muted/10'} blur-sm`} />
              <Avatar className="h-10 w-10 ring-2 ring-background shadow-lg relative">
                <AvatarFallback
                  className={`
                  ${isSelected 
                    ? 'bg-gradient-to-br from-primary to-primary/80 text-primary-foreground' 
                    : `${getAvatarBackgroundColor(agent.category)} text-foreground`
                  }
                `}
                >
                  <span className="text-base">{getAgentAvatarContent(agent)}</span>
                </AvatarFallback>
              </Avatar>
              {/* Online indicator */}
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-background animate-pulse" />
            </div>

          </div>

          {/* Center Column: Main content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <h3
                  className={`
                  font-bold text-base
                  ${isSelected ? 'text-primary' : 'text-foreground'}
                  group-hover:text-primary transition-colors
                `}
                >
                  {agent.name}
                </h3>
                {!agent.isPublic && (
                  <div className="p-1 bg-muted/50 rounded">
                    <EyeOff className="w-3 h-3 text-muted-foreground" />
                  </div>
                )}
              </div>

              {agent.rating && (
                <div className="flex items-center gap-1 bg-yellow-500/10 px-2 py-1 rounded-md">
                  <Star className="w-3.5 h-3.5 text-yellow-500 fill-current" />
                  <span className="text-xs font-bold text-yellow-700 dark:text-yellow-300">{agent.rating.toFixed(1)}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 mb-2">
              <Badge className={`text-xs ${getCategoryColor(agent.category)} flex items-center border font-semibold`}>
                {getCategoryIcon(agent.category)}
                {agent.category.charAt(0).toUpperCase() + agent.category.slice(1)}
              </Badge>
              <div className="flex items-center gap-1 bg-muted/50 px-2 py-1 rounded-md">
                <Brain className="w-3 h-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground font-mono">
                  {agent.model}
                </span>
              </div>
            </div>

            {agent.description && (
              <p className="text-xs text-muted-foreground mb-2 line-clamp-2 leading-relaxed group-hover:text-foreground/80 transition-colors">
                {agent.description}
              </p>
            )}

            {/* Enhanced Tags display */}
            {agent.tags && agent.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {agent.tags?.slice(0, 3).map((tag: any) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 h-4 rounded-full bg-muted/30 border-muted-foreground/20 hover:bg-muted/50 transition-colors"
                  >
                    <Sparkles className="w-2.5 h-2.5 mr-1" />
                    {tag.charAt(0).toUpperCase() + tag.slice(1)}
                  </Badge>
                ))}
                {agent.tags.length > 3 && (
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 h-4 rounded-full bg-primary/10 border-primary/30 text-primary font-semibold"
                  >
                    +{agent.tags.length - 3} more
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
      
      {/* Hover effect overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
    </Card>
    </div>
  )
}
