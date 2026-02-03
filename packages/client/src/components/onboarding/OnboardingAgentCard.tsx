'use client'

import Icon from '@/components/primitives/Icon'
import { Button } from '@/components/ui/button'
import { MarketplaceAvatar } from '@/components/marketplace/MarketplaceAvatar'
import { useCreateAgentFromTemplate } from '@/hooks/useTemplates'
import { useStarshipAgents, useDeleteAgent } from '@/hooks/useAgents'
import type { AgentTemplateModel } from '@starships/protocol'
import { cn } from '@/lib/utils'

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
        </div>
        {addRemoveButton}
      </div>
      {displayDescription ? <div className="text-sm text-muted-foreground line-clamp-2 w-full">{displayDescription}</div> : null}
    </div>
  )
}
