'use client'

import Image from 'next/image'
import Icon from '@/components/primitives/Icon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DeploymentConfirmationModal } from '@/components/marketplace/DeploymentConfirmationModal'
import { useCreateToolFromTemplate } from '@/hooks/useTemplates'
import { useAuth } from '@/hooks/useAuth'
import { useOwnedStarshipsForDeploy, useStarship } from '@/hooks/useStarships'
import { useMemo, useState } from 'react'
import type { ToolTemplateModel } from '@starships/protocol'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { track } from '@/lib/analytics'
import { getConnectorLogoSrc } from '@/utils/connectorLogos'

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

  const deployDisabled = isInstalling || (isAuthenticated && !starship) || !slug

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
    const candidates = [
      (explicitStarship as any)?.slug,
      (starship as any)?.slug,
      (starship as any)?.id,
    ] as unknown[]
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
          <div className="min-h-[116px] p-4">
            <div className="min-w-0 flex flex-col">
              {requiredConnectorProviders.length > 0 ? (
                <div className="flex items-center gap-1 mb-2">
                  {requiredConnectorProviders.slice(0, 8).map(provider => {
                    const showLogo = !hiddenLogos[provider]
                    const logoSrc = getConnectorLogoSrc(provider)
                    return (
                      <div key={provider} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white border border-border/40" title={provider}>
                        {showLogo ? (
                          <Image
                            src={logoSrc}
                            alt=""
                            width={24}
                            height={24}
                            className="object-contain"
                            onError={() => setHiddenLogos(prev => ({ ...prev, [provider]: true }))}
                          />
                        ) : null}
                      </div>
                    )
                  })}
                  {requiredConnectorProviders.length > 8 ? (
                    <span className="ml-0.5 text-[11px] text-muted-foreground tabular-nums">+{requiredConnectorProviders.length - 8}</span>
                  ) : null}
                </div>
              ) : null}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-base font-semibold leading-tight truncate">{displayName}</div>
                  {showCategory && category ? <div className="mt-0.5 text-xs text-muted-foreground truncate">{category}</div> : null}
                </div>

                {showInstallCta ? (
                  <Button
                    size="sm"
                    onClick={e => {
                      e.preventDefault()
                      e.stopPropagation()
                      requestInstall()
                    }}
                    disabled={deployDisabled}
                    className="h-8 bg-primary text-primary-foreground hover:bg-primary/90 px-3 shrink-0"
                  >
                    <Icon name={isInstalling ? 'loader-2' : 'sparkles'} className={isInstalling ? 'w-3.5 h-3.5 mr-2 animate-spin' : 'w-3.5 h-3.5 mr-2'} />
                    {isInstalling ? 'Installing…' : 'Install'}
                  </Button>
                ) : null}
              </div>

              {displayDescription ? <div className="mt-2 text-xs text-muted-foreground leading-relaxed line-clamp-2">{displayDescription}</div> : null}
            </div>
          </div>
        ) : (
          <div className="p-5 flex-1 flex flex-col">
            {requiredConnectorProviders.length > 0 ? (
              <div className="flex items-center gap-1 mb-3">
                {requiredConnectorProviders.slice(0, 10).map(provider => {
                  const showLogo = !hiddenLogos[provider]
                  const logoSrc = getConnectorLogoSrc(provider)
                  return (
                    <div key={provider} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white border border-border/40" title={provider}>
                      {showLogo ? (
                        <Image
                          src={logoSrc}
                          alt=""
                          width={24}
                          height={24}
                          className="object-contain"
                          onError={() => setHiddenLogos(prev => ({ ...prev, [provider]: true }))}
                        />
                      ) : null}
                    </div>
                  )
                })}
                {requiredConnectorProviders.length > 10 ? (
                  <span className="ml-1 text-xs text-muted-foreground tabular-nums">+{requiredConnectorProviders.length - 10}</span>
                ) : null}
              </div>
            ) : null}
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

