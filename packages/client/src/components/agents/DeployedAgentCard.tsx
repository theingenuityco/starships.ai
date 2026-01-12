'use client'

import Icon from '@/components/primitives/Icon'

import React, { useMemo, useState } from 'react'
import type { AgentModel, ApiResponse, ImportExportContainerV1 } from '@starships/protocol'
import { motion } from 'motion/react'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import AgentAvatar from '@/components/animated/AgentAvatar'
import { Badge } from '@/components/ui/badge'
import { Button, type ButtonProps } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import api from '@/lib/api'
import type { FetchResponse } from '@/lib/types'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { getCategoryDotColor } from '@/components/agents/AgentBuilder/utils/categoryHelpers'

const CHAT_CTA_BUTTON_CLASS =
  'h-9 px-3 font-medium transition-all duration-200 border border-transparent text-[rgba(245,158,11,0.8)] hover:text-[rgba(245,158,11,0.8)] hover:border-[rgba(245,158,11,0.25)] hover:bg-[linear-gradient(135deg,rgba(245,158,11,0.10),rgba(251,191,36,0.06))] hover:shadow-[0_0_4px_rgba(245,158,11,0.10)] disabled:text-muted-foreground disabled:hover:text-muted-foreground disabled:hover:border-transparent disabled:hover:bg-transparent disabled:hover:shadow-none'
