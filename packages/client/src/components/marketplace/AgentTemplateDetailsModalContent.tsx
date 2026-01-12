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

  const toolSlugs: string[] = Array.isArray((template as any)?.assignedToolSlugs)
    ? ((template as any).assignedToolSlugs as unknown[]).filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    : []
  const canCollapseTools = toolSlugs.length > 3

  const { data: toolTemplates = [] } = useToolTemplates(undefined, toolSlugs.length > 0)
  const toolInfoBySlug = useMemo(() => {
    const map = new Map<string, { name: string; description: string; version?: string }>()
    for (const t of toolTemplates as any[]) {
      const slug = (t as any)?.slug
      const name = (t as any)?.name
      const description = (t as any)?.description
      const versionRaw = (t as any)?.version
      const version = typeof versionRaw === 'string' || typeof versionRaw === 'number' ? String(versionRaw) : undefined
      if (typeof slug === 'string' && slug.trim()) {
        map.set(slug, {
          name: typeof name === 'string' && name.trim() ? name : slug,
          description: typeof description === 'string' ? description : '',
          version: version && version.trim().length > 0 ? version : undefined,
        })
      }
    }
    return map
  }, [toolTemplates])

  return (
    <div className="px-6 pb-6 space-y-6">
      {/* Tags + description */}
      <div className="pt-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {template.category ? (
            <Badge variant="outline" className={`capitalize border font-medium ${getCategoryColor(template.category as any)}`}>
              {template.category}
            </Badge>
          ) : null}
          {(template as any)?.version ? (
            <Badge variant="outline" className="font-mono text-xs">
              <Icon name="hash" className="w-3.5 h-3.5 mr-1.5" />v{String((template as any).version)}
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

      {/* Tools section commented out - see git history to restore */}

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
                "{p}"
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
