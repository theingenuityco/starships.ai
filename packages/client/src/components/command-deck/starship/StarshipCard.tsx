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
  CreditCard,
  AlertTriangle,
  XCircle,
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
import api from '@/lib/api'
import { toast } from 'sonner'

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

  const getStarshipIcon = (starshipClass: 'scout' | 'cruiser' | 'draught') => {
    switch (starshipClass) {
      case 'scout': return '🚀'
      case 'cruiser': return '🛸'
      case 'draught': return '🚢'
      default: return '🚀'
    }
  }

  const getStarshipDescription = (starshipClass: 'scout' | 'cruiser' | 'draught') => {
    switch (starshipClass) {
      case 'scout': return 'Fast and agile vessel designed for exploration and reconnaissance missions.'
      case 'cruiser': return 'Heavy-duty starship built for extended operations and complex multi-agent deployments.'
      case 'draught': return 'Massive flagship vessel for large-scale operations and complex enterprise missions.'
      default: return 'Versatile starship for various mission types.'
    }
  }

  const getClassColor = (starshipClass: 'scout' | 'cruiser' | 'draught') => {
    switch (starshipClass) {
      case 'scout': return 'bg-violet-500/20 text-violet-400 border-violet-500/30'
      case 'cruiser': return 'bg-amber-500/20 text-amber-400 border-amber-500/30'
      case 'draught': return 'bg-red-500/20 text-red-400 border-red-500/30'
      default: return 'bg-slate-500/20 text-slate-400 border-slate-500/30'
    }
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

  const handleRetryPayment = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const response = await api.post(`/api/starships/${starship.id}/retry-payment`)
      if (response.data.checkoutUrl) {
        window.location.href = response.data.checkoutUrl
      }
    } catch (error) {
      console.error('Failed to retry payment:', error)
      toast.error('Failed to create checkout session')
    }
  }

  const handleManageSubscription = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const response = await api.post(`/api/starships/${starship.id}/billing-portal`)
      if (response.data.url) {
        window.location.href = response.data.url
      }
    } catch (error) {
      console.error('Failed to open billing portal:', error)
      toast.error('Failed to open billing portal')
    }
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
                    starship.status === 'active' && 'bg-emerald-50 text-emerald-700 border-emerald-200',
                    starship.status === 'inactive' && 'bg-slate-50 text-slate-700 border-slate-200',
                    starship.status === 'pending_payment' && 'bg-yellow-50 text-yellow-700 border-yellow-200',
                    starship.status === 'restricted' && 'bg-orange-50 text-orange-700 border-orange-200',
                    starship.status === 'disabled' && 'bg-red-50 text-red-700 border-red-200'
                  )}
                >
                  {starship.status === 'active' && 'Active'}
                  {starship.status === 'inactive' && 'Inactive'}
                  {starship.status === 'pending_payment' && 'Payment Required'}
                  {starship.status === 'restricted' && 'Payment Issue'}
                  {starship.status === 'disabled' && 'Subscription Ended'}
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
                  
                  {/* Payment-related actions */}
                  {starship.status === 'pending_payment' && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={handleRetryPayment}
                        className="text-yellow-600"
                      >
                        <CreditCard className="w-4 h-4 mr-2" />
                        Complete Payment
                      </DropdownMenuItem>
                    </>
                  )}
                  
                  {(starship.status === 'restricted' || starship.status === 'disabled') && starship.plan !== 'scout' && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={handleManageSubscription}
                        className="text-orange-600"
                      >
                        <CreditCard className="w-4 h-4 mr-2" />
                        Update Payment
                      </DropdownMenuItem>
                    </>
                  )}
                  
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
          {/* Payment Required Banner */}
          {starship.status === 'pending_payment' && (
            <div className="absolute inset-x-0 top-0 bg-yellow-100/90 border-b border-yellow-200 p-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-yellow-700" />
                <span className="text-xs font-medium text-yellow-800">Payment required to activate</span>
              </div>
              <Button 
                size="sm" 
                variant="ghost" 
                className="h-6 px-2 text-xs text-yellow-700 hover:text-yellow-800"
                onClick={handleRetryPayment}
              >
                Pay Now
              </Button>
            </div>
          )}
          
          {/* Payment Issue Banner */}
          {(starship.status === 'restricted' || starship.status === 'disabled') && starship.plan !== 'scout' && (
            <div className={cn(
              "absolute inset-x-0 top-0 p-2 flex items-center justify-between",
              starship.status === 'restricted' && "bg-orange-100/90 border-b border-orange-200",
              starship.status === 'disabled' && "bg-red-100/90 border-b border-red-200"
            )}>
              <div className="flex items-center gap-2">
                {starship.status === 'restricted' ? (
                  <AlertTriangle className="w-4 h-4 text-orange-700" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-700" />
                )}
                <span className={cn(
                  "text-xs font-medium",
                  starship.status === 'restricted' && "text-orange-800",
                  starship.status === 'disabled' && "text-red-800"
                )}>
                  {starship.status === 'restricted' ? 'Payment issue' : 'Subscription ended'}
                </span>
              </div>
              <Button 
                size="sm" 
                variant="ghost" 
                className={cn(
                  "h-6 px-2 text-xs",
                  starship.status === 'restricted' && "text-orange-700 hover:text-orange-800",
                  starship.status === 'disabled' && "text-red-700 hover:text-red-800"
                )}
                onClick={handleManageSubscription}
              >
                Fix Now
              </Button>
            </div>
          )}
          
          {/* Agent Deployment */}
          <div className={cn(
            "flex items-center",
            (starship.status === 'pending_payment' || starship.status === 'restricted' || starship.status === 'disabled') && starship.plan !== 'scout' && "mt-10"
          )}>
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
