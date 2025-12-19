'use client'

import Icon from '@/components/primitives/Icon'

import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import AgentAvatar from '@/components/animated/AgentAvatar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useCreateAgentFromTemplate } from '@/hooks/useTemplates'
import { useUserStarships } from '@/hooks/useStarships'
import { useStarshipAgents } from '@/hooks/useAgents'
import { useAuth } from '@/hooks/useAuth'
import { DeploymentConfirmationModal } from './DeploymentConfirmationModal'
import { DeployedAgentCard } from '@/components/agents/DeployedAgentCard'

import { useState } from 'react'
import type { AgentModel, AgentTemplateModel } from '@starships/protocol'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

interface AgentTemplateCardProps {
  template: AgentTemplateModel
  onDeploy?: (template: AgentTemplateModel) => void
  onClick?: (template: AgentTemplateModel) => void
}

export function AgentTemplateCard({ template, onDeploy, onClick }: AgentTemplateCardProps) {
  const [isDeploying, setIsDeploying] = useState(false)
  const [showConfirmationModal, setShowConfirmationModal] = useState(false)

  // Get current user and their starships for deployment
  const { userId, isAuthenticated } = useAuth()
  const { data: starships = [] } = useUserStarships(userId || '', !!userId)
  const primaryStarship = starships[0] // Use first starship by default

  // Get deployed agents to check if this template is already deployed
  const { data: deployedAgents = [] } = useStarshipAgents(primaryStarship?.id || '', !!primaryStarship)
  // Note: We use name matching since agents don't store templateId
  const isAlreadyDeployed = deployedAgents.some(agent => agent.name === template.name)

  // Deployment mutation
  const createAgentMutation = useCreateAgentFromTemplate()

  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const requestDeploy = () => {
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
    onClick?.(template)
  }

  const agentLike: AgentModel = {
    // minimal fields used by DeployedAgentCard; the rest are irrelevant for Marketplace UI
    id: template.id,
    name: template.name,
    slug: template.slug,
    description: template.description,
    model: template.model,
    version: template.version as any,
  } as unknown as AgentModel

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
        avatarUrl={(template as any).avatarUrl}
        onClick={handleCardClick}
        hideChatControl={true}
        showActions={false}
        disableMotion={true}
        primaryAction={{
          label: isAlreadyDeployed ? 'Already deployed' : isDeploying ? 'Deploying...' : 'Deploy',
          iconName: isAlreadyDeployed ? 'check-circle' : 'sparkles',
          disabled: isAlreadyDeployed || isDeploying || (isAuthenticated && !primaryStarship),
          variant: isAlreadyDeployed ? 'outline' : 'default',
          className: 'h-9 px-3',
          onAction: () => requestDeploy(),
        }}
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

interface AgentTemplateCardCompactProps {
  template: AgentTemplateModel
  onClick?: (template: AgentTemplateModel) => void
}

export function AgentTemplateCardCompact({ template, onClick }: AgentTemplateCardCompactProps) {
  return (
    <Card className="frosted-glass-card shadow-frosted-lg hover:shadow-frosted-lg group relative overflow-hidden transition-shadow duration-300 cursor-pointer" onClick={() => onClick?.(template)}>
      <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
      <CardHeader className="pb-3 relative z-10">
        <div className="mb-1 flex items-center gap-2">
          <Avatar className="h-6 w-6 ring-1 ring-border/40">
            <AgentAvatar seed={template.name} imageUrl={(template as any).avatarUrl} size={24} />
          </Avatar>
          <CardTitle className="truncate text-base font-semibold">{template.name}</CardTitle>
        </div>
        {template.description && <CardDescription className="line-clamp-2 text-xs">{template.description}</CardDescription>}
      </CardHeader>
      <CardContent className="relative z-10 pt-0">
        <div className="flex items-center justify-between">
          <Badge variant="secondary" className="text-xs">
            {template.model || 'N/A'}
          </Badge>
          <div className="flex items-center gap-1 text-muted-foreground">
            <Icon name="download" className="h-3.5 w-3.5" />
            <span className="text-[10px]">{template.usageCount ?? 0}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
