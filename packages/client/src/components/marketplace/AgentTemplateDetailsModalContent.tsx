'use client'

import React, { useMemo } from 'react'
import type { AgentTemplateModel } from '@starships/protocol'

import Icon from '@/components/primitives/Icon'
import AgentAvatar from '@/components/animated/AgentAvatar'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { useToolTemplates } from '@/hooks/useTemplates'

interface AgentTemplateDetailsModalContentProps {
  template: AgentTemplateModel
}

export function AgentTemplateDetailsModalContent({ template }: AgentTemplateDetailsModalContentProps) {
  const toolSlugs: string[] = Array.isArray((template as any)?.assignedToolSlugs)
    ? ((template as any).assignedToolSlugs as unknown[]).filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    : []

  const { data: toolTemplates = [] } = useToolTemplates(undefined, toolSlugs.length > 0)
  const toolInfoBySlug = useMemo(() => {
    const map = new Map<string, { name: string; description: string }>()
    for (const t of toolTemplates as any[]) {
      const slug = (t as any)?.slug
      const name = (t as any)?.name
      const description = (t as any)?.description
      if (typeof slug === 'string' && slug.trim()) {
        map.set(slug, {
          name: typeof name === 'string' && name.trim() ? name : slug,
          description: typeof description === 'string' ? description : '',
        })
      }
    }
    return map
  }, [toolTemplates])

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="space-y-3">
        {/* Row 1: avatar + title/slug */}
        <div className="flex items-start gap-4">
          <Avatar className="h-14 w-14 rounded-full ring-2 ring-background shadow-md">
            <AgentAvatar seed={template.name} imageUrl={(template as any).avatarUrl} size={56} rounded />
          </Avatar>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold leading-tight truncate">{template.name}</h2>
            {(template as any)?.slug ? <div className="font-mono text-xs text-muted-foreground truncate mt-1">{(template as any).slug}</div> : null}
          </div>
        </div>

        {/* Row 2: tags + description (below avatar row) */}
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
              <Badge variant="secondary" className="capitalize">
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
      </div>

      {/* Tools */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 mb-3">
          <Icon name="wrench" className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Tools</h3>
        </div>
        {toolSlugs.length > 0 ? (
          <div className="grid grid-cols-1 gap-3">
            {toolSlugs.map(slug => {
              const info = toolInfoBySlug.get(slug)
              const name = info?.name ?? slug
              const description = info?.description ?? ''
              const oneLineDescription = (description.split(/\r?\n/)[0] ?? '').trim()
              return (
                <div key={slug} className="rounded-xl border border-muted-foreground/20 bg-muted/10 hover:bg-muted/20 transition-colors px-4 py-3">
                  <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-2">
                    {/* Header row */}
                    <div className="mt-0.5 p-2 rounded-lg bg-primary/10 border border-primary/15">
                      <Icon name="wrench" className="w-4 h-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{name}</div>
                      <div className="mt-0.5 text-[10px] font-mono text-muted-foreground truncate">{slug}</div>
                    </div>

                    {/* Description row (full width) */}
                    <div className="col-span-2 text-xs text-muted-foreground leading-relaxed line-clamp-2" title={oneLineDescription || undefined}>
                      {oneLineDescription || 'No description provided.'}
                    </div>
                  </div>
                </div>
              )
            })}
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
