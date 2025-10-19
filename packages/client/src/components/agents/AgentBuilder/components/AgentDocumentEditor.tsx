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
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import type { ToolModel, ApiResponse } from '@starships/protocol'
import type { FetchResponse } from '@/lib/types'

interface AgentDocumentEditorProps {
  value: AgentFormData
  onChange: (next: AgentFormData) => void
  onSave?: () => void
  onCancel?: () => void
  starshipId?: string
}

export function AgentDocumentEditor({ value, onChange, onSave, onCancel, starshipId }: AgentDocumentEditorProps) {
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

  const { data: starshipTools = [] } = useQuery({
    queryKey: ['starship-tools', starshipId] as const,
    queryFn: async (): Promise<ToolModel[]> => {
      if (!starshipId) return []
      const response: FetchResponse<ApiResponse<ToolModel[]>> = await api.get(`/api/v1/starships/${starshipId}/tools`)
      return response.data.data || []
    },
    enabled: !!starshipId,
    staleTime: 30 * 1000,
  })
  const selectedToolSlugs = value.assignedToolSlugs || []
  const allToolOptions = useMemo(() => {
    const fetchedSlugs = Array.isArray(starshipTools) ? Array.from(new Set(starshipTools.map((t: ToolModel) => t.slug).filter(Boolean))) : []
    return Array.from(new Set([...(selectedToolSlugs as string[]), ...fetchedSlugs]))
  }, [starshipTools, selectedToolSlugs])

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
        <div className="inline-flex items-center justify-start gap-2 px-2 h-9 w-fit">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Icon name="tag" className="w-4 h-4" />
            <span className="text-xs font-semibold w-36">Category</span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div role="button" aria-label="Change category" className="inline-flex items-center cursor-pointer select-none rounded-md py-1 hover:bg-muted/30 hover:shadow-sm transition-colors">
                <Badge variant="outline" className={cn('m-0 gap-1 px-2 py-0.5 rounded-full text-xs [&>svg]:w-3 [&>svg]:h-3', getCategoryColor(value.category))}>
                  {getCategoryIcon(value.category)}
                  <span className="capitalize">{value.category}</span>
                </Badge>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="p-1 w-auto frosted-glass-card rounded-xl shadow-frosted-lg cursor-pointer">
              <div className="flex flex-col gap-0">
                {AGENT_CATEGORIES.map(cat => {
                  const isSelected = value.category === cat
                  return (
                    <DropdownMenuItem key={cat} className="px-1.5 py-0.5 cursor-pointer" onSelect={() => onChange({ ...value, category: cat as any })}>
                      <div className={cn('flex items-center', isSelected && 'gap-1.5')}>
                        {isSelected && <Icon name="check" className="w-3 h-3 text-green-500" />}
                        <Badge
                          variant="outline"
                          className={cn(
                            'm-0 inline-flex w-auto max-w-max items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] [&>svg]:w-2.5 [&>svg]:h-2.5',
                            isSelected ? getCategoryColor(cat) : 'bg-muted/20 text-muted-foreground border-muted-foreground/30'
                          )}
                        >
                          {getCategoryIcon(cat)}
                          <span className="capitalize">{cat}</span>
                        </Badge>
                      </div>
                    </DropdownMenuItem>
                  )
                })}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Model quick picker */}
        <div className="inline-flex items-center justify-start gap-2 px-2 h-9 w-fit">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Icon name="cpu" className="w-4 h-4" />
            <span className="text-xs font-semibold w-36">Model</span>
          </div>
          <Select value={value.model} onValueChange={m => onChange({ ...value, model: m })}>
            <SelectTrigger className="h-7 w-[220px] text-xs rounded-xl">
              <SelectValue placeholder="Select a model" />
            </SelectTrigger>
            <SelectContent className="w-[300px] p-1 frosted-glass-card rounded-xl shadow-frosted-lg">
              {DEFAULT_MODELS.map(m => (
                <SelectItem key={m} value={m} className="text-xs px-2 py-1">
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {/* Assigned tools */}
        <div className="inline-flex items-center justify-start gap-2 px-2 h-9 w-fit">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Icon name="wrench" className="w-4 h-4" />
            <span className="text-xs font-semibold w-36">Assigned Tools</span>
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <div role="button" aria-label="Select tools" className="inline-flex items-center cursor-pointer select-none rounded-md py-1 hover:bg-muted/30 hover:shadow-sm transition-colors">
                {selectedToolSlugs.length === 0 ? (
                  <span className="pl-1.5 text-xs text-muted-foreground">Select tools</span>
                ) : (
                  <div className="flex items-center gap-1 flex-wrap">
                    {selectedToolSlugs.map(slug => (
                      <Badge key={slug} variant="outline" className="m-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs [&>svg]:w-3 [&>svg]:h-3">
                        <Icon name="wrench" />
                        <span className="font-mono truncate max-w-[140px]">{slug}</span>
                      </Badge>
                    ))}
                  </div>
                )}
                <Icon name="chevron-down" className="w-3 h-3 opacity-60 ml-2" />
              </div>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[420px] p-1 frosted-glass-card rounded-xl shadow-frosted-lg">
              <Command className="bg-transparent">
                <CommandInput placeholder="Search tools..." />
                <CommandEmpty className="text-xs">No tools found.</CommandEmpty>
                <CommandList>
                  <CommandGroup>
                    {allToolOptions.map(slug => {
                      const isSelected = selectedToolSlugs.includes(slug)
                      return (
                        <CommandItem
                          key={slug}
                          onSelect={() => {
                            const next = isSelected ? selectedToolSlugs.filter(s => s !== slug) : [...selectedToolSlugs, slug]
                            onChange({ ...value, assignedToolSlugs: next })
                          }}
                          className="text-xs px-2 py-1"
                        >
                          <div className={cn('flex items-center', isSelected && 'gap-1.5')}>
                            {isSelected && <Icon name="check" className="w-3 h-3 text-green-500" />}
                            <Badge
                              variant="outline"
                              className={cn(
                                'm-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] [&>svg]:w-2.5 [&>svg]:h-2.5',
                                !isSelected && 'bg-muted/20 text-muted-foreground border-muted-foreground/30'
                              )}
                            >
                              <Icon name="wrench" />
                              <span className="font-mono">{slug}</span>
                            </Badge>
                          </div>
                        </CommandItem>
                      )
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
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

      {/* Category & Icon removed: now controlled via the badge selector above */}
    </div>
  )
}
