'use client'

import { useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'

import type { AgentTemplateModel } from '@starships/protocol'

import PublicHeader from '@/components/navigation/PublicHeader'
import { PageLayout } from '@/components/layout/PageLayout'
import Icon from '@/components/primitives/Icon'
import AgentAvatar from '@/components/animated/AgentAvatar'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

import { useAuth } from '@/hooks/useAuth'
import { useAgentTemplates, useCreateAgentFromTemplate } from '@/hooks/useTemplates'
import { useUserStarships } from '@/hooks/useStarships'
import { useStarshipAgents } from '@/hooks/useAgents'
import { DeploymentConfirmationModal } from '@/components/marketplace/DeploymentConfirmationModal'
import { AgentTemplateDetailsModalContent } from '@/components/marketplace/AgentTemplateDetailsModalContent'
import { track } from '@/lib/analytics'

export default function MarketplaceAgentDetailsPage(props: { params: { slug: string } }) {
  const slug = String(props?.params?.slug ?? '').trim()

  const router = useRouter()
  const pathname = usePathname()

  const { userId, isAuthenticated } = useAuth()
  const { data: starships = [] } = useUserStarships(userId || '', !!userId)
  const primaryStarship = starships[0]

  const { data: agentTemplates = [], isLoading: isLoadingTemplates } = useAgentTemplates(undefined, true)
  const template: AgentTemplateModel | null = useMemo(() => {
    if (!slug) return null
    return agentTemplates.find(t => t.slug === slug) ?? null
  }, [agentTemplates, slug])

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
    if (!template) return
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

  const handleConfirmDeploy = async () => {
    if (!template) return
    if (!primaryStarship) return
    setIsDeploying(true)
    try {
      await createAgentMutation.mutateAsync({
        templateId: template.id,
        starshipId: primaryStarship.id,
        starshipSlug: primaryStarship.slug,
      })
      setShowConfirmationModal(false)
    } finally {
      setIsDeploying(false)
    }
  }

  if (!slug) {
    router.replace('/marketplace')
    return null
  }

  if (isLoadingTemplates) {
    return (
      <>
        {!isAuthenticated && <PublicHeader />}
        <PageLayout requireAuth={false}>
          <div className={`bg-background ${!isAuthenticated ? 'pt-16 sm:pt-20' : ''}`}>
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
              <div className="h-8 w-64 bg-muted rounded animate-pulse" />
              <div className="mt-6 h-[60vh] bg-muted/50 rounded-xl animate-pulse" />
            </div>
          </div>
        </PageLayout>
      </>
    )
  }

  if (!template) {
    return (
      <>
        {!isAuthenticated && <PublicHeader />}
        <PageLayout requireAuth={false}>
          <div className={`bg-background ${!isAuthenticated ? 'pt-16 sm:pt-20' : ''}`}>
            <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
              <div className="rounded-xl border border-border/60 bg-card p-8">
                <div className="flex items-center gap-3">
                  <Icon name="help-circle" className="h-6 w-6 text-muted-foreground" />
                  <div className="text-lg font-semibold">Agent not found</div>
                </div>
                <div className="mt-2 text-sm text-muted-foreground">This marketplace agent doesn’t exist (or is no longer published).</div>
                <div className="mt-6">
                  <Button variant="outline" onClick={() => router.push('/marketplace')}>
                    <Icon name="arrow-left" className="h-4 w-4 mr-2" />
                    Back to marketplace
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </PageLayout>
      </>
    )
  }

  return (
    <>
      {!isAuthenticated && <PublicHeader />}
      <PageLayout requireAuth={false}>
        <div className={`bg-background ${!isAuthenticated ? 'pt-16 sm:pt-20' : ''}`}>
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <Avatar className="h-14 w-14 rounded-full ring-1 ring-border/40 shadow-lg">
                  <AgentAvatar seed={template.name} imageUrl={template.avatarUrl} size={56} rounded />
                </Avatar>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-2xl font-bold leading-tight truncate max-w-[24ch]">{template.name}</h1>
                    {template.category ? (
                      <Badge variant="outline" className="capitalize">
                        {template.category}
                      </Badge>
                    ) : null}
                    {template.version ? (
                      <Badge variant="outline" className="font-mono text-xs">
                        <Icon name="hash" className="w-3.5 h-3.5 mr-1.5" />v{template.version}
                      </Badge>
                    ) : null}
                  </div>
                  {template.role ? <div className="mt-1 text-sm text-muted-foreground truncate max-w-[72ch]">{template.role}</div> : null}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => router.push('/marketplace')}>
                  <Icon name="arrow-left" className="h-4 w-4 mr-2" />
                  Back
                </Button>
                {isAlreadyDeployed ? (
                  <div className="relative flex items-center justify-center gap-1.5 h-10 px-4 rounded-md bg-emerald-500/15 dark:bg-emerald-500/15 backdrop-blur-md border border-emerald-500/30 dark:border-emerald-500/30 shadow-lg">
                    <Icon name="check-circle" className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Deployed</span>
                  </div>
                ) : (
                  <Button onClick={handleDeployClick} disabled={deployDisabled} className="h-10">
                    <Icon name={deployIconName} className="w-4 h-4 mr-2" />
                    {deployLabel}
                  </Button>
                )}
              </div>
            </div>

            <div className="mt-6 rounded-xl border border-border/60 bg-card">
              <AgentTemplateDetailsModalContent template={template} />
            </div>
          </div>
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
      </PageLayout>
    </>
  )
}

