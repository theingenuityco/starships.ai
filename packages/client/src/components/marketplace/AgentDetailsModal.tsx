'use client'

import React, { useMemo, useState } from 'react'
import type { AgentTemplateModel, DeployStarshipOption } from '@starships/protocol'
import { useQueryClient } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { AgentTemplateDetailsModalContent } from '@/components/marketplace/AgentTemplateDetailsModalContent'
import { Button } from '@/components/ui/button'
import Icon from '@/components/primitives/Icon'
import { MarketplaceAvatar } from '@/components/marketplace/MarketplaceAvatar'
import { AgentDeploymentWizardModal } from '@/components/marketplace/AgentDeploymentWizardModal'
import { useAuth } from '@/hooks/useAuth'
import { useStarshipAgents, AGENT_QUERY_KEYS } from '@/hooks/useAgents'
import { useStarshipsForDeploySelection } from '@/hooks/useStarships'
import { useCreateAgentFromTemplate } from '@/hooks/useTemplates'
import { usePathname, useRouter, useSearchParams } from '@/platform/navigation'
import { track } from '@/lib/analytics'
import api from '@/lib/api'
import type { AgentToolPermission, UpdateAgentToolPermissionsRequest } from '@starships/protocol'
import { toast } from 'sonner'

interface AgentDetailsModalProps {
  template: AgentTemplateModel | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeploy?: (template: AgentTemplateModel) => void
}

export function AgentDetailsModal({ template, open, onOpenChange, onDeploy }: AgentDetailsModalProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
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

  const handleDeployClick = () => {
    if (!template) return
    track({
      type: 'marketplace_agent_deploy_clicked',
      templateId: template.id,
      templateName: template.name,
      category: template.category,
      authenticated: !!isAuthenticated,
    })
    if (!isAuthenticated) {
      const current = `${pathname}${searchParams && searchParams.toString() ? `?${searchParams.toString()}` : ''}`
      const params = new URLSearchParams({ returnUrl: current })
      router.push(`/login?${params.toString()}`)
      return
    }
    if (!primaryStarship) return
    setShowConfirmationModal(true)
  }

  const handleConfirmDeploy = async (input?: { toolPermissions?: Record<string, AgentToolPermission>; starship?: DeployStarshipOption }) => {
    if (!template) return
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
      onDeploy?.(template)
      onOpenChange(false)

      // Marketplace UX: after deploy, take the user to the agent's chat. Refetch agents so DM page finds the new agent.
      if ((pathname?.startsWith('/explore') || pathname?.startsWith('/marketplace')) && starshipSlugOrId) {
        if (agentId) {
          await queryClient.refetchQueries({ queryKey: AGENT_QUERY_KEYS.byStarship(targetStarship.id) })
          router.push(`/ship/${encodeURIComponent(starshipSlugOrId)}/dm/${encodeURIComponent(`a:${agentId}`)}`)
        } else {
          router.push(`/ship/${encodeURIComponent(starshipSlugOrId)}`)
        }
      }
    } catch {
      // handled by hook
    } finally {
      setIsDeploying(false)
    }
  }

  if (!template) return null
  const avatarUrl = template.avatarUrl

  // Match marketplace agent CTA semantics
  const deployLabel = isAlreadyDeployed ? 'Installed' : isPublishedFromThisStarship ? 'Published' : isDeploying ? 'Installing…' : 'Install'
  const deployIconName = isAlreadyDeployed ? 'check-circle' : isPublishedFromThisStarship ? 'stars' : 'sparkles'
  const deployDisabled = isAlreadyDeployed || isPublishedFromThisStarship || isDeploying || (isAuthenticated && !primaryStarship)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[85vh] p-0 overflow-hidden flex flex-col">
        <div className="px-6 pt-4 pb-0 pr-14 flex items-center gap-4">
          <MarketplaceAvatar
            imageUrl={avatarUrl || null}
            label={template.name}
            seed={template.name || template.slug || 'AI'}
            sizeClassName="h-14 w-14"
            shapeClassName="rounded-full"
            ringClassName="ring-1 ring-border/40"
            shadowClassName="shadow-lg"
            showTintWhenMissing={false}
            showInsetRing={false}
            fallbackTextClassName="text-base font-semibold text-muted-foreground"
          />
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-xl font-bold leading-tight truncate">{template.name}</DialogTitle>
            {template.role ? <div className="mt-0.5 text-sm text-muted-foreground truncate">{template.role}</div> : null}
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <AgentTemplateDetailsModalContent template={template} />
        </div>
        <div className="shrink-0 bg-card/60 backdrop-blur-sm px-6 pt-0 pb-4 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {isAlreadyDeployed && primaryStarship?.slug ? (
            <Button
              className="h-8 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => {
                const deployedAgent = deployedAgents.find(a => a.sourceTemplateId === template?.id)
                router.push(
                  deployedAgent?.id ? `/ship/${encodeURIComponent(primaryStarship.slug)}/dm/${encodeURIComponent(`a:${deployedAgent.id}`)}` : `/ship/${encodeURIComponent(primaryStarship.slug)}`
                )
                onOpenChange(false)
              }}
            >
              <Icon name="message-square" className="h-3.5 w-3.5" />
              Start chat
            </Button>
          ) : (
            <Button onClick={handleDeployClick} disabled={deployDisabled}>
              <Icon name={deployIconName} className="w-4 h-4 mr-2" />
              {deployLabel}
            </Button>
          )}
        </div>
      </DialogContent>

      <AgentDeploymentWizardModal
        isOpen={showConfirmationModal}
        onOpenChange={setShowConfirmationModal}
        onConfirm={handleConfirmDeploy}
        isProcessing={isDeploying}
        template={template}
        starshipName={primaryStarship?.name || 'Unknown Starship'}
        starshipId={primaryStarship?.id}
        starshipSlug={primaryStarship?.slug}
        ownedStarships={deployStarships}
      />
    </Dialog>
  )
}
