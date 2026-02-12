'use client'

import Image from 'next/image'
import Icon from '@/components/primitives/Icon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DeploymentConfirmationModal } from '@/components/marketplace/DeploymentConfirmationModal'
import { useCreateToolFromTemplate } from '@/hooks/useTemplates'
import { useAuth } from '@/hooks/useAuth'
import { useOwnedStarshipsForDeploy, useStarship } from '@/hooks/useStarships'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import api from '@/lib/api'
import type { ApiResponse, ToolModel, ToolTemplateModel } from '@starships/protocol'
import type { FetchResponse } from '@/lib/types'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { track } from '@/lib/analytics'
import { getConnectorLogoSrc } from '@/utils/connectorLogos'

function pickToolLeftIcon(name: string): { name: string; title: string } {
  const hay = String(name || '').toLowerCase()

  if (/\b(create|edit|modify|update|write)\b/.test(hay)) {
    return { name: 'edit', title: 'Write' }
  }
  if (/\b(suggest|suggestion|recommend|recommendation|advisor|advice|idea|ideas|inspiration|next step|next steps)\b/.test(hay)) {
    return { name: 'lightbulb', title: 'Suggestions' }
  }
  if (/\b(read|get|list|fetch|retrieve|load|pull)\b/.test(hay)) {
    return { name: 'eyeglasses', title: 'Read' }
  }
  if (/(workflow|flow|pipeline|automation)\b/.test(hay)) return { name: 'workflow', title: 'Workflow' }
  if (/\b(search|find|lookup|query)\b/.test(hay)) return { name: 'search', title: 'Search' }
  if (/\b(web|browser|http|https|url|crawl|crawler|scrape|scraper)\b/.test(hay)) return { name: 'globe', title: 'Web' }
  if (/\b(sql|db|database|postgres|postgresql|mysql|sqlite)\b/.test(hay)) return { name: 'database', title: 'Database' }
  if (/\b(file|files|drive|disk|storage)\b/.test(hay)) return { name: 'hard-drive', title: 'Files' }
  if (/\b(audio|voice|speech|transcrib|dictat)\b/.test(hay)) return { name: 'mic', title: 'Audio' }
  if (/\b(test|tests|eval|evaluation|verify|benchmark)\b/.test(hay)) return { name: 'test-tube', title: 'Testing' }

  return { name: 'magic-wand', title: 'Tools' }
}

