'use client'

import Icon from '@/components/primitives/Icon'

import React from 'react'
import type { AgentModel } from '@starships/protocol'
import { motion } from 'motion/react'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import AgentAvatar from '@/components/animated/AgentAvatar'
import { Badge } from '@/components/ui/badge'
import { Button, type ButtonProps } from '@/components/ui/button'
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
  /**
   * Optional override for the bottom-right CTA (e.g. Marketplace wants "Deploy"
   * instead of the default "Chat" CTA).
   */
  primaryAction?: {
    label: string
    iconName?: string
    onAction: (agent: AgentModel) => void
    disabled?: boolean
    variant?: ButtonProps['variant']
    className?: string
  }
  /**
   * When true, skip motion wrappers/animations (useful when the parent already
   * wraps with its own motion container).
   */
  disableMotion?: boolean
}

export function DeployedAgentCard({
  agent,
  avatarUrl,
  onClick,
  onChat,
  onEdit,
  onDelete,
  onGenerateAvatar,
  showActions = false,
  hideChatControl = false,
  primaryAction,
  disableMotion = false,
}: DeployedAgentCardProps) {
  // Check if this is a template-based agent (has sourceTemplateId) - these are protected
  const isTemplateAgent = !!agent.sourceTemplateId

  // Get update info from agent object (populated by API)
  const needsUpdate = isTemplateAgent && agent.updateInfo?.needsUpdate

  return (
    <motion.div
      initial={disableMotion ? undefined : { opacity: 0, y: 10 }}
      animate={disableMotion ? undefined : { opacity: 1, y: 0 }}
      whileHover={disableMotion ? undefined : { y: -4 }}
      transition={disableMotion ? undefined : { duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
      className="h-full"
    >
      <Card
        className="group relative overflow-hidden cursor-pointer h-full flex flex-col rounded-lg bg-card border border-border/40 shadow-sm transition-colors duration-200 hover:bg-muted/30 hover:border-muted hover:shadow-md"
        onClick={onClick}
      >
        {/* Actions dropdown */}
        {showActions && (onDelete || onGenerateAvatar) && (
          <div className="absolute top-3 right-3 z-30">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 rounded-full font-medium transition-all duration-200 border border-transparent text-muted-foreground hover:text-foreground hover:border-[hsl(var(--foreground)/0.15)] hover:bg-[linear-gradient(135deg,hsl(var(--foreground)/0.06),hsl(var(--foreground)/0.03))] hover:shadow-[0_0_4px_hsl(var(--foreground)/0.06)]"
                  onClick={e => e.stopPropagation()}
                >
                  <Icon name="dots-vertical" className="h-8 w-8" />
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

        <CardHeader className="pb-4 relative z-10 pt-5 space-y-4">
          <div className="flex items-start gap-4">
            {/* Avatar (same row as title) */}
            <div className="relative flex-shrink-0">
              <Avatar
                className="h-14 w-14 rounded-full transition-all duration-300 relative z-10 shadow-lg"
                style={{
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                }}
              >
                <AgentAvatar seed={agent.name} imageUrl={avatarUrl} size={56} rounded />
              </Avatar>
              {/* Online/Active indicator */}
              <div className="absolute bottom-0 right-0 -translate-x-1/4 -translate-y-1/4 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-card shadow-md z-20">
                <motion.div className="absolute inset-0 bg-green-400 rounded-full" animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }} transition={{ duration: 2, repeat: Infinity }} />
              </div>
            </div>

            {/* Text content */}
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 min-w-0">
                <CardTitle className="truncate text-xl font-bold transition-colors duration-200 group-hover:text-foreground">{agent.name}</CardTitle>
              </div>
              {/* Slug row (below title) */}
              {(agent as any)?.slug && (
                <div className="-mt-0.5 mb-2 min-w-0">
                  <span className="font-mono text-sm text-muted-foreground truncate">{(agent as any).slug}</span>
                </div>
              )}
            </div>
          </div>

          {/* New section: badges + description (below avatar/name/slug) */}
          <div className="mt-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              {/* Version + model badges */}
              {agent.version && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 font-mono">
                  v{agent.version}
                </Badge>
              )}
              {agent.model && (
                <Badge variant="secondary" className="text-[10px] flex items-center gap-1.5 px-2 py-0.5 transition-all duration-200 min-w-0">
                  <Icon name="brain" className="w-3.5 h-3.5" />
                  <span className="font-mono text-[10px] truncate">{agent.model}</span>
                </Badge>
              )}
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
        </CardHeader>

        <CardContent className="relative z-10 pt-0 pb-5 mt-auto">
          <div className="flex items-center justify-end">
            {/* Primary action (optional override) */}
            {primaryAction ? (
              <Button
                size="sm"
                variant={primaryAction.variant ?? 'default'}
                disabled={primaryAction.disabled}
                className={primaryAction.className}
                onClick={e => {
                  e.stopPropagation()
                  primaryAction.onAction(agent)
                }}
              >
                {primaryAction.iconName ? <Icon name={primaryAction.iconName} className="mr-1.5 h-4 w-4" /> : null}
                {primaryAction.label}
              </Button>
            ) : onChat ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-9 px-3 font-medium transition-all duration-200 border border-transparent text-[rgba(245,158,11,0.8)] hover:text-[rgba(245,158,11,0.8)] hover:border-[rgba(245,158,11,0.25)] hover:bg-[linear-gradient(135deg,rgba(245,158,11,0.10),rgba(251,191,36,0.06))] hover:shadow-[0_0_4px_rgba(245,158,11,0.10)]"
                onClick={e => {
                  e.stopPropagation()
                  onChat(agent)
                }}
              >
                <Icon name="message-square" className="mr-1.5 h-4 w-4 text-[rgba(245,158,11,0.85)]" />
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
