'use client'

import Icon from '@/components/primitives/Icon'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useCreateAgentFromTemplate } from '@/hooks/useTemplates'
import { useStarship, useUserStarships } from '@/hooks/useStarships'
import { useStarshipAgents } from '@/hooks/useAgents'
import { useAuth } from '@/hooks/useAuth'
import { DeploymentConfirmationModal } from './DeploymentConfirmationModal'

import { useMemo, useState } from 'react'
import type { AgentTemplateModel } from '@starships/protocol'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { track } from '@/lib/analytics'
import api from '@/lib/api'
import type { AgentToolPermission, UpdateAgentToolPermissionsRequest } from '@starships/protocol'
import { toast } from 'sonner'
import { MarketplaceAvatar } from '@/components/marketplace/MarketplaceAvatar'

interface AgentTemplateCardProps {
  template: AgentTemplateModel
  onDeploy?: (template: AgentTemplateModel) => void
  onClick?: (template: AgentTemplateModel) => void
  /**
   * Optional override: deploy/compare against a specific starship instead of the user's primary starship.
   * Useful for inline widgets embedded in a specific starship context (e.g. onboarding).
   */
  targetStarshipId?: string
  /**
   * When false, hides the bottom-right Deploy CTA (useful for landing page carousel previews).
   * Defaults to true.
   */
  showDeployCta?: boolean
}

export function AgentTemplateCard({ template, onDeploy, onClick, showDeployCta = true, targetStarshipId }: AgentTemplateCardProps) {
  const [isDeploying, setIsDeploying] = useState(false)
  const [showConfirmationModal, setShowConfirmationModal] = useState(false)

  // Get current user and their starships for deployment
  const { userId, isAuthenticated } = useAuth()
  const { data: starships = [] } = useUserStarships(userId || '', !!userId && !targetStarshipId)
  const primaryStarship = starships[0] // Use first starship by default
  const { data: explicitStarship } = useStarship(String(targetStarshipId || ''), !!targetStarshipId && !!isAuthenticated)
  const starship = targetStarshipId ? (explicitStarship ?? { id: targetStarshipId, slug: '', name: '' }) : primaryStarship

  // Get deployed agents to check if this template is already deployed
  const { data: deployedAgents = [] } = useStarshipAgents(starship?.id || '', !!starship)

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
      category: template.category,
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
      category: template.category,
    })
    onClick?.(template)
  }

  const avatarUrl = template.avatarUrl
  const displayName = String(template.name || '').trim()
  const displayRole = String(template.role || '').trim()
  const displayDescription = String(template.description || '').trim()
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase())
    .join('')

  const deployLabel = isAlreadyDeployed ? 'Deployed' : isPublishedFromThisStarship ? 'Published' : isDeploying ? 'Deploying…' : 'Deploy'
  const deployIconName = isAlreadyDeployed ? 'check-circle' : isPublishedFromThisStarship ? 'stars' : 'sparkles'
  const deployDisabled = isAlreadyDeployed || isPublishedFromThisStarship || isDeploying || (isAuthenticated && !starship)

  const handleConfirmDeploy = async (input?: { toolPermissions?: Record<string, AgentToolPermission> }) => {
    if (!starship) {
      return // No starship to deploy to
    }

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
        starshipId: starship.id,
        starshipSlug: safeStarshipPathSegment([(starship as any)?.slug]) ?? undefined,
      })
      const agentId = (created as any)?.id as string | undefined
      const agentSlug = (created as any)?.slug as string | undefined
      const starshipSlugOrId = safeStarshipPathSegment([(created as any)?._starshipSlug, (starship as any)?.slug, starship.id])
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

      // Marketplace UX: after deploy, take the user to the correct starship (chat).
      // Guarded so uses of this card outside the marketplace don't unexpectedly navigate.
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
      <div
        role="button"
        tabIndex={0}
        onClick={handleCardClick}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleCardClick()
          }
        }}
        className="group relative overflow-hidden cursor-pointer h-full flex flex-col rounded-lg border border-border/60 bg-card backdrop-blur-sm shadow-sm transition-all duration-200 hover:shadow-md"
      >
        {/* Thumbnail */}
        <div className="relative w-full aspect-[4/3] overflow-hidden bg-muted/30">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt={`${displayName || 'Agent'} avatar`} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
          ) : (
            <div className="h-full w-full flex items-center justify-center bg-[radial-gradient(circle_at_center,rgba(124,58,237,0.14),transparent_55%)]">
              <MarketplaceAvatar
                imageUrl={null}
                label={displayName || 'Agent'}
                seed={displayName || 'AI'}
                sizeClassName="h-14 w-14"
                shadowClassName="shadow-sm"
                fallbackTextClassName="text-lg font-semibold text-muted-foreground"
                tintClassName="bg-[radial-gradient(circle_at_center,rgba(124,58,237,0.14),transparent_55%)]"
              />
            </div>
          )}
          {/* Soft overlay for readability */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/70 via-background/15 to-transparent" />
        </div>

        {/* Body */}
        <div className="p-5 flex-1 flex flex-col">
          <div className="min-w-0">
            <div className="text-lg font-semibold leading-tight truncate">{displayName || 'Unnamed agent'}</div>
            {displayRole ? <div className="mt-1 text-sm text-muted-foreground truncate">{displayRole}</div> : null}
          </div>

          <div className="mt-3 flex items-center gap-2 flex-wrap">
            {template.category ? (
              <Badge variant="outline" className="capitalize border-border/60 bg-background/40">
                {template.category}
              </Badge>
            ) : null}
            {template.version ? (
              <Badge variant="outline" className="font-mono text-xs border-border/60 bg-background/40">
                v{template.version}
              </Badge>
            ) : null}
          </div>

          {displayDescription ? <div className="mt-3 text-sm text-muted-foreground leading-relaxed line-clamp-3">{displayDescription}</div> : null}

          {/* Footer */}
          <div className="mt-auto pt-4 flex items-center justify-end">
            {showDeployCta ? (
              isAlreadyDeployed ? (
                <div className="relative flex items-center justify-center gap-1.5 h-9 px-3 rounded-md bg-emerald-500/15 dark:bg-emerald-500/15 backdrop-blur-md border border-emerald-500/30 dark:border-emerald-500/30 shadow-sm">
                  <Icon name="check-circle" className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Deployed</span>
                </div>
              ) : (
                <Button
                  size="sm"
                  onClick={e => {
                    e.preventDefault()
                    e.stopPropagation()
                    requestDeploy()
                  }}
                  disabled={deployDisabled}
                  className="h-9 bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Icon name={deployIconName} className="w-4 h-4 mr-2" />
                  {deployLabel}
                </Button>
              )
            ) : null}
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      <DeploymentConfirmationModal
        isOpen={showConfirmationModal}
        onOpenChange={setShowConfirmationModal}
        onConfirm={handleConfirmDeploy}
        isProcessing={isDeploying}
        type="agent"
        template={template}
        starshipName={(starship as any)?.name || 'Unknown Starship'}
      />
    </>
  )
}
