'use client'

import React, { useEffect, useMemo, useRef } from 'react'
import type { AgentTemplateModel } from '@starships/protocol'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { AgentBuilderView, type AgentBuilderViewRef } from '@/components/agents/AgentBuilder'
import { useAuth } from '@/hooks/useAuth'
import { useUserStarships } from '@/hooks/useStarships'

interface AgentDetailsModalProps {
  template: AgentTemplateModel | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeploy?: (template: AgentTemplateModel) => void
}

export function AgentDetailsModal({ template, open, onOpenChange, onDeploy }: AgentDetailsModalProps) {
  // Prefer the user's primary starship if authenticated; allows the underlying
  // agent builder component to resolve tools + avatars (even in read-only mode).
  const { userId } = useAuth()
  const { data: starships = [] } = useUserStarships(userId || '', !!userId)
  const primaryStarshipId = starships?.[0]?.id

  const initialForm = useMemo(() => {
    if (!template) return null
    const blueprintStr = (() => {
      try {
        return JSON.stringify((template as any)?.blueprint ?? { nodes: [], edges: [] }, null, 2)
      } catch {
        return JSON.stringify({ nodes: [], edges: [] }, null, 2)
      }
    })()

    return {
      name: template.name ?? '',
      slug: template.slug ?? '',
      description: template.description ?? '',
      category: (template.category as any) ?? 'general',
      model: template.model ?? '',
      temperature: typeof (template as any).temperature === 'number' ? (template as any).temperature : 0.7,
      maxTokens: typeof (template as any).maxTokens === 'number' ? (template as any).maxTokens : 2048,
      systemPrompt: template.systemPrompt ?? '',
      previewPrompts: Array.isArray((template as any).previewPrompts) ? ((template as any).previewPrompts as string[]) : [],
      assignedToolSlugs: Array.isArray((template as any).assignedToolSlugs) ? ((template as any).assignedToolSlugs as string[]) : [],
      blueprint: blueprintStr,
      timeout: typeof (template as any).timeout === 'number' ? (template as any).timeout : 60,
      icon: typeof (template as any).icon === 'string' ? ((template as any).icon as string) : '',
    }
  }, [template])

  const builderRef = useRef<AgentBuilderViewRef>(null)
  useEffect(() => {
    if (!template) return
    if (!open) return
    if (!builderRef.current) return
    if (!initialForm) return

    // Seed the builder form from the template when opening the modal.
    // (AgentBuilderView initializes empty state by default.)
    try {
      ;(Object.keys(initialForm) as Array<keyof typeof initialForm>).forEach(k => {
        builderRef.current?.updateField?.(k as any, (initialForm as any)[k])
      })
    } catch {}
  }, [open, initialForm, template])

  if (!template) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[85vh] p-0 overflow-hidden">
        <div className="h-[85vh] overflow-hidden">
          <AgentBuilderView
            ref={builderRef}
            starshipId={primaryStarshipId}
            initialSlug={template.slug}
            readOnly={true}
            onCancel={() => onOpenChange(false)}
            // Marketplace details modal is read-only; deploy is handled elsewhere.
            onSave={undefined}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
