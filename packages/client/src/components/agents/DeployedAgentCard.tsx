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
  avatarUrl?: string
  onClick: () => void
  onChat?: (agent: AgentModel) => void
  onEdit?: (agent: AgentModel) => void
  onDelete?: (agent: AgentModel) => void
  onGenerateAvatar?: (agent: AgentModel, options?: { mode?: 'avatar_only' | 'full_chain' }) => void
  showActions?: boolean
  hideChatControl?: boolean
}

export function DeployedAgentCard({ agent, avatarUrl, onClick, onChat, onEdit, onDelete, onGenerateAvatar, showActions = false, hideChatControl = false }: DeployedAgentCardProps) {
  // Check if this is a template-based agent (has sourceTemplateId) - these are protected
  const isTemplateAgent = !!agent.sourceTemplateId

  // Get update info from agent object (populated by API)
  const needsUpdate = isTemplateAgent && agent.updateInfo?.needsUpdate

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} whileHover={{ y: -4 }} transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }} className="h-full">
      <Card
        className="frosted-glass-card shadow-frosted-lg group relative overflow-hidden transition-all duration-300 cursor-pointer border border-border/50 hover:border-primary/50 backdrop-blur-xl h-full flex flex-col"
        onClick={onClick}
      >
        {/* Space-themed radial gradient overlay - matching landing screen */}
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
          style={{
            backgroundImage: [
              // Core glow - amber/yellow (brightest)
              'radial-gradient(ellipse 400px 300px at 50% 0%, rgba(245,158,11,0.25), transparent 60%)',
              // Secondary layer - softer amber blend
              'radial-gradient(ellipse 500px 350px at 50% 0%, rgba(251,191,36,0.18), transparent 65%)',
              // Outer spread - subtle warm glow
              'radial-gradient(ellipse 600px 400px at 50% 0%, rgba(252,211,77,0.12), transparent 70%)',
            ].join(', '),
          }}
        />

        {/* Space-themed decorative corner accent with amber gradient */}
        <div
          className="absolute top-0 right-0 w-24 h-24 rounded-bl-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 80px 80px at top right, rgba(245,158,11,0.35), transparent 70%)',
          }}
        />

        {/* Animated border glow on hover with amber hue */}
        <div
          className="absolute inset-0 rounded-lg pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          style={{
            border: '2px solid transparent',
            background: 'linear-gradient(hsl(var(--card)), hsl(var(--card))) padding-box, linear-gradient(135deg, rgba(245,158,11,0.3), rgba(251,191,36,0.4), rgba(252,211,77,0.3)) border-box',
          }}
        />

        {/* Shimmer effect on hover with amber tint */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div
            className="absolute inset-y-0 w-1/2 -translate-x-full group-hover:translate-x-[300%] transition-transform duration-700 ease-in-out"
            style={{
              background: 'linear-gradient(to right, transparent, rgba(245,158,11,0.15), rgba(251,191,36,0.1), transparent)',
            }}
          />
        </div>

        {/* Actions dropdown */}
        {showActions && (onDelete || onGenerateAvatar) && (
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
                {onGenerateAvatar && (
                  <DropdownMenuItem
                    onClick={e => {
                      e.stopPropagation()
                      onGenerateAvatar(agent, { mode: 'full_chain' })
                    }}
                    className="flex items-center gap-2 cursor-pointer hover:bg-primary/10 focus:bg-primary/10"
                  >
                    <Icon name="image" className="w-4 h-4 text-muted-foreground" />
                    <span>Generate Avatar</span>
                  </DropdownMenuItem>
                )}

                {onGenerateAvatar && (
                  <DropdownMenuItem
                    onClick={e => {
                      e.stopPropagation()
                      onGenerateAvatar(agent, { mode: 'avatar_only' })
                    }}
                    className="flex items-center gap-2 cursor-pointer hover:bg-primary/10 focus:bg-primary/10"
                  >
                    <Icon name="refresh" className="w-4 h-4 text-muted-foreground" />
                    <span>Regenerate (same prompt)</span>
                  </DropdownMenuItem>
                )}

                {onDelete && !isTemplateAgent && (
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

                {onDelete != null && isTemplateAgent && (
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
            {/* Enhanced Avatar */}
            <div className="relative flex-shrink-0">
              {/* Animated amber glow ring - only on hover */}
              <motion.div
                className="absolute inset-0 rounded-full blur-xl pointer-events-none hidden group-hover:block"
                style={{
                  background: 'radial-gradient(circle, rgba(245,158,11,0.4), rgba(251,191,36,0.2), transparent 70%)',
                }}
                animate={{
                  scale: [1, 1.15, 1],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />
              <Avatar
                className="h-12 w-12 transition-all duration-300 relative z-10 shadow-lg"
                style={{
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                }}
              >
                <AgentAvatar seed={agent.name} imageUrl={avatarUrl} size={48} />
              </Avatar>
              {/* Animated amber border ring - only on hover */}
              <motion.div
                className="absolute inset-0 rounded-full pointer-events-none hidden group-hover:block"
                style={{
                  boxShadow: '0 0 0 3px rgba(245,158,11,0.4)',
                }}
                animate={{
                  scale: [1, 1.15, 1],
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
              <div className="flex items-center gap-2 mb-2">
                <CardTitle className="truncate text-lg font-bold transition-all duration-300 group-hover:[color:rgba(245,158,11,1)]">{agent.name}</CardTitle>
                {/* Show version badge next to name */}
                {agent.version && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 font-mono">
                    v{agent.version}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap mb-2">
                {isTemplateAgent && (
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0.5 flex items-center"
                    style={{
                      borderColor: 'rgba(245,158,11,0.4)',
                      backgroundColor: 'rgba(245,158,11,0.15)',
                      color: 'rgba(245,158,11,1)',
                    }}
                  >
                    <Icon name="shield" className="w-2.5 h-2.5 mr-1" />
                    System
                  </Badge>
                )}
                {/* Premium update available indicator with subtle animation */}
                {needsUpdate && (
                  <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3, ease: 'easeOut' }}>
                    <Badge
                      className="text-[10px] px-1.5 py-0.5 font-medium relative overflow-hidden flex items-center"
                      style={{
                        background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.12), rgba(124, 58, 237, 0.08))',
                        borderColor: 'rgba(139, 92, 246, 0.3)',
                        color: 'rgb(139, 92, 246)',
                        boxShadow: '0 0 8px rgba(139, 92, 246, 0.15)',
                      }}
                    >
                      <motion.div
                        className="absolute inset-0"
                        style={{
                          background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.15), transparent)',
                        }}
                        animate={{
                          x: ['-100%', '100%'],
                        }}
                        transition={{
                          duration: 2,
                          repeat: Infinity,
                          ease: 'linear',
                        }}
                      />
                      <span className="relative z-10 flex items-center gap-1">
                        <Icon name="arrow-up-circle" className="w-2.5 h-2.5" />
                        NEW UPDATE AVAILABLE
                      </span>
                    </Badge>
                  </motion.div>
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
            {/* Model badge */}
            <Badge variant="secondary" className="text-xs flex items-center gap-1.5 px-2.5 py-1 transition-all duration-200">
              <Icon name="brain" className="w-3.5 h-3.5" />
              <span className="font-mono text-xs">{agent.model || 'N/A'}</span>
            </Badge>

            {/* Chat button */}
            {onChat ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-9 px-3 font-medium transition-all duration-200 text-[rgba(245,158,11,0.8)]"
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, rgba(245,158,11,0.1), rgba(251,191,36,0.06))'
                  e.currentTarget.style.borderColor = 'rgba(245,158,11,0.25)'
                  e.currentTarget.style.boxShadow = '0 0 4px rgba(245,158,11,0.1)'
                  e.currentTarget.style.color = 'rgba(245,158,11,0.8)'
                  e.currentTarget.style.border = '1px solid rgba(245,158,11,0.25)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = ''
                  e.currentTarget.style.borderColor = ''
                  e.currentTarget.style.boxShadow = ''
                  e.currentTarget.style.color = ''
                  e.currentTarget.style.border = ''
                }}
                onClick={e => {
                  e.stopPropagation()
                  onChat(agent)
                }}
              >
                <Icon name="message-square" className="mr-1.5 h-4 w-4" style={{ color: 'rgba(245,158,11,0.85)' }} />
                Chat
              </Button>
            ) : hideChatControl ? null : (
              <div
                className="flex items-center gap-1.5 text-[rgba(245,158,11,0.85)] px-2 py-1 rounded-md bg-[rgba(245,158,11,0.08)] border border-[rgba(245,158,11,0.18)] transition-all duration-200"
                style={{ boxShadow: '0 0 8px rgba(245,158,11,0.08)' }}
              >
                <Icon name="fingerprint" className="h-3.5 w-3.5" style={{ color: 'rgba(245,158,11,0.85)' }} />
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
