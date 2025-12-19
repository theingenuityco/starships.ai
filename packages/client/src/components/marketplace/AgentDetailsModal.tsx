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

  const [showConfirmationModal, setShowConfirmationModal] = useState(false)
  const [isDeploying, setIsDeploying] = useState(false)
  const createAgentMutation = useCreateAgentFromTemplate()

  const handleDeployClick = () => {
    if (!template) return
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
    if (!template) return
    if (!primaryStarship) return
    setIsDeploying(true)
    try {
      await createAgentMutation.mutateAsync({
        templateId: template.id,
        starshipId: primaryStarship.id,
      })
      onDeploy?.(template)
      onOpenChange(false)
    } catch {
      // handled by hook
    } finally {
      setIsDeploying(false)
    }
  }

  if (!template) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[85vh] p-0 overflow-hidden flex flex-col">
        <div className="px-6 pt-4 pb-0 pr-14 flex items-center gap-4">
          <Avatar className="h-14 w-14 rounded-full ring-1 ring-border/40 shadow-lg">
            <AgentAvatar seed={template.name} imageUrl={(template as any).avatarUrl} size={56} rounded />
          </Avatar>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-xl font-bold leading-tight truncate">{template.name}</DialogTitle>
            {(template as any)?.slug ? <div className="mt-0.5 font-mono text-sm text-muted-foreground truncate">{(template as any).slug}</div> : null}
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <AgentTemplateDetailsModalContent template={template} />
        </div>
        <div className="shrink-0 bg-card/60 backdrop-blur-sm px-6 pt-0 pb-4 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={handleDeployClick} disabled={!primaryStarship || isAlreadyDeployed || isDeploying}>
            <Icon name={isAlreadyDeployed ? 'check-circle' : 'sparkles'} className="w-4 h-4 mr-2" />
            {isAlreadyDeployed ? 'Deployed' : isDeploying ? 'Deploying...' : 'Deploy'}
          </Button>
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
