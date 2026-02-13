'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'

import type { AgentTemplateModel } from '@starships/protocol'

import { cn } from '@/lib/utils'
import { AgentTemplateCard } from '@/components/marketplace/AgentTemplateCard'

import { useAgentTemplates } from '@/hooks/useTemplates'

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

  const { data: templates = [], isLoading: templatesLoading } = useAgentTemplates(undefined, true)

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

  const gridClassName = maxColumns === 1 ? 'grid gap-4 grid-cols-1' : 'grid gap-4 grid-cols-1 md:grid-cols-2'

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
        {suggestedTemplates.map((template: AgentTemplateModel) => (
          <AgentTemplateCard
            key={template.id}
            template={template}
            targetStarshipId={starshipId}
            onClick={t => router.push(`/explore/agents/${encodeURIComponent(t.slug)}`)}
          />
        ))}
      </div>
    </div>
  )
}
