'use client'

import React, { useMemo, useState } from 'react'
import type { AgentTemplateModel } from '@starships/protocol'

import Icon from '@/components/primitives/Icon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useToolTemplates } from '@/hooks/useTemplates'
import { getCategoryColor } from '@/components/agents/AgentBuilder/utils/categoryHelpers'

interface AgentTemplateDetailsModalContentProps {
  template: AgentTemplateModel
}

export function AgentTemplateDetailsModalContent({ template }: AgentTemplateDetailsModalContentProps) {
  const [isToolsExpanded, setIsToolsExpanded] = useState(false)

  const toolSlugs: string[] = Array.isArray(template.assignedToolSlugs)
    ? template.assignedToolSlugs.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    : []
  const canCollapseTools = toolSlugs.length > 3
  const visibleToolSlugs = isToolsExpanded ? toolSlugs : toolSlugs.slice(0, 3)

  const { data: toolTemplates = [] } = useToolTemplates(undefined, toolSlugs.length > 0)
  const toolInfoBySlug = useMemo(() => {
    const map = new Map<string, { name: string; description: string; version?: string }>()
    for (const t of toolTemplates) {
      const slug = typeof t.slug === 'string' ? t.slug.trim() : ''
      if (!slug) continue
      const name = typeof t.name === 'string' && t.name.trim() ? t.name.trim() : slug
      const description = typeof t.description === 'string' ? t.description : ''
      const version = typeof t.version === 'string' && t.version.trim().length > 0 ? t.version.trim() : undefined
      map.set(slug, { name, description, version })
    }
    return map
  }, [toolTemplates])

  return (
    <div className="px-6 pb-6 space-y-6">
      {/* Tags + description */}
      <div className="pt-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {template.category ? (
            <Badge variant="outline" className={`capitalize border font-medium ${getCategoryColor(template.category)}`}>
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

        {template.description ? <p className="text-sm text-muted-foreground leading-relaxed pt-2">{template.description}</p> : null}
      </div>

      {/* Tools */}
      {toolSlugs.length > 0 ? (
        <div className="space-y-4 pt-2">
          <div className="flex items-center gap-2">
            <Icon name="wrench" className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">What can this agent do?</h3>
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
              {toolSlugs.length}
            </Badge>
          </div>

          <div className="space-y-2">
            {visibleToolSlugs.map(slug => {
              const info = toolInfoBySlug.get(slug)
              const title = info?.name ?? slug
              const description = info?.description?.trim() ?? ''

              return (
                <div key={slug} className="rounded-lg border border-muted-foreground/20 bg-muted/20 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium leading-5 truncate">{title}</div>
                      {description ? <div className="mt-0.5 text-xs leading-4 text-muted-foreground line-clamp-2">{description}</div> : null}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {canCollapseTools ? (
            <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground" onClick={() => setIsToolsExpanded(v => !v)}>
              {isToolsExpanded ? 'Show fewer tools' : `Show all ${toolSlugs.length} tools`}
              <Icon name="chevron-down" className={`w-3.5 h-3.5 ml-1 transition-transform ${isToolsExpanded ? 'rotate-180' : ''}`} />
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* Preview prompts */}
      {Array.isArray(template.previewPrompts) && template.previewPrompts.length > 0 ? (
        <div className="space-y-4 pt-2">
          <div className="flex items-center gap-2">
            <Icon name="message-square" className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">Try these prompts</h3>
          </div>
          <div className="space-y-3">
            {template.previewPrompts.map((p, idx) => (
              <div key={idx} className="rounded-lg border border-muted-foreground/20 bg-muted/20 px-4 py-3 text-sm">
                &quot;{p}&quot;
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