export function ToolTemplateCard(props: { template: ToolTemplateModel; density?: 'default' | 'compact'; showCategory?: boolean; showInstallCta?: boolean }) {
  const template = props.template
  const density = props.density ?? 'default'
  const compact = density === 'compact'
  const showCategory = props.showCategory ?? true
  const showInstallCta = props.showInstallCta ?? true
  const [isInstalling, setIsInstalling] = useState(false)
  const [showConfirmationModal, setShowConfirmationModal] = useState(false)
  const [hiddenLogos, setHiddenLogos] = useState<Record<string, boolean>>({})

  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const { userId, isAuthenticated } = useAuth()
  const { ownedStarships, primaryStarship } = useOwnedStarshipsForDeploy(userId || '', { enabled: !!userId })
  const starship = primaryStarship
  const { data: explicitStarship } = useStarship(String(starship?.id || ''), Boolean(starship?.id && isAuthenticated))

  const createToolMutation = useCreateToolFromTemplate()

  const displayName = String(template?.name || '').trim() || 'Unnamed tool'
  const displayDescription = String((template as any)?.description || '').trim()
  const category = typeof template?.category === 'string' ? template.category.trim() : ''
  const slug = typeof (template as any)?.slug === 'string' ? String((template as any).slug).trim() : ''
  const requiredConnectorProviders = useMemo(() => {
    const raw = (template as any)?.requiredConnectorProviders
    const list = Array.isArray(raw) ? raw : []
    const normalized = list.map(p => String(p ?? '').trim()).filter(Boolean)
    return Array.from(new Set(normalized))
  }, [template])

  const { data: installedTools = [] } = useQuery({
    queryKey: ['starship-tools', starship?.id || ''] as const,
    queryFn: async (): Promise<ToolModel[]> => {
      if (!starship?.id) return []
      const response: FetchResponse<ApiResponse<ToolModel[]>> = await api.get(`/api/v1/starships/${starship.id}/tools`)
      return response.data.data || []
    },
    enabled: !!(isAuthenticated && starship?.id),
    staleTime: 30 * 1000,
  })

  const isInstalled = useMemo(() => {
    if (!isAuthenticated) return false
    if (!starship?.id) return false
    const tplId = String((template as any)?.id || '').trim()
    const tplSlug = String((template as any)?.slug || '').trim()
    if (!tplId && !tplSlug) return false

    return installedTools.some(t => {
      const sourceId = String((t as any)?.sourceTemplateId || '').trim()
      const sourceSlug = String((t as any)?.sourceTemplateSlug || '').trim()
      const publishedId = String((t as any)?.publishedTemplateId || '').trim()
      const publishedSlug = String((t as any)?.publishedTemplateSlug || '').trim()
      return (tplId && (sourceId === tplId || publishedId === tplId)) || (tplSlug && (sourceSlug === tplSlug || publishedSlug === tplSlug))
    })
  }, [installedTools, isAuthenticated, starship?.id, template])

  const leftIcon = useMemo(() => {
    return pickToolLeftIcon(displayName)
  }, [displayName])

  const deployDisabled = isInstalling || (isAuthenticated && !starship) || !slug
  const installDisabled = deployDisabled || isInstalled
  const installLabel = isInstalled ? 'Installed' : isInstalling ? 'Installing…' : 'Install'

  const requestInstall = () => {
    track({ type: 'marketplace_tool_install_clicked', templateSlug: slug, templateName: displayName, authenticated: !!isAuthenticated })

    if (!isAuthenticated) {
      const current = `${pathname}${searchParams && searchParams.toString() ? `?${searchParams.toString()}` : ''}`
      const params = new URLSearchParams({ returnUrl: current })
      router.push(`/login?${params.toString()}`)
      return
    }
    if (!starship) return
    setShowConfirmationModal(true)
  }

  const starshipSlugOrId = useMemo(() => {
    const candidates = [(explicitStarship as any)?.slug, (starship as any)?.slug, (starship as any)?.id] as unknown[]
    for (const c of candidates) {
      if (typeof c !== 'string') continue
      const raw = c.trim()
      if (!raw) continue
      const lowered = raw.toLowerCase()
      if (lowered === 'undefined' || lowered === 'null') continue
      return raw
    }
    return null
  }, [explicitStarship, starship])

  const handleConfirmInstall = async () => {
    if (!starship?.id || !slug) return
    setIsInstalling(true)
    try {
      await createToolMutation.mutateAsync({
        templateSlug: slug,
        starshipId: String(starship.id),
      })

      // Marketplace UX: keep user moving forward after install.
      if ((pathname?.startsWith('/explore') || pathname?.startsWith('/marketplace')) && starshipSlugOrId) {
        router.push(`/ship/${encodeURIComponent(starshipSlugOrId)}/tools`)
      }
    } finally {
      setIsInstalling(false)
    }
  }

  return (
    <>
      <div className="group relative overflow-hidden h-full flex flex-col rounded-lg border border-border/60 bg-card backdrop-blur-sm shadow-sm transition-all duration-200 hover:shadow-md">
        {compact ? (
          <div className="flex">
            {/* Left fixed strip (edge-to-edge): tools/capabilities icon */}
            <div className="relative w-20 shrink-0 overflow-hidden bg-transparent">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white border border-border/40" title={leftIcon.title}>
                  <Icon name={leftIcon.name} className="h-6 w-6 text-muted-foreground" />
                </div>
              </div>
            </div>

            {/* Right content */}
            <div className="min-w-0 flex-1 flex flex-col py-4 pr-4 pl-0">
              <div className="min-w-0">
                <div className="text-base font-semibold leading-tight truncate">{displayName}</div>
                {showCategory && category ? <div className="mt-1 text-xs text-muted-foreground truncate">{category}</div> : null}
              </div>

              {displayDescription ? <div className="mt-2 text-xs text-muted-foreground leading-relaxed line-clamp-2">{displayDescription}</div> : null}

              {/* Footer row (bottom-left logos + bottom-right CTA) */}
              {requiredConnectorProviders.length > 0 || showInstallCta ? (
                <div className="mt-auto pt-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1 min-w-0">
                    {requiredConnectorProviders.length > 0 ? (
                      <>
                        {requiredConnectorProviders.slice(0, 4).map(provider => {
                          const showLogo = !hiddenLogos[provider]
                          const logoSrc = getConnectorLogoSrc(provider)
                          return (
                            <div key={provider} className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-white border border-border/40" title={provider}>
                              {showLogo ? (
                                <Image src={logoSrc} alt="" width={14} height={14} className="object-contain" onError={() => setHiddenLogos(prev => ({ ...prev, [provider]: true }))} />
                              ) : null}
                            </div>
                          )
                        })}
                        {requiredConnectorProviders.length > 4 ? <div className="ml-0.5 text-[11px] text-muted-foreground tabular-nums">+{requiredConnectorProviders.length - 4}</div> : null}
                      </>
                    ) : null}
                  </div>

                  {showInstallCta ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={e => {
                        e.preventDefault()
                        e.stopPropagation()
                        if (installDisabled) return
                        requestInstall()
                      }}
                      disabled={installDisabled}
                      className="h-7 px-2 shrink-0 text-primary hover:text-primary text-xs"
                    >
                      {installLabel}
                    </Button>
                  ) : (
                    <div />
                  )}
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="p-5 flex-1 flex flex-col">
            <div className="flex items-center gap-1 mb-3">
              {requiredConnectorProviders.length > 0 ? (
                <>
                  {requiredConnectorProviders.slice(0, 10).map(provider => {
                    const showLogo = !hiddenLogos[provider]
                    const logoSrc = getConnectorLogoSrc(provider)
                    return (
                      <div key={provider} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white border border-border/40" title={provider}>
                        {showLogo ? <Image src={logoSrc} alt="" width={20} height={20} className="object-contain" onError={() => setHiddenLogos(prev => ({ ...prev, [provider]: true }))} /> : null}
                      </div>
                    )
                  })}
                  {requiredConnectorProviders.length > 10 ? <span className="ml-1 text-xs text-muted-foreground tabular-nums">+{requiredConnectorProviders.length - 10}</span> : null}
                </>
              ) : (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white border border-border/40 text-muted-foreground" title="Flow">
                  <Icon name="workflow" className="h-5 w-5" />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-lg font-semibold leading-tight truncate">{displayName}</div>
                  {showCategory && category ? (
                    <div className="mt-2">
                      <Badge variant="outline" className="capitalize border-border/60 bg-background/40">
                        {category}
                      </Badge>
                    </div>
                  ) : null}
                </div>
                <div className="shrink-0 h-9 w-9 rounded-lg border border-border/60 bg-background/30 flex items-center justify-center text-muted-foreground">
                  <Icon name="wrench" className="h-4 w-4" />
                </div>
              </div>
            </div>

            {displayDescription ? <div className="mt-3 text-sm text-muted-foreground leading-relaxed line-clamp-3">{displayDescription}</div> : null}

            {showInstallCta ? (
              <div className="mt-auto pt-4 flex items-center justify-end">
                <Button
                  size="sm"
                  onClick={e => {
                    e.preventDefault()
                    e.stopPropagation()
                    requestInstall()
                  }}
                  disabled={deployDisabled}
                  className="h-9 bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Icon name={isInstalling ? 'loader-2' : 'sparkles'} className={isInstalling ? 'w-4 h-4 mr-2 animate-spin' : 'w-4 h-4 mr-2'} />
                  {isInstalling ? 'Installing…' : 'Install'}
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <DeploymentConfirmationModal
        isOpen={showConfirmationModal}
        onOpenChange={setShowConfirmationModal}
        onConfirm={handleConfirmInstall}
        isProcessing={isInstalling}
        type="tool"
        template={template}
        starshipName={(starship as any)?.name || 'Unknown Starship'}
        starshipId={starship?.id}
        starshipSlug={(starship as any)?.slug}
        ownedStarships={ownedStarships}
      />
    </>
  )
}
