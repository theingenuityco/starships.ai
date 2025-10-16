'use client'

import React, { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { MarkdownEditor } from '@/components/ui/markdown-editor'
import { ModelSelector } from './ModelSelector'
import { CategorySelector } from './CategorySelector'
import { IconSelector } from './IconSelector'
import type { AgentFormData } from '../types'

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
      <div className="space-y-2">
        <input
          className="w-full bg-transparent border-none text-3xl md:text-4xl font-extrabold tracking-tight outline-none focus:ring-0 focus-visible:ring-0 placeholder:text-muted-foreground/50"
          placeholder="Untitled Agent"
          value={value.name}
          onChange={e => handleNameChange(e.target.value)}
        />
        <div className="text-xs text-muted-foreground font-mono">/{value.slug || generatedSlug}</div>
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label className="text-xs font-medium">Description</Label>
        <MarkdownEditor
          id="agent-description"
          value={value.description}
          onChange={val => onChange({ ...value, description: val })}
          placeholder="Write a clear description. Markdown supported."
          minHeightPx={140}
          showToolbar={false}
          borderless={true}
        />
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
        <MarkdownEditor
          id="agent-system-prompt"
          value={value.systemPrompt}
          onChange={val => onChange({ ...value, systemPrompt: val })}
          placeholder="Define the agent's character, mission, and behavior..."
          minHeightPx={200}
          showToolbar={true}
          borderless={true}
          allowPreviewToggle={false}
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

      {/* Category & Icon */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <CategorySelector selectedCategory={value.category} onCategoryChange={category => onChange({ ...value, category })} />
        <IconSelector selectedIcon={value.icon} onIconChange={icon => onChange({ ...value, icon })} />
      </div>

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
