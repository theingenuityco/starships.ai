'use client'

import Image from 'next/image'
import Icon from '@/components/primitives/Icon'
import { Button } from '@/components/ui/button'
import { MarketplaceAvatar } from '@/components/marketplace/MarketplaceAvatar'
import { useCreateAgentFromTemplate, useRequiredConnectors } from '@/hooks/useTemplates'
import { useStarshipAgents, useDeleteAgent } from '@/hooks/useAgents'
import { getConnectorLogoSrc } from '@/utils/connectorLogos'
import type { AgentTemplateModel } from '@starships/protocol'
import { cn } from '@/lib/utils'
import { useState } from 'react'

export interface OnboardingAgentCardProps {
  template: AgentTemplateModel
  targetStarshipId: string
  onDeployed?: (template: AgentTemplateModel) => void
  onRemoved?: (template: AgentTemplateModel) => void
  /** Compact layout: single line photo + name + role, short description, Add/Remove button */
  compact?: boolean
}

export function OnboardingAgentCard({ template, targetStarshipId, onDeployed, onRemoved, compact = true }: OnboardingAgentCardProps) {
  const createAgentMutation = useCreateAgentFromTemplate()
  const deleteAgentMutation = useDeleteAgent()
  const { data: deployedAgents = [] } = useStarshipAgents(targetStarshipId, !!targetStarshipId)
  const { data: requiredConnectors = [] } = useRequiredConnectors(template.id, !!template.id)
  const [hiddenLogos, setHiddenLogos] = useState<Record<string, boolean>>({})

  const deployedAgent = deployedAgents.find(agent => agent.sourceTemplateId === template.id)
  const isAlreadyDeployed = !!deployedAgent
  const isDeploying = createAgentMutation.isPending
  const isRemoving = deleteAgentMutation.isPending
  const displayName = String(template.name || '').trim()
  const displayRole = String(template.role || '').trim()
  const displayDescription = String(template.description || '').trim()
  const avatarUrl = template.avatarUrl

  const handleAdd = async () => {
    if (!targetStarshipId || isAlreadyDeployed || isDeploying) return
    try {
      await createAgentMutation.mutateAsync({
        templateId: template.id,
        starshipId: targetStarshipId,
      })
      onDeployed?.(template)
    } catch {
      // Toast from mutation
    }
  }

  const handleRemove = async () => {
    if (!deployedAgent?.id || isRemoving) return
    try {
      await deleteAgentMutation.mutateAsync(deployedAgent.id)
      onRemoved?.(template)
    } catch {
      // Toast from mutation
    }
  }

  const avatarSize = 'h-20 w-20'
  const avatarFallback = 'h-14 w-14'

  const addRemoveButton = (
    <Button
      size="sm"
      onClick={isAlreadyDeployed ? handleRemove : handleAdd}
      disabled={isDeploying || isRemoving}
      className={cn('shrink-0 h-9', isAlreadyDeployed && 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25')}
    >
      {isAlreadyDeployed ? (
        <>
          <Icon name="check-circle" className="w-3.5 h-3.5 mr-1" />
          {isRemoving ? 'Removing…' : 'Added'}
        </>
      ) : (
        <>
          <Icon name="plus" className="w-3.5 h-3.5 mr-1" />
          {isDeploying ? '…' : 'Add'}
        </>
      )}
    </Button>
  )

  const connectorBadges =
    requiredConnectors.length > 0 ? (
      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
        {requiredConnectors.map(({ provider, name }) => {
          const showLogo = !hiddenLogos[provider]
          const logoSrc = getConnectorLogoSrc(provider)
          return (
            <div
              key={provider}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white border border-border/40"
              title={name}
            >
              {showLogo ? (
                <Image
                  src={logoSrc}
                  alt=""
                  width={16}
                  height={16}
                  className="object-contain"
                  onError={() => setHiddenLogos(prev => ({ ...prev, [provider]: true }))}
                />
              ) : null}
            </div>
          )
        })}
      </div>
    ) : null

  if (!compact) {
    return (
      <div className="flex flex-col rounded-xl border border-border/40 bg-card/10 p-5 gap-4">
        <div className="flex items-center gap-4">
          <div className={cn(avatarSize, 'shrink-0 overflow-hidden rounded-full bg-muted/20 ring-1 ring-border/30')}>
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <MarketplaceAvatar
                  imageUrl={null}
                  label={displayName || 'Agent'}
                  seed={displayName || 'AI'}
                  sizeClassName={avatarFallback}
                  fallbackTextClassName="text-lg font-medium text-muted-foreground"
                />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-[17px] leading-tight truncate">{displayName || 'Unnamed agent'}</div>
            {displayRole ? <div className="text-sm text-muted-foreground truncate mt-0.5">{displayRole}</div> : null}
            {connectorBadges}
          </div>
          {addRemoveButton}
        </div>
        {displayDescription ? <div className="text-sm text-muted-foreground line-clamp-2 w-full">{displayDescription}</div> : null}
      </div>
    )
  }

  return (
    <div className="flex flex-col rounded-xl border border-border/40 bg-card/10 p-5 gap-4">
      <div className="flex items-center gap-4">
        <div className={cn(avatarSize, 'shrink-0 overflow-hidden rounded-full bg-muted/20 ring-1 ring-border/30')}>
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <MarketplaceAvatar
                imageUrl={null}
                label={displayName || 'Agent'}
                seed={displayName || 'AI'}
                sizeClassName={avatarFallback}
                fallbackTextClassName="text-lg font-medium text-muted-foreground"
              />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-[17px] leading-tight truncate">{displayName || 'Unnamed agent'}</div>
          {displayRole ? <div className="text-sm text-muted-foreground truncate mt-0.5">{displayRole}</div> : null}
          {connectorBadges}
        </div>
        {addRemoveButton}
      </div>
      {displayDescription ? <div className="text-sm text-muted-foreground line-clamp-2 w-full">{displayDescription}</div> : null}
    </div>
  )
}