const CHAT_CTA_ICON_CLASS = 'mr-1.5 h-4 w-4 text-[rgba(245,158,11,0.85)] group-disabled:text-muted-foreground'
interface DeployedAgentCardProps {
  agent: AgentModel
  avatarUrl?: string
  /**
   * When true, avatar generation is in-flight for this agent.
   * Used to disable avatar actions and show an inline loading indicator.
   */
  isGeneratingAvatar?: boolean
  onClick: () => void
  onChat?: (agent: AgentModel) => void
  onEdit?: (agent: AgentModel) => void
  onDelete?: (agent: AgentModel) => void
  onGenerateAvatar?: (agent: AgentModel, options?: { mode?: 'avatar_only' | 'full_chain' }) => void
  /**
   * When true (default), shows the small green "online/active" dot on the avatar.
   * Marketplace template cards should typically turn this off.
   */
  showStatusIndicator?: boolean
  /**
   * When true (default), shows the bottom-left badge that indicates whether the
   * agent is Private / Published / From Marketplace.
   *
   * Marketplace template cards should typically hide this badge.
   */
  showPublicationBadge?: boolean
  showActions?: boolean
  hideChatControl?: boolean
  /**
   * Optional content rendered directly under the description line.
   * Useful for Marketplace to show assigned tool badges.
   */
  belowDescription?: React.ReactNode
  /**
   * Optional override for the bottom-right CTA (e.g. Marketplace wants "Deploy"
   * instead of the default "Chat" CTA).
   */
  primaryAction?: {
    label: string
    iconName?: string
    iconClassName?: string
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
  /**
   * When true, disable ONLY entrance animation (initial/animate), while keeping hover lift.
   * Useful when a parent provides a staggered entry animation.
   */
  disableEntranceMotion?: boolean
  /**
   * When true, disable ONLY hover lift, while keeping entrance animation.
   */
  disableHoverMotion?: boolean
  /**
   * When true, indicates this agent/template is already deployed.
   * Used to apply different styling to show it's already available.
   */
  isAlreadyDeployed?: boolean
}

export function DeployedAgentCard({
  agent,
  avatarUrl,
  isGeneratingAvatar = false,
  onClick,
  onChat,
  onDelete,
  showStatusIndicator = true,
  showPublicationBadge = true,
  showActions = false,
  hideChatControl = false,
  belowDescription,
  primaryAction,
  disableMotion = false,
  disableEntranceMotion = false,
  disableHoverMotion = false,
  isAlreadyDeployed = false,
}: DeployedAgentCardProps) {
  const { isInstanceAdmin } = useAuth()
  const [isExporting, setIsExporting] = useState(false)

  const displayName = typeof agent?.name === 'string' ? agent.name.trim() : ''
  const displayRole = typeof agent?.role === 'string' ? agent.role.trim() : ''
  const displaySlug = typeof agent?.slug === 'string' ? agent.slug.trim() : ''
  const subtitle = displayRole || displaySlug
  const showActionsDropdown = showActions && (onDelete || isInstanceAdmin)
  const category = (agent as any)?.category as string | undefined

  // Check if this is a template-based agent (has sourceTemplateId).
  // Note: template-based agents may be read-only in some editors, but they can still be deleted.
  const isTemplateAgent = !!agent.sourceTemplateId

  // Get update info from agent object (populated by API)
  const needsUpdate = isTemplateAgent && agent.updateInfo?.needsUpdate

  const statusMeta = useMemo(() => {
    if (isTemplateAgent) {
      return {
        label: 'From Marketplace',
        iconName: 'store',
      }
    }
    if (agent.publicationStatus === 'published') {
      return {
        label: 'Published',
        iconName: 'globe',
      }
    }
    return {
      label: 'Private',
      iconName: 'lock',
    }
  }, [agent.publicationStatus, isTemplateAgent])

  const entranceOff = disableMotion || disableEntranceMotion
  const hoverOff = disableMotion || disableHoverMotion

  const downloadJson = (filename: string, data: unknown) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const handleExportJson = async () => {
    if (!isInstanceAdmin || !agent?.id) return
    setIsExporting(true)
    try {
      const resp: FetchResponse<ApiResponse<ImportExportContainerV1>> = await api.get(`/api/v1/agents/${agent.id}/export`)
      const container = resp.data.data
      if (!container) throw new Error('Export failed: empty response')

      const base = agent.slug ? `agent-${agent.slug}` : `agent-${agent.id}`
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      downloadJson(`${base}__${stamp}.json`, container)
      toast.success('Exported JSON')
    } catch (e: any) {
      toast.error('Export failed', { description: e?.message || 'Unknown error' })
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <motion.div
      initial={entranceOff ? undefined : { opacity: 0, y: 10 }}
      animate={entranceOff ? undefined : { opacity: 1, y: 0 }}
      whileHover={hoverOff ? undefined : undefined}
      transition={entranceOff && hoverOff ? undefined : { duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
      className="h-full"
    >
      <Card
        className="group relative overflow-hidden cursor-pointer h-full flex flex-col rounded-lg bg-card/50 backdrop-blur-sm border border-border/60 shadow-md transition-all duration-200 hover:border-[rgba(245,158,11,0.4)] hover:bg-card/70 hover:bg-gradient-to-br hover:from-[rgba(245,158,11,0.05)] hover:to-[rgba(251,191,36,0.02)] hover:shadow-lg"
        style={{
          transform: 'translateZ(0)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}
        onClick={onClick}
      >
        {/* Actions dropdown */}
        {showActionsDropdown && (
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
                {isInstanceAdmin && (
                  <>
                    <DropdownMenuItem
                      onClick={e => {
                        e.stopPropagation()
                        void handleExportJson()
                      }}
                      disabled={isExporting}
                      className="flex items-center gap-2 cursor-pointer hover:bg-primary/10 focus:bg-primary/10"
                    >
                      <Icon name="download" className="w-4 h-4 text-muted-foreground" />
                      <span>{isExporting ? 'Exporting…' : 'Export JSON'}</span>
                    </DropdownMenuItem>
                    {onDelete && <DropdownMenuSeparator />}
                  </>
                )}
                {onDelete && (
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
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        <CardHeader className="pb-3 relative z-10 pt-4 space-y-3">
          <div className="flex items-center gap-3">
            {/* Avatar (same row as title) */}
            <div className="relative flex-shrink-0">
              <Avatar
                className="h-16 w-16 rounded-full transition-all duration-200 relative z-10 shadow-sm ring-1 ring-border/30"
                style={{
                  boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                }}
              >
                <AgentAvatar seed={agent.name} imageUrl={avatarUrl} size={64} rounded />
              </Avatar>
              {isGeneratingAvatar ? (
                <div className="absolute inset-0 z-20 rounded-full bg-background/60 backdrop-blur-sm flex items-center justify-center pointer-events-none">
                  <Icon name="loading" className="h-5 w-5 animate-spin text-primary" />
                </div>
              ) : null}
              {/* Online/Active indicator */}
              {showStatusIndicator ? (
                <div className="absolute bottom-0 right-0 -translate-x-1/4 -translate-y-1/4 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-card shadow-md z-20">
                  <motion.div className="absolute inset-0 bg-green-400 rounded-full" animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }} transition={{ duration: 2, repeat: Infinity }} />
                </div>
              ) : null}
            </div>

            {/* Text content */}
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 min-w-0">
                <CardTitle className="truncate text-lg font-semibold">{displayName || 'Unnamed agent'}</CardTitle>
              </div>
              {/* Role row (below title). Falls back to slug if role isn't set. */}
              {subtitle ? (
                <div className="mt-0.5 mb-0 min-w-0">
                  <span className="text-base text-muted-foreground truncate">{subtitle}</span>
                </div>
              ) : null}
            </div>
          </div>

          {/* New section: badges + description (below avatar/name/slug) */}
          <div className="mt-2">
            <div className="flex items-center gap-1.5 flex-wrap mb-2">
              {/* Category badge */}
              {typeof category === 'string' && category.trim() ? (
                <Badge variant="outline" className="text-xs px-2.5 py-1 font-medium capitalize inline-flex items-center gap-1.5 border-border/40">
                  <span className={`h-2 w-2 rounded-full ${getCategoryDotColor(category as any)}`} />
                  <span>{category}</span>
                </Badge>
              ) : null}
              {/* Version (inline, after category) */}
              {agent.version ? (
                <Badge variant="outline" className="text-xs px-2 py-1 font-mono border-border/40">
                  v{agent.version}
                </Badge>
              ) : null}
              {/* Premium update available indicator with subtle animation */}
              {needsUpdate && (
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3, ease: 'easeOut' }}>
                  <Badge
                    className="text-xs px-2 py-1 font-medium relative overflow-hidden flex items-center"
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
            <CardDescription className="line-clamp-4 text-sm text-muted-foreground leading-relaxed">{agent.description || 'No description provided'}</CardDescription>
            {belowDescription ? <div className="mt-2">{belowDescription}</div> : null}
          </div>
        </CardHeader>

        <CardContent className="relative z-10 pt-0 pb-4 mt-auto border-t border-border/20">
          <div className="flex items-center justify-between gap-3 pt-3">
            {showPublicationBadge ? (
              <div className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground px-2 py-1 leading-none">
                <Icon name={statusMeta.iconName} className="w-3 h-3" />
                <span className="font-mono">{statusMeta.label}</span>
              </div>
            ) : (
              <span aria-hidden />
            )}

            {/* Primary action (optional override) */}
            {primaryAction ? (
              <Button
                size="sm"
                variant={primaryAction.variant ?? 'default'}
                disabled={primaryAction.disabled}
                className={primaryAction.className ?? (primaryAction.variant === 'ghost' ? CHAT_CTA_BUTTON_CLASS : '')}
                onClick={e => {
                  e.stopPropagation()
                  primaryAction.onAction(agent)
                }}
              >
                {isAlreadyDeployed && primaryAction.label === 'Deployed' ? (
                  <Icon name="check-circle" className="w-4 h-4 text-emerald-500 mr-1.5" />
                ) : primaryAction.iconName ? (
                  <Icon name={primaryAction.iconName} className={primaryAction.iconClassName ?? (primaryAction.variant === 'ghost' ? CHAT_CTA_ICON_CLASS : 'mr-1.5 h-4 w-4')} />
                ) : null}
                {primaryAction.label}
              </Button>
            ) : onChat ? (
              <Button
                size="sm"
                variant="ghost"
                className={CHAT_CTA_BUTTON_CLASS}
                onClick={e => {
                  e.stopPropagation()
                  onChat(agent)
                }}
              >
                <Icon name="user" className={CHAT_CTA_ICON_CLASS} />
                View Profile
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
