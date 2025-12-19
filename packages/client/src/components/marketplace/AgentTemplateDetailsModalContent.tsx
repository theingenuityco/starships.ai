'use client'

import React, { useMemo, useState } from 'react'
import type { AgentTemplateModel } from '@starships/protocol'

import Icon from '@/components/primitives/Icon'
import AgentAvatar from '@/components/animated/AgentAvatar'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

import { DeploymentConfirmationModal } from '@/components/marketplace/DeploymentConfirmationModal'

import { useAuth } from '@/hooks/useAuth'
import { useCreateAgentFromTemplate } from '@/hooks/useTemplates'
import { useUserStarships } from '@/hooks/useStarships'
import { useStarshipAgents } from '@/hooks/useAgents'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

interface AgentTemplateDetailsModalContentProps {
  template: AgentTemplateModel
  onDeploy?: (template: AgentTemplateModel) => void
  onRequestClose?: () => void
}

export function AgentTemplateDetailsModalContent({ template, onDeploy, onRequestClose }: AgentTemplateDetailsModalContentProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const { userId, isAuthenticated } = useAuth()
  const { data: starships = [] } = useUserStarships(userId || '', !!userId)
  const primaryStarship = starships[0]

  const { data: deployedAgents = [] } = useStarshipAgents(primaryStarship?.id || '', !!primaryStarship)
  const isAlreadyDeployed = useMemo(() => deployedAgents.some(agent => agent.sourceTemplateId === template.id), [deployedAgents, template.id])

  const [showConfirmationModal, setShowConfirmationModal] = useState(false)
  const [isDeploying, setIsDeploying] = useState(false)
  const createAgentMutation = useCreateAgentFromTemplate()

  const toolSlugs: string[] = Array.isArray((template as any)?.assignedToolSlugs)
    ? ((template as any).assignedToolSlugs as unknown[]).filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    : []

  const handleDeployClick = () => {
    if (!isAuthenticated) {
      const current = `${pathname}${searchParams && searchParams.toString() ? `?${searchParams.toString()}` : ''}`
      const params = new URLSearchParams({ returnUrl: current })
      router.push(`/login?${params.toString()}`)
      return
    }
    if (!primaryStarship) return
    setShowConfirmationModal(true)
  }

  const handleConfirmDeploy = async () => {
    if (!primaryStarship) return
    setIsDeploying(true)
    try {
      await createAgentMutation.mutateAsync({
        templateId: template.id,
        starshipId: primaryStarship.id,
      })
      onDeploy?.(template)
      onRequestClose?.()
    } catch {
      // handled by hook
    } finally {
      setIsDeploying(false)
    }
  }

  return (
    <>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start gap-4">
          <Avatar className="h-14 w-14 ring-2 ring-background shadow-md">
            <AgentAvatar seed={template.name} imageUrl={(template as any).avatarUrl} size={56} />
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-xl font-bold leading-tight truncate">{template.name}</h2>
                {(template as any)?.slug ? <div className="font-mono text-xs text-muted-foreground truncate mt-1">{(template as any).slug}</div> : null}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button size="sm" variant="outline" disabled={!primaryStarship || isAlreadyDeployed || isDeploying} onClick={handleDeployClick}>
                  <Icon name={isAlreadyDeployed ? 'check-circle' : 'sparkles'} className="w-4 h-4 mr-2" />
                  {isAlreadyDeployed ? 'Deployed' : isDeploying ? 'Deploying...' : 'Deploy'}
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-3">
              {template.category ? (
                <Badge variant="secondary" className="capitalize">
                  {template.category}
                </Badge>
              ) : null}
              {template.model ? (
                <Badge variant="outline" className="font-mono text-xs">
                  <Icon name="brain" className="w-3.5 h-3.5 mr-1.5" />
                  {template.model}
                </Badge>
              ) : null}
              {typeof template.usageCount === 'number' ? (
                <Badge variant="outline" className="text-xs">
                  <Icon name="download" className="w-3.5 h-3.5 mr-1.5" />
                  {template.usageCount} deployments
                </Badge>
              ) : null}
            </div>

            {template.description ? <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{template.description}</p> : null}
          </div>
        </div>

        <Separator />

        {/* Tools */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-3">
            <Icon name="wrench" className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">Tools</h3>
          </div>
          {toolSlugs.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {toolSlugs.map(slug => (
                <Badge key={slug} variant="secondary" className="font-mono text-[11px]">
                  {slug}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No tools listed.</p>
          )}
        </div>

        {/* Preview prompts */}
        {Array.isArray(template.previewPrompts) && template.previewPrompts.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-3">
              <Icon name="message-square" className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold">Try these prompts</h3>
            </div>
            <div className="space-y-2">
              {template.previewPrompts.map((p, idx) => (
                <div key={idx} className="rounded-lg border border-muted-foreground/20 bg-muted/20 px-3 py-2 text-sm">
                  “{p}”
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

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
