'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import type { AgentTemplateModel } from '@starships/protocol'

import { cn } from '@/lib/utils'
import Icon from '@/components/primitives/Icon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DeploymentConfirmationModal } from '@/components/marketplace/DeploymentConfirmationModal'

import { useAgentTemplates, useCreateAgentFromTemplate } from '@/hooks/useTemplates'
import { useStarshipAgents } from '@/hooks/useAgents'
import { useStarship } from '@/hooks/useStarships'

export interface AgentSuggestionCardProps {
  starshipId: string
  /**
   * Marketplace agent template slugs to suggest (2–3 recommended).
   */
  templateSlugs: string[]
  className?: string
  /**
   * Max number of columns to use when rendering cards in chat.
   * Defaults to 2 (chat-friendly).
   */
  maxColumns?: 1 | 2
}

export function AgentSuggestionCard({ starshipId, templateSlugs, className, maxColumns = 2 }: AgentSuggestionCardProps): React.JSX.Element {
  const router = useRouter()

  const normalized = useMemo(() => {
    const raw = Array.isArray(templateSlugs) ? templateSlugs : []
    const slugs = raw
      .map(s => String(s ?? '').trim())
      .filter(Boolean)
      .map(s => s.toLowerCase())
    // Preserve input order (but dedupe)
    const seen = new Set<string>()
    const ordered: string[] = []
    for (const s of slugs) {
      if (seen.has(s)) continue
      seen.add(s)
      ordered.push(s)
    }
    return ordered.slice(0, 3)
  }, [templateSlugs])

  const { data: starship } = useStarship(starshipId, !!starshipId)
  const { data: deployedAgents = [] } = useStarshipAgents(starshipId, !!starshipId)

  const { data: templates = [], isLoading: templatesLoading } = useAgentTemplates(undefined, true)
  const createAgentMutation = useCreateAgentFromTemplate()

  const suggestedTemplates = useMemo(() => {
    if (!Array.isArray(templates) || normalized.length === 0) return []
    const bySlug = new Map<string, AgentTemplateModel>()
    for (const t of templates) {
      if (!t) continue
      const slug = String(t.slug ?? '').toLowerCase()
      if (slug) bySlug.set(slug, t)
    }
    return normalized.map(s => bySlug.get(s)).filter(Boolean) as AgentTemplateModel[]
  }, [templates, normalized])

  const [selectedTemplate, setSelectedTemplate] = useState<AgentTemplateModel | null>(null)
  const [isDeploying, setIsDeploying] = useState(false)

  const gridClassName =
    maxColumns === 1 ? 'grid gap-4 grid-cols-1' : 'grid gap-4 grid-cols-1 md:grid-cols-2'

  if (!starshipId || normalized.length === 0) {
    return (
      <div className={cn('p-4 border border-red-500 rounded-lg bg-red-50 dark:bg-red-950/20', className)}>
        <p className="text-sm text-red-600 dark:text-red-400">AgentSuggestionCard: missing required props.</p>
      </div>
    )
  }

  if (templatesLoading && suggestedTemplates.length === 0) {
    return (
      <div className={cn('w-full max-w-none', className)}>
        <div className={gridClassName}>
          {[...Array(Math.max(1, normalized.length))].map((_, i) => (
            <div key={i} className="h-48 rounded-lg border border-border/60 bg-card animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={cn('w-full max-w-none', className)}>
      <div className={gridClassName}>
        {suggestedTemplates.map(template => {
          const templateId = String(template.id ?? '')
          const isAlreadyDeployed = !!templateId && deployedAgents.some(a => a.sourceTemplateId === templateId)
          const displayName = String(template.name || '').trim() || 'Unnamed agent'
          const displayRole = String(template.role || '').trim()

          return (
            <Card
              key={template.id}
              className="p-4 border-border/60 bg-card hover:shadow-sm transition-shadow cursor-pointer"
              onClick={() => router.push(`/marketplace/agents/${encodeURIComponent(template.slug)}`)}
              role="button"
              tabIndex={0}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  router.push(`/marketplace/agents/${encodeURIComponent(template.slug)}`)
                }
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold truncate">{displayName}</div>
                  {displayRole ? <div className="text-sm text-muted-foreground truncate mt-0.5">{displayRole}</div> : null}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
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
                </div>

                {isAlreadyDeployed ? (
                  <div className="flex items-center gap-1.5 h-9 px-3 rounded-md bg-emerald-500/15 dark:bg-emerald-500/15 border border-emerald-500/30">
                    <Icon name="check-circle" className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Deployed</span>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    className="h-9"
                    onClick={e => {
                      e.preventDefault()
                      e.stopPropagation()
                      setSelectedTemplate(template)
                    }}
                    disabled={isDeploying || !starshipId}
                  >
                    <Icon name="sparkles" className="w-4 h-4 mr-2" />
                    Deploy
                  </Button>
                )}
              </div>

              {template.description ? <div className="mt-3 text-sm text-muted-foreground line-clamp-3">{template.description}</div> : null}
            </Card>
          )
        })}
      </div>

      <DeploymentConfirmationModal
        isOpen={!!selectedTemplate}
        onOpenChange={open => {
          if (!open) setSelectedTemplate(null)
        }}
        onConfirm={async () => {
          if (!selectedTemplate) return
          if (!starshipId) return
          setIsDeploying(true)
          try {
            await createAgentMutation.mutateAsync({ templateId: selectedTemplate.id, starshipId })
          } finally {
            setIsDeploying(false)
          }
        }}
        isProcessing={isDeploying}
        type="agent"
        template={(selectedTemplate || ({} as any)) as AgentTemplateModel}
        starshipName={starship?.name || 'Your starship'}
      />
    </div>
  )
}

