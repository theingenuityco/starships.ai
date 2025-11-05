'use client'

import Icon from '@/components/primitives/Icon'

import React from 'react'
import type { AgentModel } from '@starships/protocol'
import { motion } from 'motion/react'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import AgentAvatar from '@/components/animated/AgentAvatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

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
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} whileHover={{ y: -4 }} transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }} className="h-full">
      <Card
        className="frosted-glass-card shadow-frosted-lg group relative overflow-hidden transition-all duration-300 cursor-pointer border-2 border-border/30 hover:border-violet-500/50 backdrop-blur-xl h-full flex flex-col"
        onClick={onClick}
      >
        {/* Space-themed radial gradient overlay - matching landing screen */}
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
          style={{
            backgroundImage: [
              // Core glow - purple/violet (brightest)
              'radial-gradient(ellipse 400px 300px at 50% 0%, rgba(168,85,247,0.25), transparent 60%)',
              // Secondary layer - blue/purple blend
              'radial-gradient(ellipse 500px 350px at 50% 0%, rgba(139,92,246,0.18), transparent 65%)',
              // Outer spread - indigo/blue
              'radial-gradient(ellipse 600px 400px at 50% 0%, rgba(99,102,241,0.12), transparent 70%)',
            ].join(', '),
          }}
        />

        {/* Space-themed decorative corner accent with purple gradient */}
        <div
          className="absolute top-0 right-0 w-24 h-24 rounded-bl-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 80px 80px at top right, rgba(168,85,247,0.35), transparent 70%)',
          }}
        />

        {/* Animated border glow on hover with purple/violet */}
        <div
          className="absolute inset-0 rounded-lg pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          style={{
            border: '2px solid transparent',
            background: 'linear-gradient(hsl(var(--card)), hsl(var(--card))) padding-box, linear-gradient(135deg, rgba(168,85,247,0.3), rgba(139,92,246,0.4), rgba(99,102,241,0.3)) border-box',
          }}
        />

        {/* Shimmer effect on hover with purple tint */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div
            className="absolute inset-y-0 w-1/2 -translate-x-full group-hover:translate-x-[300%] transition-transform duration-[800ms] ease-in-out"
            style={{
              background: 'linear-gradient(to right, transparent, rgba(168,85,247,0.15), rgba(139,92,246,0.1), transparent)',
            }}
          />
        </div>

        {/* Actions dropdown */}
        {showActions && onDelete && (
          <div className="absolute top-3 right-3 z-30">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 bg-background/80 hover:bg-background/90 backdrop-blur-sm rounded-full border border-border/40 hover:border-primary/50 transition-all duration-200 shadow-sm hover:shadow-md"
                  onClick={e => e.stopPropagation()}
                >
                  <Icon name="dots-vertical" className="h-4 w-4" />
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
                  <DropdownMenuItem disabled className="flex items-center gap-2 opacity-50">
                    <Icon name="shield" className="w-4 h-4" />
                    <span>Protected Agent</span>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        <CardHeader className="pb-4 relative z-10 pt-5">
          <div className="flex items-start gap-3 mb-3">
            {/* Enhanced Avatar with purple/violet glow effect */}
            <div className="relative flex-shrink-0">
              {/* Purple/violet glow ring on hover */}
              <motion.div
                className="absolute inset-0 rounded-full blur-xl opacity-0 group-hover:opacity-100"
                style={{
                  background: 'radial-gradient(circle, rgba(168,85,247,0.4), rgba(139,92,246,0.2), transparent 70%)',
                }}
                animate={{ scale: [1, 1.15, 1] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              />
              <Avatar
                className="h-12 w-12 transition-all duration-300 relative z-10 shadow-lg"
                style={{
                  boxShadow: '0 0 0 2px rgba(168,85,247,0.2), 0 4px 12px rgba(168,85,247,0.15)',
                }}
              >
                <AgentAvatar seed={agent.name} size={48} />
              </Avatar>
              <motion.div
                className="absolute inset-0 rounded-full pointer-events-none opacity-0 group-hover:opacity-100"
                style={{
                  boxShadow: '0 0 0 3px rgba(168,85,247,0.4)',
                }}
                animate={{
                  scale: [1, 1.15, 1],
                  opacity: [0.6, 0.8, 0.6],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />
              {/* Online/Active indicator */}
              <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-card shadow-md z-20">
                <motion.div className="absolute inset-0 bg-green-400 rounded-full" animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }} transition={{ duration: 2, repeat: Infinity }} />
              </div>
            </div>

            {/* Agent name and badge */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <CardTitle className="truncate text-lg font-bold transition-all duration-300 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-violet-400 group-hover:via-purple-400 group-hover:to-indigo-400">
                  {agent.name}
                </CardTitle>
                {isSystemAgent && (
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0.5"
                    style={{
                      borderColor: 'rgba(168,85,247,0.4)',
                      backgroundColor: 'rgba(168,85,247,0.15)',
                      color: 'rgba(168,85,247,1)',
                    }}
                  >
                    <Icon name="shield" className="w-2.5 h-2.5 mr-1" />
                    System
                  </Badge>
                )}
              </div>
              <CardDescription className="line-clamp-2 text-sm text-muted-foreground leading-relaxed group-hover:text-foreground/80 transition-colors duration-200">
                {agent.description || 'No description provided'}
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="relative z-10 pt-0 pb-5 mt-auto">
          <div className="flex items-center justify-between">
            {/* Model badge with purple/violet styling */}
            <Badge
              variant="secondary"
              className="text-xs flex items-center gap-1.5 px-2.5 py-1 transition-all duration-200"
              style={{
                backgroundColor: 'rgba(139,92,246,0.15)',
                borderColor: 'rgba(168,85,247,0.3)',
                borderWidth: '1px',
                borderStyle: 'solid',
              }}
            >
              <Icon name="brain" className="w-3.5 h-3.5" style={{ color: 'rgba(168,85,247,0.9)' }} />
              <span className="font-mono text-xs">{agent.model || 'N/A'}</span>
            </Badge>

            {/* Chat button with purple/violet gradient styling */}
            {onChat ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-9 px-3 font-medium transition-all duration-200 shadow-sm hover:shadow-md group-hover:scale-105"
                style={{
                  background: 'linear-gradient(135deg, rgba(168,85,247,0.15), rgba(139,92,246,0.1))',
                  border: '1px solid rgba(168,85,247,0.3)',
                  color: 'rgba(168,85,247,1)',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, rgba(168,85,247,0.25), rgba(139,92,246,0.2))'
                  e.currentTarget.style.borderColor = 'rgba(168,85,247,0.5)'
                  e.currentTarget.style.boxShadow = '0 0 12px rgba(168,85,247,0.3)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, rgba(168,85,247,0.15), rgba(139,92,246,0.1))'
                  e.currentTarget.style.borderColor = 'rgba(168,85,247,0.3)'
                  e.currentTarget.style.boxShadow = '0 0 0 rgba(168,85,247,0)'
                }}
                onClick={e => {
                  e.stopPropagation()
                  onChat(agent)
                }}
              >
                <Icon name="message-square" className="mr-1.5 h-4 w-4" />
                Chat
              </Button>
            ) : hideChatControl ? null : (
              <div className="flex items-center gap-1.5 text-muted-foreground px-2 py-1 rounded-md bg-muted/30">
                <Icon name="fingerprint" className="h-3.5 w-3.5" />
                <span className="text-[10px] font-mono">{agent.id.slice(0, 6)}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

export default DeployedAgentCard
