'use client'

import React, { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { RichMarkdownEditor } from '@/components/ui/RichMarkdownEditor'
import { Badge } from '@/components/ui/badge'
import AgentAvatar from '@/components/animated/AgentAvatar'
import { ModelSelector } from './ModelSelector'
import Icon from '@/components/primitives/Icon'
import type { AgentFormData } from '../types'
import { cn } from '@/lib/utils'
import { getCategoryColor, getCategoryIcon } from '../utils/categoryHelpers'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { AGENT_CATEGORIES, DEFAULT_MODELS } from '../constants'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BlueprintVisualization } from '@/components/marketplace/BlueprintVisualization'

interface AgentDocumentEditorProps {
  value: AgentFormData
  onChange: (next: AgentFormData) => void
  onSave?: () => void
  onCancel?: () => void
}

export function AgentDocumentEditor({ value, onChange, onSave, onCancel }: AgentDocumentEditorProps) {
  const generatedSlug = useMemo(
    () =>
      value.name
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_]+/g, '-')
        .replace(/^-+|-+$/g, ''),
    [value.name]
  )

  const handleNameChange = (name: string) => {
    const shouldUpdateSlug = !value.slug || value.slug === generatedSlug
    const next: AgentFormData = { ...value, name }
    if (shouldUpdateSlug)
      next.slug = name
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_]+/g, '-')
        .replace(/^-+|-+$/g, '')
    onChange(next)
  }

  return (
    <div className="space-y-4 pt-14 pb-28">
      {/* Title */}
      <div className="space-y-4">
        <div className="space-y-6">
          <AgentAvatar seed={value.name || 'agent'} size={64} className="rounded-md overflow-hidden" />
          <div className="space-y-1">
            <input
              className="w-full bg-transparent border-none text-3xl md:text-4xl font-extrabold tracking-tight outline-none focus:ring-0 focus-visible:ring-0 placeholder:text-muted-foreground/50"
              placeholder="Untitled Agent"
              value={value.name}
              onChange={e => handleNameChange(e.target.value)}
            />
            <div className="text-xs text-muted-foreground font-mono pl-1">/{value.slug || generatedSlug}</div>
          </div>
        </div>
      </div>

      {/* Quick selectors: Category and Model */}
      <div className="grid grid-cols-1 gap-2">
        {/* Category quick picker */}
        <div className="inline-flex items-center justify-between gap-2 px-2 h-9 w-fit">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Icon name="tag" className="w-4 h-4" />
            <span className="text-xs font-semibold w-24">Category</span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div role="button" aria-label="Change category" className="inline-flex items-center cursor-pointer select-none rounded-md px-1 py-1 hover:bg-muted/30 hover:shadow-sm transition-colors">
                <Badge variant="outline" className={cn('m-0 gap-1 px-2 py-0.5 rounded-full text-xs [&>svg]:w-3 [&>svg]:h-3', getCategoryColor(value.category))}>
                  {getCategoryIcon(value.category)}
                  <span className="capitalize">{value.category}</span>
                </Badge>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="p-1 w-auto frosted-glass-card rounded-xl shadow-frosted-lg cursor-pointer">
              <div className="flex flex-col gap-0">
                {AGENT_CATEGORIES.map(cat => (
                  <DropdownMenuItem key={cat} className="px-0.5 py-1 cursor-pointer" onSelect={() => onChange({ ...value, category: cat as any })}>
                    <Badge variant="outline" className={cn('m-0 inline-flex w-auto max-w-max items-center gap-1 px-2 py-0.5 rounded-full text-xs [&>svg]:w-3 [&>svg]:h-3', getCategoryColor(cat))}>
                      {getCategoryIcon(cat)}
                      <span className="capitalize">{cat}</span>
                    </Badge>
                  </DropdownMenuItem>
                ))}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Model quick picker */}
        <div className="inline-flex items-center justify-between gap-2 px-2 h-9 w-fit">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Icon name="cpu" className="w-4 h-4" />
            <span className="text-xs font-semibold w-24">Model</span>
          </div>
          <Select value={value.model} onValueChange={m => onChange({ ...value, model: m })}>
            <SelectTrigger className="h-7 w-[220px] text-xs rounded-xl">
              <SelectValue placeholder="Select a model" />
            </SelectTrigger>
            <SelectContent className="w-[300px] p-1 frosted-glass-card rounded-xl shadow-frosted-lg">
              {DEFAULT_MODELS.map(m => (
                <SelectItem key={m} value={m} className="text-xs">
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Description */}
      <Collapsible defaultOpen={true} className="space-y-2">
        <CollapsibleTrigger className="p-1.5">
          <Label className="text-xs font-semibold text-muted-foreground">Description</Label>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <RichMarkdownEditor value={value.description} onChange={val => onChange({ ...value, description: val })} placeholder="Write a clear description. Markdown supported." noMinHeight />
        </CollapsibleContent>
      </Collapsible>

      {/* System Prompt */}
      <Collapsible defaultOpen={true} className="space-y-2">
        <CollapsibleTrigger className="p-1.5">
          <Label className="text-xs font-semibold text-muted-foreground">System Prompt</Label>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <RichMarkdownEditor
            value={value.systemPrompt}
            onChange={val => onChange({ ...value, systemPrompt: val })}
            placeholder="Define the agent's character, mission, and behavior..."
            minHeightPx={200}
          />
        </CollapsibleContent>
      </Collapsible>

      {/* Blueprint */}
      <Collapsible defaultOpen={true} className="space-y-2">
        <CollapsibleTrigger className="p-1.5">
          <Label className="text-xs font-semibold text-muted-foreground">Blueprint</Label>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-2">
            <BlueprintVisualization
              blueprint={(() => {
                try {
                  return JSON.parse(value.blueprint || '{"nodes":[],"edges":[]}')
                } catch {
                  return { nodes: [], edges: [] } as any
                }
              })()}
              className="h-[320px]"
              transparent
              title="Agent Blueprint"
              nodesDraggable={false}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Advanced options */}
      <Collapsible defaultOpen={false} className="space-y-2">
        <CollapsibleTrigger className="p-1.5">
          <Label className="text-xs font-semibold text-muted-foreground">Advanced options</Label>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="agent-temperature" className="text-xs font-medium">
                Temperature
              </Label>
              <Input
                id="agent-temperature"
                type="number"
                min="0"
                max="2"
                step="0.1"
                value={value.temperature}
                onChange={e => onChange({ ...value, temperature: parseFloat(e.target.value) || 0 })}
                className="text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="agent-max-tokens" className="text-xs font-medium">
                Max Tokens
              </Label>
              <Input
                id="agent-max-tokens"
                type="number"
                min="1"
                step="1"
                value={value.maxTokens}
                onChange={e => onChange({ ...value, maxTokens: parseInt(e.target.value, 10) || 2048 })}
                className="text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="agent-timeout" className="text-xs font-medium">
                Timeout (ms)
              </Label>
              <Input
                id="agent-timeout"
                type="number"
                min="1000"
                step="1000"
                value={value.timeout}
                onChange={e => onChange({ ...value, timeout: parseInt(e.target.value, 10) || 60000 })}
                className="text-xs"
              />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Tools */}
      <div className="space-y-2">
        <Label htmlFor="agent-tools" className="text-xs font-medium">
          Assigned Tools (comma separated slugs)
        </Label>
        <Input
          id="agent-tools"
          placeholder="tool-a, tool-b, tool-c"
          value={(value.assignedToolSlugs || []).join(', ')}
          onChange={e => {
            const list = e.target.value
              .split(',')
              .map(s => s.trim())
              .filter(Boolean)
            onChange({ ...value, assignedToolSlugs: list })
          }}
          className="text-xs font-mono"
        />
      </div>

      {/* Category & Icon removed: now controlled via the badge selector above */}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        {onSave && <Button onClick={onSave}>Save</Button>}
      </div>
    </div>
  )
}
