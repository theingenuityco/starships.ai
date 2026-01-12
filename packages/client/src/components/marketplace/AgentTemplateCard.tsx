'use client'

import Icon from '@/components/primitives/Icon'

import { Badge } from '@/components/ui/badge'
import { useCreateAgentFromTemplate, useToolTemplates } from '@/hooks/useTemplates'
import { useUserStarships } from '@/hooks/useStarships'
import { useStarshipAgents } from '@/hooks/useAgents'
import { useAuth } from '@/hooks/useAuth'
import { DeploymentConfirmationModal } from './DeploymentConfirmationModal'
import { DeployedAgentCard } from '@/components/agents/DeployedAgentCard'

import { useMemo, useState } from 'react'
import type { AgentModel, AgentTemplateModel } from '@starships/protocol'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { track } from '@/lib/analytics'

interface AgentTemplateCardProps {
  template: AgentTemplateModel
  onDeploy?: (template: AgentTemplateModel) => void
  onClick?: (template: AgentTemplateModel) => void
  /**
   * When false, hides the bottom-right Deploy CTA (useful for landing page carousel previews).
   * Defaults to true.
   */
  showDeployCta?: boolean
}

export function AgentTemplateCard({ template, onDeploy, onClick, showDeployCta = true }: AgentTemplateCardProps) {
  const [isDeploying, setIsDeploying] = useState(false)
  const [showConfirmationModal, setShowConfirmationModal] = useState(false)

  // Get current user and their starships for deployment
  const { userId, isAuthenticated } = useAuth()
  const { data: starships = [] } = useUserStarships(userId || '', !!userId)
  const primaryStarship = starships[0] // Use first starship by default

  // Get deployed agents to check if this template is already deployed
  const { data: deployedAgents = [] } = useStarshipAgents(primaryStarship?.id || '', !!primaryStarship)

  // If this template was published from this starship, disable deploy CTA (it already "lives" here)
  const isPublishedFromThisStarship = deployedAgents.some(agent => agent.publishedTemplateId === template.id)

  // Already deployed when this template has already been deployed to this starship.
  // Server-provided linkage is `sourceTemplateId`.
  const isAlreadyDeployed = deployedAgents.some(agent => agent.sourceTemplateId === template.id)

  // Deployment mutation
  const createAgentMutation = useCreateAgentFromTemplate()

  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const requestDeploy = () => {
    track({
      type: 'marketplace_agent_deploy_clicked',
      templateId: template.id,
      templateName: template.name,
      category: (template as any)?.category,
      authenticated: !!isAuthenticated,
    })
    if (!isAuthenticated) {
      const current = `${pathname}${searchParams && searchParams.toString() ? `?${searchParams.toString()}` : ''}`
      const params = new URLSearchParams({ returnUrl: current })
      router.push(`/login?${params.toString()}`)
      return
    }

    if (!primaryStarship) {
      return // No starship to deploy to
    }
    setShowConfirmationModal(true)
  }

  const handleCardClick = () => {
    track({
      type: 'marketplace_agent_template_opened',
      templateId: template.id,
      templateName: template.name,
      category: (template as any)?.category,
    })
    onClick?.(template)
  }

  const agentLike: AgentModel = {
    // minimal fields used by DeployedAgentCard; the rest are irrelevant for Marketplace UI
    id: template.id,
    name: template.name,
    role: template.role,
    slug: template.slug,
    description: template.description,
    model: template.model,
    version: template.version as any,
    category: (template as any).category as any,
  } as unknown as AgentModel

  const avatarUrl = (template as any).avatarUrl as string | undefined

  const handleConfirmDeploy = async () => {
    if (!primaryStarship) {
      return // No starship to deploy to
    }

    setIsDeploying(true)
    try {
      await createAgentMutation.mutateAsync({
        templateId: template.id,
        starshipId: primaryStarship.id,
      })
      onDeploy?.(template)
    } catch {
      // Error handling is done in the mutation hook
    } finally {
      setIsDeploying(false)
    }
  }

  return (
    <>
      <DeployedAgentCard
        agent={agentLike}
        avatarUrl={avatarUrl}
        onClick={handleCardClick}
        showStatusIndicator={false}
        showPublicationBadge={false}
        hideChatControl={true}
        showActions={false}
        disableEntranceMotion={true}
        isAlreadyDeployed={isAlreadyDeployed || isPublishedFromThisStarship}
        primaryAction={
          showDeployCta
            ? {
                label: isAlreadyDeployed ? 'Deployed' : isPublishedFromThisStarship ? 'Published from this starship' : isDeploying ? 'Deploying...' : 'Deploy',
                iconName: isAlreadyDeployed ? 'check-circle' : isPublishedFromThisStarship ? 'stars' : 'sparkles',
                disabled: isAlreadyDeployed || isPublishedFromThisStarship || isDeploying || (isAuthenticated && !primaryStarship),
                variant: isAlreadyDeployed || isPublishedFromThisStarship ? 'ghost' : 'default',
                className: isAlreadyDeployed || isPublishedFromThisStarship ? undefined : 'bg-primary text-primary-foreground hover:bg-primary/90',
                onAction: () => requestDeploy(),
              }
            : undefined
        }
      />

      {/* Confirmation Modal */}
      <DeploymentConfirmationModal
        isOpen={showConfirmationModal}
        onOpenChange={setShowConfirmationModal}
        onConfirm={handleConfirmDeploy}
        isProcessing={isDeploying}
        type="agent"
        template={template}
        starshipName={primaryStarship?.name || 'Unknown Starship'}
      />
    </>
  )
}
