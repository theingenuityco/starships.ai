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
    <div className="px-6 pb-0 space-y-6">
      {/* Tags + description */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
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
          {template.category ? (
            <Badge variant="outline" className={`capitalize border font-medium ${getCategoryColor(template.category as any)}`}>
              {template.category}
            </Badge>
          ) : null}
          {typeof template.usageCount === 'number' ? (
            <Badge variant="outline" className="text-xs">
              <Icon name="download" className="w-3.5 h-3.5 mr-1.5" />
              {template.usageCount} deployments
            </Badge>
          ) : null}
        </div>

        {template.description ? <p className="text-sm text-muted-foreground leading-relaxed">{template.description}</p> : null}
      </div>

      {/* Tools */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 mb-3">
          <Icon name="wrench" className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Tools</h3>
        </div>
        {toolSlugs.length > 0 ? (
          <div className="space-y-3">
            <div className={canCollapseTools && !isToolsExpanded ? 'relative max-h-52 overflow-hidden' : 'relative'}>
              <div className="grid grid-cols-1 gap-3">
                {toolSlugs.map(slug => {
                  const info = toolInfoBySlug.get(slug)
                  const name = info?.name ?? slug
                  const description = info?.description ?? ''
                  const version = info?.version
                  const oneLineDescription = (description.split(/\r?\n/)[0] ?? '').trim()
                  return (
                    <div key={slug} className="relative rounded-lg border border-muted-foreground/20 bg-muted/10 hover:bg-muted/20 transition-colors px-3 py-2">
                      {version ? (
                        <div className="absolute top-2 right-2">
                          <Badge variant="outline" className="font-mono text-[9px] px-1.5 py-0.5 leading-none">
                            v{version}
                          </Badge>
                        </div>
                      ) : null}
                      <div className="grid grid-cols-[auto,1fr] gap-x-2.5 gap-y-1.5">
                        {/* Header row */}
                        <div className="mt-0.5 p-1.5 rounded-md bg-primary/10 border border-primary/15">
                          <Icon name="wrench" className="w-3.5 h-3.5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[13px] font-semibold truncate leading-snug">{name}</div>
                          <div className="mt-0.5 text-[9px] font-mono text-muted-foreground truncate leading-snug">{slug}</div>
                        </div>

                        {/* Description row (full width) */}
                        <div className="col-span-2 text-[11px] text-muted-foreground leading-snug line-clamp-2" title={oneLineDescription || undefined}>
                          {oneLineDescription || 'No description provided.'}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {canCollapseTools && !isToolsExpanded ? <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background to-transparent" /> : null}
            </div>

            {canCollapseTools ? (
              <div className="flex justify-center">
                <Button size="sm" variant="ghost" onClick={() => setIsToolsExpanded(v => !v)}>
                  {isToolsExpanded ? 'Show less' : 'Show more'}
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No tools listed.</p>
        )}
      </div>

      {/* Preview prompts */}
      {Array.isArray(template.previewPrompts) && template.previewPrompts.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-3">
            <Icon name="message-square" className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">Try these prompts</h3>
          </div>
          <div className="space-y-2">
            {template.previewPrompts.map((p, idx) => (
              <div key={idx} className="rounded-lg border border-muted-foreground/20 bg-muted/20 px-3 py-2 text-sm">
                “{p}”
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
