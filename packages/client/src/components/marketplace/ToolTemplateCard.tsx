'use client'

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

export function ToolTemplateCard(props: { template: ToolTemplateModel }) {
  const template = props.template
  const [isInstalling, setIsInstalling] = useState(false)
  const [showConfirmationModal, setShowConfirmationModal] = useState(false)

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
        <div className="p-5 flex-1 flex flex-col">
          <div className="min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-lg font-semibold leading-tight truncate">{displayName}</div>
                {category ? (
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
        </div>
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

