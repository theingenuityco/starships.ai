'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  MoreHorizontal,
  Edit,
  Trash2,
  Activity,
  Users,
  Command,
  CheckCircle2,
  Bell,
} from 'lucide-react'
import { motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useStarshipStore } from '@/store/starship-store'
import { cn } from '@/lib/utils'
import type { Starship } from '@/lib/api'

interface StarshipCardProps {
  starship: Starship
  isActive: boolean
  viewMode: 'grid' | 'list'
  onSelect: () => void
  onEdit: () => void
  onDelete: () => void
  onStatusChange: () => void
}

export function StarshipCard({
  starship,
  isActive: _isActive,
  viewMode: _viewMode,
  onSelect,
  onEdit,
  onDelete,
  onStatusChange,
}: StarshipCardProps) {
  const router = useRouter()
  const { starshipAgents, getStarshipAgents } = useStarshipStore()
  const [isHovered, setIsHovered] = useState(false)

  // Get agent data for this starship
  const agentData = starshipAgents[starship.id]
  const deployedAgents = agentData?.deployedAgents || []

  // Generate notification status based on starship state
  const getNotificationStatus = () => {
    const activeAgents = deployedAgents.length
    // Use starship ID for consistent pseudo-random behavior
    const seed = starship.id.split('').reduce((a, b) => a + b.charCodeAt(0), 0)
    const hasUnreadEvents = seed % 10 > 7 // Deterministic based on ID
    const eventCount = (seed % 3) + 1

    if (starship.status === 'inactive') {
      return {
        icon: CheckCircle2,
        text: 'Systems standby',
        color: 'text-slate-500',
      }
    }

    if (hasUnreadEvents) {
      return {
        icon: Bell,
        text: eventCount === 1 ? '1 new transmission' : `${eventCount} new transmissions`,
        color: 'text-amber-500',
      }
    }

    if (activeAgents === 0) {
      return {
        icon: CheckCircle2,
        text: 'Ready for deployment',
        color: 'text-emerald-500',
      }
    }

    return {
      icon: CheckCircle2,
      text: 'All systems nominal',
      color: 'text-emerald-500',
    }
  }

  const notificationStatus = getNotificationStatus()

  const getStarshipIcon = (starshipClass: 'scout' | 'cruiser') => {
    return starshipClass === 'scout' ? '🚀' : '🛸'
  }

  const getStarshipDescription = (starshipClass: 'scout' | 'cruiser') => {
    return starshipClass === 'scout'
      ? 'Fast and agile vessel designed for exploration and reconnaissance missions.'
      : 'Heavy-duty starship built for extended operations and complex multi-agent deployments.'
  }

  const getClassColor = (starshipClass: 'scout' | 'cruiser') => {
    return starshipClass === 'scout'
      ? 'bg-violet-500/20 text-violet-400 border-violet-500/30'
      : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
  }

  const handleCardClick = () => {
    onSelect()
    // Load agent data when selecting a starship
    if (!agentData) {
      getStarshipAgents(starship.id)
    }
    // Navigate to the starship's vision chamber
    router.push(`/ship/${starship.slug}/vision-chamber`)
  }

  const handleCommandDeckClick = () => {
    router.push(`/ship/${starship.slug}/command-deck`)
  }

  return (
    <motion.div
      whileHover={{ scale: 1.01, y: -1 }}
      whileTap={{ scale: 0.99 }}
      transition={{ type: 'tween', duration: 0.2, ease: 'easeOut' }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
    >
      <Card
        className={cn(
          'cursor-pointer transition-all duration-300 bg-card/50 backdrop-blur-sm border-border/50 overflow-hidden',
          'h-[240px] flex flex-col', // Fixed height with flex layout
          isHovered && 'shadow-xl border-border/80 bg-card/70',
          'hover:shadow-2xl hover:shadow-primary/5'
        )}
        onClick={handleCardClick}
      >
        {/* Subtle gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5 pointer-events-none" />

        <CardHeader className="pb-0 relative space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Avatar className="w-14 h-14">
                <AvatarFallback className="text-3xl bg-muted border border-border/30">
                  {getStarshipIcon(starship.class)}
                </AvatarFallback>
              </Avatar>
              <div>
                <CardTitle className="text-lg font-bold">{starship.name}</CardTitle>
                <Badge
                  variant="outline"
                  className={cn(
                    'mt-1 text-[10px] px-1.5 py-0.5 h-5',
                    starship.status === 'active'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-slate-50 text-slate-700 border-slate-200'
                  )}
                >
                  {starship.status === 'active' ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" onClick={e => e.stopPropagation()}>
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="bg-background/95 backdrop-blur-sm border-border/50"
                >
                  <DropdownMenuItem
                    onClick={e => {
                      e.stopPropagation()
                      handleCommandDeckClick()
                    }}
                  >
                    <Command className="w-4 h-4 mr-2" />
                    Command Deck
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={e => {
                      e.stopPropagation()
                      onEdit()
                    }}
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={e => {
                      e.stopPropagation()
                      onStatusChange()
                    }}
                  >
                    <Activity className="w-4 h-4 mr-2" />
                    Change Status
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={e => {
                      e.stopPropagation()
                      onDelete()
                    }}
                    className="text-destructive"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Description with ellipsis */}
          <div>
            <p className="text-xs text-muted-foreground line-clamp-2">
              {getStarshipDescription(starship.class)}
            </p>
          </div>
        </CardHeader>

        <CardContent className="pt-3 relative flex-1 flex flex-col justify-between">
          {/* Agent Deployment */}
          <div className="flex items-center">
            <div className="relative flex items-center">
              {/* Stacked avatars */}
              {Array.from({ length: Math.min(3, deployedAgents.length) }).map((_, i) => (
                <Avatar
                  key={i}
                  className={cn(
                    'w-7 h-7 border-2 border-background shadow-sm transition-all duration-200 absolute',
                    // Different background colors for variety
                    i === 0 && '[&>span]:bg-blue-500',
                    i === 1 && '[&>span]:bg-purple-500',
                    i === 2 && '[&>span]:bg-green-500'
                  )}
                  style={{
                    transform: `translateX(${i * -8}px)`,
                    zIndex: 3 - i,
                  }}
                >
                  <AvatarImage src={deployedAgents[i]?.id} />
                  <AvatarFallback className="text-xs font-medium text-white">
                    {deployedAgents[i]?.name ? (
                      deployedAgents[i].name.charAt(0).toUpperCase()
                    ) : (
                      <Users className="w-3 h-3" />
                    )}
                  </AvatarFallback>
                </Avatar>
              ))}

              {/* "+X more" indicator */}
              {deployedAgents.length > 3 && (
                <Avatar
                  className="w-7 h-7 border-2 border-background shadow-sm"
                  style={{
                    transform: `translateX(${3 * -8}px)`,
                    zIndex: 0,
                  }}
                >
                  <AvatarFallback className="bg-muted text-xs font-medium text-muted-foreground">
                    +{deployedAgents.length - 3}
                  </AvatarFallback>
                </Avatar>
              )}

              {/* Empty state */}
              {deployedAgents.length === 0 && (
                <div className="flex items-center space-x-2 text-muted-foreground">
                  <Avatar className="w-7 h-7 border-2 border-dashed border-muted-foreground/30">
                    <AvatarFallback className="bg-transparent">
                      <Users className="w-3 h-3" />
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-xs">Ready for deployment</span>
                </div>
              )}

              {/* Spacing for overlapped avatars */}
              <div
                style={{
                  width: `${Math.max(0, Math.min(3, deployedAgents.length) * 8 + (deployedAgents.length > 3 ? 8 : 0))}px`,
                }}
              />
            </div>
          </div>

          {/* Status Notification */}
          <div className="flex items-center justify-between pt-3 border-t border-border/50">
            <div className="flex items-center space-x-2 text-xs">
              <notificationStatus.icon className={cn('w-3 h-3', notificationStatus.color)} />
              <span className={notificationStatus.color}>{notificationStatus.text}</span>
            </div>
            <Badge
              variant="outline"
              className={cn('text-xs px-2 py-0.5 capitalize', getClassColor(starship.class))}
            >
              {starship.class}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
