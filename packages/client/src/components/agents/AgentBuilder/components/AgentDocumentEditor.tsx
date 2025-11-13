'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
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
import { AGENT_CATEGORIES } from '../constants'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BlueprintVisualization } from '@/components/marketplace/BlueprintVisualization'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { useQuery } from '@tanstack/react-query'
import api, { getCurrentToken } from '@/lib/api'
import type { ToolModel, ApiResponse, AgentModel } from '@starships/protocol'
import type { FetchResponse } from '@/lib/types'
import { toast } from 'sonner'
import { useOpenRouterModels } from '@/hooks/useOpenRouterModels'
import { useUpdateAgentFromTemplate } from '@/hooks/useAgentUpdate'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface AgentDocumentEditorProps {
  value: AgentFormData
  onChange: (next: AgentFormData) => void
  onFieldChange?: (field: keyof AgentFormData, value: string | boolean | number | string[]) => void
  onSave?: () => void
  onCancel?: () => void
  starshipId?: string
}

export function AgentDocumentEditor({ value, onChange, onFieldChange, onSave, onCancel, starshipId }: AgentDocumentEditorProps) {
  const { data: openRouterModels, isLoading: isLoadingModels } = useOpenRouterModels()

  const availableModels = useMemo(() => {
    return openRouterModels?.map(m => m.id) || []
  }, [openRouterModels])

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

  // Store full agent data including version info
  const [fullAgent, setFullAgent] = useState<AgentModel | null>(null)

  // Dialog state for update confirmation
  const [showUpdateDialog, setShowUpdateDialog] = useState(false)

  // Check if this is a template-based agent (has templateId) - these are read-only
  const isTemplateAgent = useMemo(() => {
    return !!fullAgent?.templateId
  }, [fullAgent?.templateId])

  // Update mutation for template agents
  const updateMutation = useUpdateAgentFromTemplate()

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

  // Resolve current agentId by slug within this starship (if editing existing) - starship-only
  const [agentId, setAgentId] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    const safeGet = async <T,>(url: string): Promise<{ ok: boolean; data: T | null }> => {
      try {
        const token = await getCurrentToken()
        const res = await fetch(url, {
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          method: 'GET',
        } as RequestInit)
        if (!res.ok) return { ok: false, data: null }
        const json = await res.json()
        return { ok: true, data: (json?.data as T) ?? null }
      } catch {
        return { ok: false, data: null }
      }
    }
    const load = async () => {
      if (!starshipId || !value?.slug || value.slug === 'new') {
        console.debug('[AgentDocEditor] Skipping agentId resolve', { starshipId, slug: value?.slug })
        setAgentId(null)
        return
      }
      const starshipUrl = `/api/v1/starships/${starshipId}/agents/${value.slug}`
      const result = await safeGet<ApiResponse<AgentModel>>(starshipUrl)
      if (result.ok && (result.data as any)?.id) {
        const agent: any = result.data as any
        console.debug('[AgentDocEditor] Resolved agentId', { slug: value.slug, id: agent?.id })
        if (!cancelled) {
          setAgentId(agent?.id || null)
          setFullAgent(agent as AgentModel)
        }
      } else {
        if (!cancelled) {
          setAgentId(null)
          setFullAgent(null)
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [starshipId, value?.slug])

  // Toggle tool assignment with optimistic UI and server persistence when possible
  const handleToggleTool = async (slug: string, isSelected: boolean) => {
    // Prevent tool changes for template agents
    if (isTemplateAgent) {
      toast.error('Cannot modify tools', { description: 'Template agents are read-only. Use the update button to sync with the latest template version.' })
      return
    }
    const next = isSelected ? selectedToolSlugs.filter(s => s !== slug) : [...selectedToolSlugs, slug]
    onFieldChange?.('assignedToolSlugs', next)
    if (!agentId) return
    try {
      if (isSelected) await api.delete(`/api/v1/agents/${agentId}/tools/${slug}`)
      else await api.post(`/api/v1/agents/${agentId}/tools/${slug}`)
    } catch (err: any) {
      onFieldChange?.('assignedToolSlugs', selectedToolSlugs)
      const message = err?.response?.data?.error || err?.message || 'Failed to update tools'
      toast.error('Tool update failed', { description: message })
    }
  }

  const handleUpdateFromTemplate = async () => {
    if (!agentId) return

    try {
      await updateMutation.mutateAsync(agentId)
      setShowUpdateDialog(false)
      // Reload the page to refresh all data
      window.location.reload()
    } catch (error: any) {
      // Error toast is handled by the mutation hook
    }
  }

  const handleNameChange = (name: string) => {
    if (isTemplateAgent) {
      toast.error('Cannot modify name', { description: 'Template agents are read-only' })
      return
    }
    const shouldUpdateSlug = !value.slug || value.slug === generatedSlug
    onFieldChange?.('name', name)
    if (shouldUpdateSlug) {
      const slugified = name
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_]+/g, '-')
        .replace(/^-+|-+$/g, '')
      onFieldChange?.('slug', slugified)
    }
  }

  // If slug is empty but we can infer it from window.location, set it once as a last resort
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (value.slug && value.slug.trim() !== '') return
    try {
      const parts = window.location.pathname.split('/')
      // Expect /ship/:slug/agent/:agentSlug
      const idx = parts.findIndex(p => p === 'agent')
      const routeSlug = idx >= 0 ? parts[idx + 1] : ''
      if (routeSlug && routeSlug !== 'new') {
        onFieldChange?.('slug', routeSlug)
      }
    } catch {}
  }, [])

  // Initial sync of assigned tools for existing agents on load
  const hasSyncedAssignedRef = useRef<boolean>(false)
  useEffect(() => {
    const syncAssigned = async () => {
      if (!agentId || hasSyncedAssignedRef.current) return
      try {
        const res: FetchResponse<ApiResponse<ToolModel[]>> = await api.get(`/api/v1/agents/${agentId}/tools`)
        const tools = res.data.data || []
        const slugs = Array.from(new Set((tools || []).map(t => t.slug).filter(Boolean))) as string[]
        // Only update if form has no assignments yet to avoid clobbering in-flight edits
        const cur = value.assignedToolSlugs || []
        if (cur.length === 0 && slugs.length > 0) {
          console.debug('[AgentDocEditor] Sync assigned tools', { slugs })
          onFieldChange?.('assignedToolSlugs', slugs)
        }
        hasSyncedAssignedRef.current = true
      } catch {
        console.warn('[AgentDocEditor] Failed to load assigned tools', { agentId })
        // ignore
      }
    }
    void syncAssigned()
  }, [agentId, value, onChange])

  // Initial sync of core agent fields for existing agents on load (non-tools)
  const hasSyncedAgentRef = useRef<boolean>(false)
  useEffect(() => {
    const syncAgent = async () => {
      if (!agentId || hasSyncedAgentRef.current) return
      try {
        const res: FetchResponse<ApiResponse<AgentModel>> = await api.get(`/api/v1/agents/${agentId}`)
        const agent = res.data.data
        if (!agent) return
        if (!value.name && agent.name) onFieldChange?.('name', agent.name)
        if (!value.slug && agent.slug) onFieldChange?.('slug', agent.slug)
        if (!value.description && agent.description) onFieldChange?.('description', agent.description)
        if (!value.model && agent.model) onFieldChange?.('model', agent.model)
        if (value.temperature == null && agent.temperature != null) onFieldChange?.('temperature', agent.temperature as any)
        if (value.maxTokens == null && agent.maxTokens != null) onFieldChange?.('maxTokens', agent.maxTokens as any)
        if (!value.systemPrompt && agent.systemPrompt) onFieldChange?.('systemPrompt', agent.systemPrompt)
        if ((!Array.isArray(value.previewPrompts) || value.previewPrompts.length === 0) && Array.isArray((agent as any).previewPrompts)) {
          onFieldChange?.('previewPrompts', ((agent as any).previewPrompts as string[]).filter(Boolean))
        }
        if (value.timeout == null && agent.timeout != null) onFieldChange?.('timeout', agent.timeout as any)
        if (agent.blueprint && (!value.blueprint || value.blueprint.trim() === '' || value.blueprint.trim() === '{\n  "nodes": [],\n  "edges": []\n}')) {
          onFieldChange?.('blueprint', JSON.stringify(agent.blueprint, null, 2))
        }
        console.debug('[AgentDocEditor] Sync agent fields', { id: agentId })
        hasSyncedAgentRef.current = true
      } catch {
        console.warn('[AgentDocEditor] Failed to load agent fields', { agentId })
        // ignore
      }
    }
    void syncAgent()
  }, [agentId, value, onChange])

  return (
    <div className="space-y-4 pt-14 pb-28">
      {/* Template Agent Update Banner */}
      {isTemplateAgent && fullAgent?.updateInfo?.needsUpdate && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="relative overflow-hidden rounded-xl p-4"
          style={{
            background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.08), rgba(124, 58, 237, 0.05))',
            borderColor: 'rgba(139, 92, 246, 0.2)',
            borderWidth: '1px',
            borderStyle: 'solid',
          }}
        >
          <motion.div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent)',
            }}
            animate={{
              x: ['-100%', '200%'],
            }}
            transition={{
              duration: 2.5,
              repeat: Infinity,
              ease: 'linear',
            }}
          />
          <div className="relative flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className="relative z-10 flex h-9 w-9 items-center justify-center rounded-lg shrink-0"
                style={{
                  background: 'rgba(139, 92, 246, 0.1)',
                  border: '1px solid rgba(139, 92, 246, 0.2)',
                }}
              >
                <Icon name="download" className="h-4 w-4" style={{ color: 'rgb(139, 92, 246)' }} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">New update available</span>
                <Badge
                  variant="outline"
                  className="text-xs font-mono flex items-center gap-1"
                  style={{
                    borderColor: 'rgba(139, 92, 246, 0.3)',
                    background: 'rgba(139, 92, 246, 0.05)',
                    color: 'rgb(139, 92, 246)',
                  }}
                >
                  <Icon name="arrow-up-circle" className="w-2.5 h-2.5" />
                  v{fullAgent?.updateInfo?.latestVersion}
                </Badge>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => setShowUpdateDialog(true)}
              style={{
                background: 'rgba(139, 92, 246, 0.1)',
                borderColor: 'rgba(139, 92, 246, 0.3)',
                color: 'rgb(139, 92, 246)',
              }}
              className="hover:opacity-80 transition-opacity"
            >
              Update Now
            </Button>
          </div>
        </motion.div>
      )}

      {/* Update Confirmation Dialog */}
      <Dialog open={showUpdateDialog} onOpenChange={setShowUpdateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Agent</DialogTitle>
            <DialogDescription>A new version of this agent template is available.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground mb-1">Current Version:</p>
                <p className="font-mono font-semibold text-base">v{fullAgent?.version}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">Latest Version:</p>
                <p className="font-mono font-semibold text-base text-purple-600">v{fullAgent?.updateInfo?.latestVersion}</p>
              </div>
            </div>

            <div className="text-sm bg-muted/50 p-4 rounded-lg border">
              <p className="text-muted-foreground">
                This will update your agent with the latest template configuration, including instructions, model settings, and tool assignments.
              </p>
            </div>

            {fullAgent?.updateInfo?.templateUpdatedAt && (
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <Icon name="clock" className="w-3.5 h-3.5" />
                Template last updated: {new Date(fullAgent.updateInfo.templateUpdatedAt).toLocaleString()}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUpdateDialog(false)} disabled={updateMutation.isPending}>
              Later
            </Button>
            <Button onClick={handleUpdateFromTemplate} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Updating...' : 'Update Now'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Title */}
      <div className="space-y-4">
        <div className="space-y-6">
          <AgentAvatar seed={value.name} size={64} className="rounded-md overflow-hidden" />
          <div className="space-y-1">
            <div className="flex items-baseline gap-3">
              <input
                className="flex-1 bg-transparent border-none text-3xl md:text-4xl font-extrabold tracking-tight outline-none focus:ring-0 focus-visible:ring-0 placeholder:text-muted-foreground/50 disabled:opacity-60 disabled:cursor-not-allowed"
                placeholder="Untitled Agent"
                value={value.name}
                onChange={e => handleNameChange(e.target.value)}
                disabled={isTemplateAgent}
              />
              {isTemplateAgent && fullAgent?.version && (
                <span className="text-sm font-mono text-muted-foreground">v{fullAgent.version}</span>
              )}
            </div>
            <div className="text-xs text-muted-foreground font-mono pl-1">/{value.slug || generatedSlug}</div>
          </div>
        </div>
      </div>

      {/* Quick selectors */}
      <div className="space-y-8">
        {/* Category section */}
        <div className="border-b border-border/10 pb-6">
          <div className="flex items-center gap-4 px-3">
            <div className="flex items-center gap-2 text-muted-foreground min-w-[120px]">
              <Icon name="tag" className="w-4 h-4" />
              <span className="text-xs font-semibold">Category</span>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild disabled={isTemplateAgent}>
                <div
                  role="button"
                  aria-label="Change category"
                  className={cn(
                    "flex items-center rounded-xl h-7 px-2 transition-colors border border-border/20",
                    isTemplateAgent ? "opacity-60 cursor-not-allowed" : "cursor-pointer select-none hover:bg-muted/30 hover:shadow-sm"
                  )}
                >
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
        </div>

        {/* Model section */}
        <div className="border-b border-border/10 pb-6">
          <div className="flex items-center gap-4 px-3">
            <div className="flex items-center gap-2 text-muted-foreground min-w-[120px]">
              <Icon name="cpu" className="w-4 h-4" />
              <span className="text-xs font-semibold">Model</span>
            </div>
            <Select value={value.model} onValueChange={m => onFieldChange?.('model', m)} disabled={isLoadingModels || isTemplateAgent}>
              <SelectTrigger className="h-7 w-[220px] text-xs rounded-xl">
                <SelectValue placeholder={isLoadingModels ? 'Loading models...' : 'Select a model'} />
              </SelectTrigger>
              <SelectContent className="w-[300px] p-1 frosted-glass-card rounded-xl shadow-frosted-lg">
                {availableModels.map(m => (
                  <SelectItem key={m} value={m} className="text-xs px-2 py-1">
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Tools section */}
        <div className="pb-6">
          <div className="flex items-start gap-4 px-3">
            <div className="flex items-center gap-2 text-muted-foreground min-w-[120px]">
              <Icon name="wrench" className="w-4 h-4" />
              <span className="text-xs font-semibold">Assigned Tools</span>
            </div>
            <div className="flex-1">
              <Popover>
                <PopoverTrigger asChild disabled={isTemplateAgent}>
                  <div
                    role="button"
                    aria-label="Select tools"
                    className={cn(
                      "flex items-center rounded-xl h-7 px-2 transition-colors border border-border/20",
                      isTemplateAgent ? "opacity-60 cursor-not-allowed" : "cursor-pointer select-none hover:bg-muted/30 hover:shadow-sm"
                    )}
                  >
                    {selectedToolSlugs.length === 0 ? (
                      <span className="text-xs text-muted-foreground">Select tools</span>
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
                    {!isTemplateAgent && <Icon name="chevron-down" className="w-3 h-3 opacity-60 ml-2" />}
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
                                void handleToggleTool(slug, isSelected)
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
        </div>
      </div>

      {/* Description */}
      <Collapsible defaultOpen={true} className="space-y-2">
        <CollapsibleTrigger className="p-1.5">
          <Label className="text-xs font-semibold text-muted-foreground">Description</Label>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className={cn(isTemplateAgent && "opacity-60 pointer-events-none cursor-not-allowed")}>
            <RichMarkdownEditor value={value.description} onChange={val => onFieldChange?.('description', val)} placeholder="Write a clear description. Markdown supported." noMinHeight />
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* System Prompt */}
      <Collapsible defaultOpen={true} className="space-y-2">
        <CollapsibleTrigger className="p-1.5">
          <Label className="text-xs font-semibold text-muted-foreground">System Prompt</Label>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className={cn(isTemplateAgent && "opacity-60 pointer-events-none cursor-not-allowed")}>
            <RichMarkdownEditor
              value={value.systemPrompt}
              onChange={val => onFieldChange?.('systemPrompt', val)}
              placeholder="Define the agent's character, mission, and behavior..."
              minHeightPx={200}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Preview Prompts */}
      <Collapsible defaultOpen={true} className="space-y-2">
        <CollapsibleTrigger className="p-1.5">
          <Label className="text-xs font-semibold text-muted-foreground">Preview Prompts</Label>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-2">
            <textarea
              className="w-full rounded-md border border-border/40 bg-transparent p-2 text-xs font-mono min-h-[120px] disabled:opacity-60 disabled:cursor-not-allowed"
              placeholder={'One prompt per line (max 10).\nExample: Create a customer support agent that can help users with common questions'}
              value={(value.previewPrompts || []).join('\n')}
              disabled={isTemplateAgent}
              onChange={e => {
                const lines = e.target.value
                  .split('\n')
                  .map(s => s.trim())
                  .filter(Boolean)
                  .slice(0, 10)
                onFieldChange?.('previewPrompts', lines)
              }}
            />
            <div className="text-[10px] text-muted-foreground">These appear as example prompts in the chat input when this agent is mentioned. Recommended 3–5 concise prompts, max 10.</div>
          </div>
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
                onChange={e => onFieldChange?.('temperature', parseFloat(e.target.value) || 0)}
                disabled={isTemplateAgent}
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
                onChange={e => onFieldChange?.('maxTokens', parseInt(e.target.value, 10) || 2048)}
                disabled={isTemplateAgent}
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
                onChange={e => onFieldChange?.('timeout', parseInt(e.target.value, 10) || 60000)}
                disabled={isTemplateAgent}
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
