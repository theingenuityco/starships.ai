'use client'

import { useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'

import type { AgentTemplateModel, DeployStarshipOption } from '@starships/protocol'

import { useAuth } from '@/hooks/useAuth'
import { useStarshipAgents, AGENT_QUERY_KEYS } from '@/hooks/useAgents'
import { useStarshipsForDeploySelection } from '@/hooks/useStarships'
import { useCreateAgentFromTemplate } from '@/hooks/useTemplates'
import { AgentDeploymentWizardModal } from '@/components/marketplace/AgentDeploymentWizardModal'
import { Button } from '@/components/ui/button'
import Icon from '@/components/primitives/Icon'
import { track } from '@/lib/analytics'
import api from '@/lib/api'
import type { AgentToolPermission, UpdateAgentToolPermissionsRequest } from '@starships/protocol'
import { toast } from 'sonner'

export function MarketplaceAgentDeployCta({ template }: { template: AgentTemplateModel }) {
  const router = useRouter()
  const pathname = usePathname()
  const queryClient = useQueryClient()

  const { userId, isAuthenticated } = useAuth()
  const { deployStarships, primaryStarship } = useStarshipsForDeploySelection(userId || '', { enabled: !!userId })

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

  const deployLabel = isAlreadyDeployed ? 'Installed' : isPublishedFromThisStarship ? 'Published' : isDeploying ? 'Installing…' : 'Install'
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

  const handleConfirmDeploy = async (input?: { toolPermissions?: Record<string, AgentToolPermission>; starship?: DeployStarshipOption }) => {
    const targetStarship = input?.starship ?? primaryStarship
    if (!targetStarship) return
    setIsDeploying(true)
    try {
      const safeStarshipPathSegment = (candidates: Array<unknown>): string | null => {
        for (const c of candidates) {
          if (typeof c !== 'string') continue
          const raw = c.trim()
          if (!raw) continue
          const lowered = raw.toLowerCase()
          if (lowered === 'undefined' || lowered === 'null') continue
          return raw
        }
        return null
      }

      const created = await createAgentMutation.mutateAsync({
        templateId: template.id,
        starshipId: targetStarship.id,
        starshipSlug: safeStarshipPathSegment([targetStarship.slug]) ?? undefined,
      })

      const agentId = (created as any)?.id as string | undefined
      const starshipSlugOrId = safeStarshipPathSegment([(created as any)?._starshipSlug, targetStarship.slug, targetStarship.id])
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

      // Marketplace UX: after deploy, take the user to the Lobby room with the agent preselected.
      if ((pathname?.startsWith('/explore') || pathname?.startsWith('/marketplace')) && starshipSlugOrId) {
        if (agentId) {
          await queryClient.refetchQueries({ queryKey: AGENT_QUERY_KEYS.byStarship(targetStarship.id) })
          router.push(`/ship/${encodeURIComponent(starshipSlugOrId)}/rooms/lobby?agentId=${encodeURIComponent(String(agentId))}`)
        } else {
          router.push(`/ship/${encodeURIComponent(starshipSlugOrId)}`)
        }
      }
    } finally {
      setIsDeploying(false)
    }
  }

  const deployedAgent = useMemo(() => (deployedAgents || []).find(agent => agent.sourceTemplateId === templateId), [deployedAgents, templateId])

  return (
    <>
      {isAlreadyDeployed && primaryStarship?.slug ? (
        <Button
          size="sm"
          className="h-9 gap-2 rounded-lg px-3 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={() =>
            router.push(
              deployedAgent?.id
                ? `/ship/${encodeURIComponent(primaryStarship.slug)}/rooms/lobby?agentId=${encodeURIComponent(String(deployedAgent.id))}`
                : `/ship/${encodeURIComponent(primaryStarship.slug)}`
            )
          }
        >
          <Icon name="message-square" className="h-4 w-4" />
          Start chat
        </Button>
      ) : (
        <Button size="sm" onClick={handleDeployClick} disabled={deployDisabled} className="h-9 rounded-lg px-3 text-xs font-semibold">
          <Icon name={deployIconName} className="w-4 h-4 mr-2" />
          {deployLabel}
        </Button>
      )}

      <AgentDeploymentWizardModal
        isOpen={showConfirmationModal}
        onOpenChange={setShowConfirmationModal}
        onConfirm={handleConfirmDeploy}
        isProcessing={isDeploying}
        template={template}
        starshipId={primaryStarship?.id}
        starshipSlug={primaryStarship?.slug}
        starshipName={primaryStarship?.name || 'Unknown Starship'}
        ownedStarships={deployStarships}
      />
    </>
  )
}
