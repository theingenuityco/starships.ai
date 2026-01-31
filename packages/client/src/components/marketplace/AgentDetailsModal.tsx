'use client'

import React, { useMemo, useState } from 'react'
import type { AgentTemplateModel } from '@starships/protocol'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { AgentTemplateDetailsModalContent } from '@/components/marketplace/AgentTemplateDetailsModalContent'
import { Button } from '@/components/ui/button'
import Icon from '@/components/primitives/Icon'
import { Avatar } from '@/components/ui/avatar'
import AgentAvatar from '@/components/animated/AgentAvatar'
import { DeploymentConfirmationModal } from '@/components/marketplace/DeploymentConfirmationModal'
import { useAuth } from '@/hooks/useAuth'
import { useUserStarships } from '@/hooks/useStarships'
import { useStarshipAgents } from '@/hooks/useAgents'
import { useCreateAgentFromTemplate } from '@/hooks/useTemplates'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
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

  const handleConfirmDeploy = async (input?: { toolPermissions?: Record<string, AgentToolPermission> }) => {
    if (!template) return
    if (!primaryStarship) return
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
        starshipId: primaryStarship.id,
        starshipSlug: safeStarshipPathSegment([primaryStarship.slug]) ?? undefined,
      })
      const agentId = (created as any)?.id as string | undefined
      const agentSlug = (created as any)?.slug as string | undefined
      const starshipSlugOrId = safeStarshipPathSegment([(created as any)?._starshipSlug, primaryStarship.slug, primaryStarship.id])
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

      // Marketplace UX: after deploy, take the user to the correct starship (chat).
      if (pathname?.startsWith('/marketplace') && starshipSlugOrId) {
        if (agentId) {
          router.push(`/ship/${encodeURIComponent(starshipSlugOrId)}/dm?dm=draft&dmType=user_agent&agentId=${encodeURIComponent(agentId)}`)
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

  // Match Marketplace card CTA semantics
  const deployLabel = isAlreadyDeployed ? 'Already deployed' : isPublishedFromThisStarship ? 'Published from this starship' : isDeploying ? 'Deploying...' : 'Deploy'
  const deployIconName = isAlreadyDeployed ? 'check-circle' : isPublishedFromThisStarship ? 'stars' : 'sparkles'
  const deployDisabled = isAlreadyDeployed || isPublishedFromThisStarship || isDeploying || (isAuthenticated && !primaryStarship)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[85vh] p-0 overflow-hidden flex flex-col">
        <div className="px-6 pt-4 pb-0 pr-14 flex items-center gap-4">
          <Avatar className="h-14 w-14 rounded-full ring-1 ring-border/40 shadow-lg">
            <AgentAvatar seed={template.name} imageUrl={avatarUrl} size={56} rounded />
          </Avatar>
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
          {isAlreadyDeployed ? (
            <div className="relative flex items-center justify-center gap-1.5 h-8 px-3 rounded-md bg-emerald-500/15 dark:bg-emerald-500/15 backdrop-blur-md border border-emerald-500/30 dark:border-emerald-500/30 shadow-lg">
              <Icon name="check-circle" className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Deployed</span>
            </div>
          ) : (
            <Button onClick={handleDeployClick} disabled={deployDisabled}>
              <Icon name={deployIconName} className="w-4 h-4 mr-2" />
              {deployLabel}
            </Button>
          )}
        </div>
      </DialogContent>

      <DeploymentConfirmationModal
        isOpen={showConfirmationModal}
        onOpenChange={setShowConfirmationModal}
        onConfirm={handleConfirmDeploy}
        isProcessing={isDeploying}
        type="agent"
        template={template}
        starshipName={primaryStarship?.name || 'Unknown Starship'}
      />
    </Dialog>
  )
}
