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
  const starshipsWithOwner = starships as Array<{ id: string; slug: string; name: string; ownerId?: string }>
  const ownedStarships = useMemo(
    () => starshipsWithOwner.filter(s => s.ownerId === userId).map(s => ({ id: s.id, slug: s.slug, name: s.name })),
    [starshipsWithOwner, userId]
  )
  const primaryStarship = ownedStarships[0] ?? null

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

  const handleConfirmDeploy = async (input?: { toolPermissions?: Record<string, AgentToolPermission>; starship?: { id: string; slug: string; name: string } }) => {
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
      const agentSlug = (created as any)?.slug as string | undefined
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

      // Marketplace UX: after deploy, take the user to the correct starship (chat).
      if (pathname?.startsWith('/marketplace') && starshipSlugOrId) {
        if (agentId) {
          router.push(`/ship/${encodeURIComponent(starshipSlugOrId)}/dm/${encodeURIComponent(`a:${agentId}`)}`)
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
          className="h-10 gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={() =>
            router.push(deployedAgent?.id ? `/ship/${encodeURIComponent(primaryStarship.slug)}/dm/${encodeURIComponent(`a:${deployedAgent.id}`)}` : `/ship/${encodeURIComponent(primaryStarship.slug)}`)
          }
        >
          <Icon name="message-square" className="h-4 w-4" />
          Start chat
        </Button>
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
        starshipId={primaryStarship?.id}
        starshipSlug={primaryStarship?.slug}
        ownedStarships={ownedStarships}
      />
    </>
  )
}
