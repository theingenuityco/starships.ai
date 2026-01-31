'use client'

import { useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'

import type { AgentTemplateModel } from '@starships/protocol'

import { useAuth } from '@/hooks/useAuth'
import { useUserStarships } from '@/hooks/useStarships'
import { useStarshipAgents } from '@/hooks/useAgents'
import { useCreateAgentFromTemplate } from '@/hooks/useTemplates'
import { DeploymentConfirmationModal } from '@/components/marketplace/DeploymentConfirmationModal'
import { Button } from '@/components/ui/button'
import Icon from '@/components/primitives/Icon'
import { track } from '@/lib/analytics'
import api from '@/lib/api'
import type { AgentToolPermission, UpdateAgentToolPermissionsRequest } from '@starships/protocol'
import { toast } from 'sonner'

export function MarketplaceAgentDeployCta({ template }: { template: AgentTemplateModel }) {
  const router = useRouter()
  const pathname = usePathname()

  const { userId, isAuthenticated } = useAuth()
  const { data: starships = [] } = useUserStarships(userId || '', !!userId)
  const primaryStarship = starships[0]

  const templateId = template?.id ?? ''
  const { data: deployedAgents = [] } = useStarshipAgents(primaryStarship?.id || '', !!primaryStarship && !!templateId)

  const isAlreadyDeployed = useMemo(() => {
    if (!templateId) return false
    return deployedAgents.some(agent => agent.sourceTemplateId === templateId)
  }, [deployedAgents, templateId])

  const isPublishedFromThisStarship = useMemo(() => {
    if (!templateId) return false
    return deployedAgents.some(agent => agent.publishedTemplateId === templateId)
  }, [deployedAgents, templateId])

  const [showConfirmationModal, setShowConfirmationModal] = useState(false)
  const [isDeploying, setIsDeploying] = useState(false)
  const createAgentMutation = useCreateAgentFromTemplate()

  const deployLabel = isAlreadyDeployed ? 'Already deployed' : isPublishedFromThisStarship ? 'Published from this starship' : isDeploying ? 'Deploying...' : 'Deploy'
  const deployIconName = isAlreadyDeployed ? 'check-circle' : isPublishedFromThisStarship ? 'stars' : 'sparkles'
  const deployDisabled = isAlreadyDeployed || isPublishedFromThisStarship || isDeploying || (isAuthenticated && !primaryStarship)

  const handleDeployClick = () => {
    track({
      type: 'marketplace_agent_deploy_clicked',
      templateId: template.id,
      templateName: template.name,
      category: template.category,
      authenticated: !!isAuthenticated,
    })

    if (!isAuthenticated) {
      const params = new URLSearchParams({ returnUrl: pathname })
      router.push(`/login?${params.toString()}`)
      return
    }
    if (!primaryStarship) return
    setShowConfirmationModal(true)
  }

  const handleConfirmDeploy = async (input?: { toolPermissions?: Record<string, AgentToolPermission> }) => {
    if (!primaryStarship) return
    setIsDeploying(true)
    try {
      const created = await createAgentMutation.mutateAsync({
        templateId: template.id,
        starshipId: primaryStarship.id,
        starshipSlug: primaryStarship.slug,
      })

      const agentId = (created as any)?.id as string | undefined
      const agentSlug = (created as any)?.slug as string | undefined
      const starshipSlugOrId = ((created as any)?._starshipSlug as string | undefined) || primaryStarship.slug || primaryStarship.id
      const toolPermissions = input?.toolPermissions
      if (agentId && toolPermissions && Object.keys(toolPermissions).length > 0) {
        const body: UpdateAgentToolPermissionsRequest = {
          permissions: Object.entries(toolPermissions).map(([toolSlug, permission]) => ({ toolSlug, permission })),
        }
        try {
          await api.put(`/api/v1/agents/${agentId}/tool-permissions`, body)
        } catch (e: any) {
          toast.error('Permissions not saved', { description: e?.response?.data?.error || e?.message || 'Agent deployed, but tool permissions could not be updated.' })
        }
      }

      // Marketplace UX: after deploy, take the user to the correct starship (chat).
      if (pathname?.startsWith('/marketplace') && starshipSlugOrId) {
        if (agentId) {
          router.push(`/ship/${encodeURIComponent(starshipSlugOrId)}/dm?dm=draft&dmType=user_agent&agentId=${encodeURIComponent(agentId)}`)
        } else {
          router.push(`/ship/${encodeURIComponent(starshipSlugOrId)}`)
        }
      }
    } finally {
      setIsDeploying(false)
    }
  }

  return (
    <>
      {isAlreadyDeployed ? (
        <div className="flex items-center gap-3">
          <div className="relative inline-flex items-center gap-1.5 h-10 px-4 rounded-md bg-emerald-500/15 dark:bg-emerald-500/15 backdrop-blur-md border border-emerald-500/30 dark:border-emerald-500/30 shadow-lg">
            <Icon name="check-circle" className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Deployed</span>
          </div>
          {primaryStarship?.slug ? (
            <Button variant="primaryOutline" size="sm" className="h-10 gap-2" onClick={() => router.push(`/ship/${primaryStarship.slug}`)}>
              <Icon name="message-square" className="h-4 w-4" />
              Start chat
            </Button>
          ) : null}
        </div>
      ) : (
        <Button onClick={handleDeployClick} disabled={deployDisabled} className="h-10">
          <Icon name={deployIconName} className="w-4 h-4 mr-2" />
          {deployLabel}
        </Button>
      )}

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
