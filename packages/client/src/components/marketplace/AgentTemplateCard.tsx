'use client'

import Image from 'next/image'
import Icon from '@/components/primitives/Icon'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useQueryClient } from '@tanstack/react-query'
import { useCreateAgentFromTemplate, useRequiredConnectors } from '@/hooks/useTemplates'
import { useStarshipAgents, AGENT_QUERY_KEYS } from '@/hooks/useAgents'
import { useOwnedStarshipsForDeploy, useStarship } from '@/hooks/useStarships'
import { useAuth } from '@/hooks/useAuth'
import { getConnectorLogoSrc } from '@/utils/connectorLogos'
import { AgentDeploymentWizardModal } from './AgentDeploymentWizardModal'

import { memo, useCallback, useMemo, useState } from 'react'
import type { AgentTemplateModel, DeployStarshipOption } from '@starships/protocol'
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
   * Visual density for list rendering.
   * - default: current marketplace card layout
   * - compact: tighter layout for Explore list pages
   */
  density?: 'default' | 'compact'
  /** Show/hide the category badge. Defaults to true. */
  showCategory?: boolean
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

function AgentTemplateCardImpl({ template, onDeploy, onClick, showDeployCta = true, targetStarshipId, density = 'default', showCategory = true }: AgentTemplateCardProps) {
  const compact = density === 'compact'
  const [isDeploying, setIsDeploying] = useState(false)
  const [showConfirmationModal, setShowConfirmationModal] = useState(false)
  const [hiddenLogos, setHiddenLogos] = useState<Record<string, boolean>>({})
  const { data: requiredConnectors = [] } = useRequiredConnectors(template.id, !!template.id)

  // Get current user and their starships for deployment
  const { userId, isAuthenticated } = useAuth()
  const { data: explicitStarship } = useStarship(String(targetStarshipId || ''), !!targetStarshipId && !!isAuthenticated)
  const explicitDeployOption = useMemo(() => {
    if (!explicitStarship) return null
    return { id: explicitStarship.id, slug: explicitStarship.slug ?? '', name: explicitStarship.name ?? '' }
  }, [explicitStarship])
  const { ownedStarships, primaryStarship } = useOwnedStarshipsForDeploy(userId || '', {
    enabled: !!userId,
    explicitStarship: targetStarshipId ? explicitDeployOption : undefined,
  })
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
  const queryClient = useQueryClient()

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

    if (!starship) return
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

  const requiredConnectorLogoItems = useMemo(() => {
    return requiredConnectors.map(({ provider, name }) => ({
      provider,
      name,
      logoSrc: getConnectorLogoSrc(provider),
    }))
  }, [requiredConnectors])

  const hideLogo = useCallback((provider: string) => {
    if (!provider) return
    setHiddenLogos(prev => {
      if (prev[provider]) return prev
      return { ...prev, [provider]: true }
    })
  }, [])

  const handleConfirmDeploy = async (input?: { toolPermissions?: Record<string, AgentToolPermission>; starship?: DeployStarshipOption }) => {
    const targetStarship = input?.starship ?? starship
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
        starshipSlug: safeStarshipPathSegment([(targetStarship as { slug?: string }).slug]) ?? undefined,
      })
      const agentId = (created as any)?.id as string | undefined
      const agentSlug = (created as any)?.slug as string | undefined
      const starshipSlugOrId = safeStarshipPathSegment([(created as any)?._starshipSlug, (targetStarship as { slug?: string }).slug, targetStarship.id])
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

      // Marketplace UX: after deploy, take the user to the agent's chat. Refetch agents so DM page finds the new agent.
      if ((pathname?.startsWith('/explore') || pathname?.startsWith('/marketplace')) && starshipSlugOrId) {
        if (agentId) {
          await queryClient.refetchQueries({ queryKey: AGENT_QUERY_KEYS.byStarship(targetStarship.id) })
          router.push(`/ship/${encodeURIComponent(starshipSlugOrId)}/dm/${encodeURIComponent(`a:${agentId}`)}`)
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
        {compact ? (
          <div className="flex min-h-[116px]">
            {/* Left avatar */}
            <div className="relative w-24 shrink-0 overflow-hidden bg-muted/30">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt={`${displayName || 'Agent'} avatar`} className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
              ) : (
                <div className="absolute inset-0 h-full w-full flex items-center justify-center bg-[radial-gradient(circle_at_center,rgba(124,58,237,0.14),transparent_55%)]">
                  <MarketplaceAvatar
                    imageUrl={null}
                    label={displayName || 'Agent'}
                    seed={displayName || 'AI'}
                    sizeClassName="h-10 w-10"
                    shadowClassName="shadow-sm"
                    fallbackTextClassName="text-sm font-semibold text-muted-foreground"
                    tintClassName="bg-[radial-gradient(circle_at_center,rgba(124,58,237,0.14),transparent_55%)]"
                  />
                </div>
              )}
            </div>

            {/* Right content */}
            <div className="min-w-0 flex-1 flex flex-col p-4">
              <div className="flex items-start justify-between gap-3 min-w-0">
                <div className="min-w-0 flex-1">
                  {/* Name (small) */}
                  {displayRole ? <div className="min-w-0 text-xs text-muted-foreground truncate">{displayName || 'Unnamed agent'}</div> : null}

                  {/* Role (big) */}
                  <div className={displayRole ? 'mt-0.5 text-base font-semibold leading-tight truncate' : 'text-base font-semibold leading-tight truncate'}>
                    {displayRole || displayName || 'Unnamed agent'}
                  </div>
                </div>
              </div>

              {showCategory && template.category ? (
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="capitalize border-border/60 bg-background/30 text-[11px] px-2 py-0.5">
                    {template.category}
                  </Badge>
                </div>
              ) : null}

              {displayDescription ? <div className="mt-2 text-xs text-muted-foreground leading-relaxed line-clamp-2">{displayDescription}</div> : null}

              {/* Footer row (bottom-left logos + bottom-right CTA) */}
              {requiredConnectors.length > 0 || showDeployCta ? (
                <div className="mt-auto pt-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1 min-w-0">
                    {requiredConnectors.length > 0
                      ? requiredConnectorLogoItems.slice(0, 4).map(({ provider, name, logoSrc }) => {
                          const showLogo = !hiddenLogos[provider]
                          return (
                            <div key={provider} className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-white border border-border/40" title={name}>
                              {showLogo ? (
                                <Image src={logoSrc} alt="" width={14} height={14} className="object-contain" onError={() => hideLogo(provider)} />
                              ) : null}
                            </div>
                          )
                        })
                      : null}
                    {requiredConnectors.length > 4 ? <div className="ml-0.5 text-[11px] text-muted-foreground tabular-nums">+{requiredConnectors.length - 4}</div> : null}
                  </div>

                  {showDeployCta ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={e => {
                        e.preventDefault()
                        e.stopPropagation()
                        requestDeploy()
                      }}
                      disabled={deployDisabled}
                      className="h-7 px-2 shrink-0 text-primary hover:text-primary text-xs"
                    >
                      {deployLabel}
                    </Button>
                  ) : (
                    <div />
                  )}
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <>
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
            </div>

            {/* Body */}
            <div className="p-5 flex-1 flex flex-col">
              <div className="min-w-0">
                <div className="text-lg font-semibold leading-tight truncate">{displayName || 'Unnamed agent'}</div>
                {displayRole ? <div className="mt-1 text-sm text-muted-foreground truncate">{displayRole}</div> : null}
                {requiredConnectors.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    {requiredConnectorLogoItems.map(({ provider, name, logoSrc }) => {
                      const showLogo = !hiddenLogos[provider]
                      return (
                        <div key={provider} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white border border-border/40" title={name}>
                          {showLogo ? <Image src={logoSrc} alt="" width={16} height={16} className="object-contain" onError={() => hideLogo(provider)} /> : null}
                        </div>
                      )
                    })}
                  </div>
                ) : null}
              </div>

              <div className="mt-3 flex items-center gap-2 flex-wrap">
                {showCategory && template.category ? (
                  <Badge variant="outline" className="capitalize border-border/60 bg-background/40">
                    {template.category}
                  </Badge>
                ) : null}
                {template.model ? (
                  <Badge variant="outline" className="font-mono text-xs border-border/60 bg-background/40">
                    {template.model}
                  </Badge>
                ) : null}
              </div>

              {displayDescription ? <div className="mt-3 text-sm text-muted-foreground leading-relaxed line-clamp-3">{displayDescription}</div> : null}

              {/* Footer */}
              <div className="mt-auto pt-4 flex items-center justify-end gap-2">
                {showDeployCta ? (
                  isAlreadyDeployed ? (
                    <div className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md bg-emerald-500/15 dark:bg-emerald-500/15 border border-emerald-500/30 dark:border-emerald-500/30 shrink-0">
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
          </>
        )}
      </div>

      {/* Confirmation Modal */}
      <AgentDeploymentWizardModal
        isOpen={showConfirmationModal}
        onOpenChange={setShowConfirmationModal}
        onConfirm={handleConfirmDeploy}
        isProcessing={isDeploying}
        template={template}
        starshipName={(starship as { name?: string })?.name || 'Unknown Starship'}
        starshipId={starship?.id}
        starshipSlug={(starship as { slug?: string })?.slug}
        ownedStarships={ownedStarships}
      />
    </>
  )
}

export const AgentTemplateCard = memo(AgentTemplateCardImpl)
