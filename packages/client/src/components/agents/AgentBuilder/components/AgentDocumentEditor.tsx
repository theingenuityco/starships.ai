'use client'

import React, { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { RichMarkdownEditor } from '@/components/ui/RichMarkdownEditor'
import { Badge } from '@/components/ui/badge'
import { ModelSelector } from './ModelSelector'
import type { AgentFormData } from '../types'
import { cn } from '@/lib/utils'
import { getCategoryColor, getCategoryIcon } from '../utils/categoryHelpers'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { AGENT_CATEGORIES } from '../constants'

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
    <div className="space-y-8">
      {/* Title */}
      <div className="space-y-4">
        <div className="space-y-1">
          <input
            className="w-full bg-transparent border-none text-3xl md:text-4xl font-extrabold tracking-tight outline-none focus:ring-0 focus-visible:ring-0 placeholder:text-muted-foreground/50"
            placeholder="Untitled Agent"
            value={value.name}
            onChange={e => handleNameChange(e.target.value)}
          />
          <div className="text-xs text-muted-foreground font-mono">/{value.slug || generatedSlug}</div>
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
          <DropdownMenuContent align="start" className="p-1 w-auto frosted-glass-card rounded-xl shadow-frosted-lg cursor-pointer">
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

      {/* Description */}
      <div className="space-y-2">
        <Label className="text-xs font-medium">Description</Label>
        <RichMarkdownEditor value={value.description} onChange={val => onChange({ ...value, description: val })} placeholder="Write a clear description. Markdown supported." minHeightPx={140} />
      </div>

      {/* Model & generation settings */}
      <div className="space-y-4">
        <ModelSelector selectedModel={value.model} onModelChange={model => onChange({ ...value, model })} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
        </div>
      </div>

      {/* System Prompt */}
      <div className="space-y-2">
        <Label className="text-xs font-medium">System Prompt</Label>
        <RichMarkdownEditor
          value={value.systemPrompt}
          onChange={val => onChange({ ...value, systemPrompt: val })}
          placeholder="Define the agent's character, mission, and behavior..."
          minHeightPx={200}
        />
      </div>

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

      {/* Timeout */}
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

      {/* Blueprint JSON */}
      <div className="space-y-2">
        <Label htmlFor="agent-blueprint-json" className="text-xs font-medium">
          Blueprint JSON
        </Label>
        <Textarea
          id="agent-blueprint-json"
          placeholder="Paste blueprint JSON here"
          value={value.blueprint}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange({ ...value, blueprint: e.target.value })}
          className="text-xs font-mono min-h-[200px]"
        />
      </div>

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
