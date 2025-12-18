'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { RichMarkdownEditor } from '@/components/ui/RichMarkdownEditor'
import { Badge } from '@/components/ui/badge'
import Icon from '@/components/primitives/Icon'
import type { AgentFormData } from '../types'
import { cn } from '@/lib/utils'
import { getCategoryColor, getCategoryIcon } from '../utils/categoryHelpers'
import { AGENT_CATEGORIES } from '../constants'
import { BlueprintVisualization } from '@/components/marketplace/BlueprintVisualization'
import AgentAvatar from '@/components/animated/AgentAvatar'
import { useMessageAttachments } from '@/hooks/useFileUpload'
import { StandardSelect } from './StandardSelect'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api, { getCurrentToken } from '@/lib/api'
import type { ToolModel, ApiResponse, AgentModel, AgentTemplateModel, UpdateAgentRequest } from '@starships/protocol'
import type { FetchResponse } from '@/lib/types'
import { toast } from 'sonner'
import { useOpenRouterModels } from '@/hooks/useOpenRouterModels'
import { useUpdateAgentFromTemplate } from '@/hooks/useAgentUpdate'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { AGENT_QUERY_KEYS } from '@/hooks/useAgents'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AgentPublishModal } from './AgentPublishModal'

const CATEGORY_DOT_COLORS: Record<string, string> = {
  general: 'bg-gray-400',
  automation: 'bg-emerald-400',
  data: 'bg-purple-400',
  communication: 'bg-orange-400',
  coding: 'bg-indigo-400',
  creative: 'bg-pink-400',
  analysis: 'bg-cyan-400',
  support: 'bg-amber-400',
  utility: 'bg-teal-400',
}

interface AgentDocumentEditorProps {
  value: AgentFormData
  onChange: (next: AgentFormData) => void
  onFieldChange?: (field: keyof AgentFormData, value: string | boolean | number | string[]) => void
  onSave?: () => void
  onCancel?: () => void
  starshipId?: string
  /**
   * When true, renders the editor in read-only/inspection mode:
   * - All form controls are disabled
   * - No mutations or publish/update actions are triggered
   */
  readOnly?: boolean
}

export function AgentDocumentEditor({ value, onChange, onFieldChange, onSave, onCancel, starshipId, readOnly = false }: AgentDocumentEditorProps) {
  const { data: openRouterModels, isLoading: isLoadingModels } = useOpenRouterModels()
  const queryClient = useQueryClient()

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
  const [publishedTemplate, setPublishedTemplate] = useState<AgentTemplateModel | null>(null)

  const avatarAttachmentId = (fullAgent as any)?.avatarAttachmentId as string | undefined
  const avatarIds = useMemo(() => (avatarAttachmentId ? [avatarAttachmentId] : []), [avatarAttachmentId])
  const { data: avatarAttachments = [] } = useMessageAttachments(avatarIds, starshipId)
  const avatarUrl = avatarAttachments?.[0]?.previewUrl

  // Control whether mini identity (avatar + name + slug) is shown in the sticky banner.
  // It appears only after the main page header scrolls away.
  const [showIdentityInBanner, setShowIdentityInBanner] = useState(false)

  // Dialog state for update confirmation
  const [showUpdateDialog, setShowUpdateDialog] = useState(false)

  // Local loading state for publication request
  const [isRequestingPublish, setIsRequestingPublish] = useState(false)

  // Publication dialog state (agent-level)
  const [showPublishDialog, setShowPublishDialog] = useState(false)
  const [versionBump, setVersionBump] = useState<'patch' | 'minor' | 'major'>('patch')
  const [changelog, setChangelog] = useState('')

  // Optional per-tool publication overrides (keyed by toolId)
  const [toolOverrides, setToolOverrides] = useState<
    Record<
      string,
      {
        versionBump: 'patch' | 'minor' | 'major'
        changelog: string
      }
    >
  >({})

  // Autosave state (existing agents only)
  const [isAutosaving, setIsAutosaving] = useState(false)
  const [hasSaveError, setHasSaveError] = useState(false)

  // Local input state for adding preview prompts
  const [newPreviewPrompt, setNewPreviewPrompt] = useState('')

  // Check if this is a template-based agent (has sourceTemplateId) - these are read-only
  const isTemplateAgent = useMemo(() => {
    return !!fullAgent?.sourceTemplateId
  }, [fullAgent?.sourceTemplateId])

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

  // Tools currently assigned to this agent (resolved to full ToolModel objects from starshipTools)
  const assignedToolsForOverrides: ToolModel[] = useMemo(() => {
    if (!Array.isArray(starshipTools) || !Array.isArray(selectedToolSlugs)) return []
    const bySlug = new Map<string, ToolModel>()
    for (const tool of starshipTools) {
      if (tool.slug) {
        bySlug.set(tool.slug, tool)
      }
    }
    const allAssigned = (selectedToolSlugs as string[]).map(slug => bySlug.get(slug)).filter((t): t is ToolModel => !!t)

    // Only show per-tool publish controls for tools that are actually publishable at template level:
    // - Not draft
    // - Have complete parameters + blueprint
    // - Either have no template yet (new tool) or have updateInfo.needsUpdate === true (template has newer version)
    return allAssigned.filter(tool => {
      if (tool.status === 'draft') return false
      const hasParams = !!tool.parameters && tool.parameters.type === 'object' && !!tool.parameters.properties && Object.keys(tool.parameters.properties).length > 0
      const hasBlueprint = !!tool.blueprint && typeof (tool.blueprint as { nodes?: unknown }).nodes !== 'undefined' && Array.isArray((tool.blueprint as { nodes?: unknown[] }).nodes)
      if (!hasParams || !hasBlueprint) return false

      const isNewTemplate = !tool.publishedTemplateId
      const hasTemplateUpdate = !!tool.updateInfo?.needsUpdate
      return isNewTemplate || hasTemplateUpdate
    })
  }, [starshipTools, selectedToolSlugs])

  // Show compact identity in the sticky banner only after the main page header scrolls out of view.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return

    const headerEl = document.getElementById('agent-page-header')
    if (!headerEl) {
      // Fallback: always show if we can't find the header
      setShowIdentityInBanner(true)
      return
    }

    if (!('IntersectionObserver' in window)) {
      setShowIdentityInBanner(true)
      return
    }

    const observer = new IntersectionObserver(
      entries => {
        const entry = entries[0]
        if (!entry) return
        const isHeaderMostlyVisible = entry.intersectionRatio > 0.2
        setShowIdentityInBanner(!isHeaderMostlyVisible)
      },
      {
        root: null,
        threshold: [0, 0.2, 1],
      }
    )

    observer.observe(headerEl)

    return () => {
      observer.disconnect()
    }
  }, [])

  const formatUpdatedAt = (dateString: string) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    if (Number.isNaN(date.getTime())) return ''

    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  // Resolve current agentId by slug within this starship (if editing existing) - starship-only
  const [agentId, setAgentId] = useState<string | null>(null)
  const [isResolvingAgent, setIsResolvingAgent] = useState<boolean>(false)
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
      if (!cancelled) {
        setIsResolvingAgent(true)
      }
      try {
        if (!starshipId || !value?.slug || value.slug === 'new') {
          console.debug('[AgentDocEditor] Skipping agentId resolve', { starshipId, slug: value?.slug })
          if (!cancelled) {
            setAgentId(null)
            setFullAgent(null)
            setPublishedTemplate(null)
          }
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
            setPublishedTemplate(null)
          }
        }
      } finally {
        if (!cancelled) {
          setIsResolvingAgent(false)
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [starshipId, value?.slug])

  // Load the published template (if any) for comparison to gate republish in UI.
  // We bypass the templateAPI cache and fetch fresh data so the diff matches backend behavior.
  useEffect(() => {
    let cancelled = false
    const loadTemplate = async () => {
      const templateId = fullAgent?.publishedTemplateId
      if (!templateId) {
        setPublishedTemplate(null)
        return
      }
      try {
        const res: FetchResponse<ApiResponse<AgentTemplateModel>> = await api.get(`/api/v1/agent-templates/${templateId}`)
        const tpl = res.data.data
        if (!cancelled) {
          setPublishedTemplate(tpl)
        }
      } catch {
        if (!cancelled) {
          setPublishedTemplate(null)
        }
      }
    }
    void loadTemplate()
    return () => {
      cancelled = true
    }
  }, [fullAgent?.publishedTemplateId])

  // Toggle tool assignment with optimistic UI and server persistence when possible
  const handleToggleTool = async (slug: string, isSelected: boolean) => {
    if (readOnly) return
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
    if (readOnly) return
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

  const computeNextVersion = (currentVersion: string | undefined, bump: 'patch' | 'minor' | 'major'): string => {
    const base = currentVersion || '1.0.0'
    const match = base.match(/^(\d+)\.(\d+)\.(\d+)/)
    if (!match) return '1.0.0'

    const major = Number(match[1])
    const minor = Number(match[2])
    const patch = Number(match[3])

    switch (bump) {
      case 'patch':
        return `${major}.${minor}.${patch + 1}`
      case 'minor':
        return `${major}.${minor + 1}.0`
      case 'major':
        return `${major + 1}.0.0`
    }
  }

  const nextVersion = useMemo(() => computeNextVersion(fullAgent?.version, versionBump), [fullAgent?.version, versionBump])

  // Publish dialog step state: agent first, then each assigned tool override
  const publishSteps = useMemo(() => {
    const toolIds = Array.isArray(assignedToolsForOverrides) ? assignedToolsForOverrides.map(t => t.id) : []
    return ['agent', ...toolIds]
  }, [assignedToolsForOverrides])
  const [activePublishStep, setActivePublishStep] = useState<string>('agent')

  const handleRequestPublication = async () => {
    if (readOnly) return
    if (!agentId) return
    if (!fullAgent) return

    // Prevent duplicate requests when already pending; allow republish for already-published templates
    if (fullAgent.publicationStatus === 'pending_approval') {
      return
    }
    if (fullAgent.publicationStatus === 'published' && !fullAgent.publishedTemplateId) {
      return
    }

    if (!changelog.trim()) {
      toast.error('Changelog required', { description: 'Please provide a short changelog describing your changes.' })
      return
    }

    try {
      setIsRequestingPublish(true)
      const res: FetchResponse<ApiResponse<{ message: string; agent: AgentModel }>> = await api.post(`/api/v1/agents/${agentId}/publish-request`, {
        versionBump,
        changelog: changelog.trim(),
        toolOverrides: Object.entries(toolOverrides)
          .filter(([, o]) => !!o.changelog.trim())
          .map(([toolId, o]) => ({
            toolId,
            versionBump: o.versionBump,
            changelog: o.changelog.trim(),
          })),
      })
      const updated = res.data.data.agent

      // Update local fullAgent state so UI reflects new status immediately
      setFullAgent(updated)

      // Update cached agent detail as well
      queryClient.setQueryData(AGENT_QUERY_KEYS.detail(updated.id), updated)

      toast.success('Publication requested', {
        description: res.data.data.message || 'Your agent is now pending review for publication.',
      })
      setShowPublishDialog(false)
      setChangelog('')
      setToolOverrides({})
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.response?.data?.message || error?.message || 'Failed to request publication'
      toast.error('Failed to request publication', { description: message })
    } finally {
      setIsRequestingPublish(false)
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
  const [agentTools, setAgentTools] = useState<ToolModel[]>([])
  useEffect(() => {
    const syncAssigned = async () => {
      if (!agentId || hasSyncedAssignedRef.current) return
      try {
        const res: FetchResponse<ApiResponse<ToolModel[]>> = await api.get(`/api/v1/agents/${agentId}/tools`)
        const tools = res.data.data || []
        setAgentTools(tools)
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
        if ((!value.category || value.category === 'general') && (agent as any).category) {
          onFieldChange?.('category', (agent as any).category as any)
        }
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

  const publicationStatus = fullAgent?.publicationStatus || 'draft'
  const hasExistingAgent = !!agentId

  // Determine if this agent differs from its published template (if any)
  const { differsFromPublishedTemplate, publishedChangeDetails } = useMemo(() => {
    if (!fullAgent?.publishedTemplateId || !publishedTemplate) {
      return { differsFromPublishedTemplate: false, publishedChangeDetails: [] as string[] }
    }

    const normalizePrompts = (prompts?: string[] | null): string[] => (prompts || []).map(p => (typeof p === 'string' ? p.trim() : '')).filter(Boolean)
    const normalizeSlugs = (slugs?: string[] | null): string[] =>
      (slugs || [])
        .map(s => (typeof s === 'string' ? s.trim() : ''))
        .filter(Boolean)
        .sort()

    const normalizeCore = (src: {
      name?: string | null
      description?: string | null
      model?: string | null
      category?: string | null
      temperature?: number | null
      maxTokens?: number | null
      timeout?: number | null
      systemPrompt?: string | null
      blueprint?: unknown
      previewPrompts?: string[] | null
    }) => {
      const blueprint = src.blueprint && typeof src.blueprint === 'object' ? src.blueprint : { nodes: [], edges: [] }
      // Align with backend defaults: treat missing temperature as DEFAULT_AGENT_TEMPERATURE (0.7)
      const normalizedTemperature = typeof src.temperature === 'number' ? src.temperature : 0.7
      return {
        name: src.name ?? '',
        description: src.description ?? '',
        model: src.model ?? '',
        category: src.category ?? 'general',
        temperature: normalizedTemperature,
        maxTokens: src.maxTokens ?? null,
        timeout: src.timeout ?? null,
        systemPrompt: src.systemPrompt ?? '',
        blueprint,
        previewPrompts: normalizePrompts(src.previewPrompts),
      }
    }

    const agentCore = normalizeCore(fullAgent as any)
    const templateCore = normalizeCore(publishedTemplate as any)

    const sameName = agentCore.name === templateCore.name
    const sameDescription = agentCore.description === templateCore.description
    const sameModel = agentCore.model === templateCore.model
    const sameCategory = (agentCore as any).category === (templateCore as any).category
    const sameTemperature = agentCore.temperature === templateCore.temperature
    const sameMaxTokens = agentCore.maxTokens === templateCore.maxTokens
    const sameTimeout = agentCore.timeout === templateCore.timeout
    const sameSystemPrompt = agentCore.systemPrompt === templateCore.systemPrompt
    const samePreviewPrompts = agentCore.previewPrompts.length === templateCore.previewPrompts.length && agentCore.previewPrompts.every((p, i) => p === templateCore.previewPrompts[i])

    // Tool comparison: compare current assignedToolSlugs in the form against the baseline tools from the template.
    const currentTools = normalizeSlugs((value.assignedToolSlugs as string[] | undefined) || [])
    const baselineTools = normalizeSlugs(((publishedTemplate as any).assignedToolSlugs as string[] | undefined) || [])
    const sameTools = currentTools.length === baselineTools.length && currentTools.every((slug, i) => slug === baselineTools[i])

    const agentBlueprintStr = JSON.stringify(agentCore.blueprint)
    const templateBlueprintStr = JSON.stringify(templateCore.blueprint)
    const sameBlueprint = agentBlueprintStr === templateBlueprintStr

    const changes: string[] = []
    if (!sameName) changes.push('Name')
    if (!sameDescription) changes.push('Description')
    if (!sameModel) changes.push('Model')
    if (!sameCategory) changes.push('Category')
    if (!sameTemperature) changes.push('Temperature')
    if (!sameMaxTokens) changes.push('Max tokens')
    if (!sameTimeout) changes.push('Timeout')
    if (!sameSystemPrompt) changes.push('System prompt')
    if (!samePreviewPrompts) changes.push('Preview prompts')
    if (!sameTools) changes.push('Tools')
    if (!sameBlueprint) changes.push('Blueprint')

    try {
      console.debug('[AgentDocEditor] template-diff-debug', {
        agentId: fullAgent.id,
        publishedTemplateId: fullAgent.publishedTemplateId,
        sameName,
        sameDescription,
        sameModel,
        sameCategory,
        sameTemperature,
        sameMaxTokens,
        sameTimeout,
        sameSystemPrompt,
        samePreviewPrompts,
        sameTools,
        sameBlueprint,
        agentPreviewPrompts: agentCore.previewPrompts,
        templatePreviewPrompts: templateCore.previewPrompts,
        agentBlueprintLen: agentBlueprintStr.length,
        templateBlueprintLen: templateBlueprintStr.length,
        currentTools,
        baselineTools,
      })
    } catch {
      // ignore logging errors
    }

    const differs = !(
      sameName &&
      sameDescription &&
      sameModel &&
      sameCategory &&
      sameTemperature &&
      sameMaxTokens &&
      sameTimeout &&
      sameSystemPrompt &&
      samePreviewPrompts &&
      sameTools &&
      sameBlueprint
    )

    return { differsFromPublishedTemplate: differs, publishedChangeDetails: changes }
  }, [fullAgent, publishedTemplate, value.assignedToolSlugs])

  const isRepublishable = publicationStatus === 'published' && !!fullAgent?.publishedTemplateId && differsFromPublishedTemplate
  const canRequestPublication = hasExistingAgent && !!fullAgent && !isTemplateAgent && !readOnly && (publicationStatus === 'draft' || publicationStatus === 'rejected' || isRepublishable)

  // Debug logging for publishability pipeline – helps trace why an agent is (re)publishable
  useEffect(() => {
    try {
      console.debug('[AgentDocEditor] publish-debug', {
        agentId,
        fullAgentId: fullAgent?.id,
        publicationStatus,
        hasExistingAgent,
        isTemplateAgent,
        readOnly,
        hasPublishedTemplateId: !!fullAgent?.publishedTemplateId,
        differsFromPublishedTemplate,
        isRepublishable,
        canRequestPublication,
      })
    } catch {
      // ignore logging errors
    }
  }, [agentId, fullAgent?.id, fullAgent?.publishedTemplateId, publicationStatus, hasExistingAgent, isTemplateAgent, readOnly, differsFromPublishedTemplate, isRepublishable, canRequestPublication])

  // Autosave agent changes for existing (non-template) agents
  useEffect(() => {
    if (!agentId) return
    if (readOnly) return
    if (isTemplateAgent) return
    if (!fullAgent) return

    // Build update payload from current form value
    const buildUpdates = (): UpdateAgentRequest => {
      let blueprintObj: any | undefined
      if (value.blueprint && value.blueprint.trim() !== '') {
        try {
          blueprintObj = JSON.parse(value.blueprint)
        } catch {
          // Leave blueprint undefined if invalid JSON – backend keeps last valid version
        }
      }

      const updates: UpdateAgentRequest = {}

      // Only send fields that are actually different from the current persisted agent
      const base = fullAgent

      if (value.name && value.name.trim().length > 0 && value.name !== base.name) {
        updates.name = value.name
      }

      if (typeof value.description === 'string') {
        const nextDesc = value.description ?? ''
        const baseDesc = base.description ?? ''
        if (nextDesc !== baseDesc) {
          updates.description = nextDesc
        }
      }

      if (value.model && value.model.trim().length > 0 && value.model !== base.model) {
        updates.model = value.model
      }

      if (value.category && (fullAgent as any).category !== value.category) {
        ;(updates as any).category = value.category
      }

      // Clamp numeric fields into valid ranges before sending, and compare to base
      if (typeof value.temperature === 'number') {
        const clampedTemp = Math.min(2, Math.max(0, value.temperature))
        if (base.temperature == null || Number(base.temperature) !== clampedTemp) {
          updates.temperature = clampedTemp
        }
      }

      if (typeof value.maxTokens === 'number') {
        const clampedMaxTokens = Math.min(100000, Math.max(1, value.maxTokens))
        if (base.maxTokens == null || Number(base.maxTokens) !== clampedMaxTokens) {
          updates.maxTokens = clampedMaxTokens
        }
      }

      if (typeof value.timeout === 'number') {
        const clampedTimeout = Math.min(600000, Math.max(1000, value.timeout))
        if (base.timeout == null || Number(base.timeout) !== clampedTimeout) {
          updates.timeout = clampedTimeout
        }
      }

      if (typeof value.systemPrompt === 'string') {
        const nextPrompt = value.systemPrompt ?? ''
        const basePrompt = base.systemPrompt ?? ''
        if (nextPrompt !== basePrompt) {
          updates.systemPrompt = nextPrompt
        }
      }

      if (Array.isArray(value.previewPrompts)) {
        const nextPrompts = (value.previewPrompts || []).map(s => s.trim()).filter(Boolean)
        const basePrompts = (base.previewPrompts || []).map(s => s.trim()).filter(Boolean)
        const sameLength = nextPrompts.length === basePrompts.length
        const sameContent = sameLength && nextPrompts.every((p, i) => p === basePrompts[i])
        if (!sameContent) {
          updates.previewPrompts = nextPrompts
        }
      }

      if (blueprintObj) {
        const baseBlueprint = base.blueprint ?? { nodes: [], edges: [] }
        const nextStr = JSON.stringify(blueprintObj)
        const baseStr = JSON.stringify(baseBlueprint)
        if (nextStr !== baseStr) {
          ;(updates as any).blueprint = blueprintObj
        }
      }

      return updates
    }

    let cancelled = false
    setHasSaveError(false)

    const timeout = setTimeout(async () => {
      try {
        const updates = buildUpdates()
        // Skip network call if there are no actual changes
        if (Object.keys(updates).length === 0) {
          return
        }
        setIsAutosaving(true)
        const res: FetchResponse<ApiResponse<AgentModel>> = await api.put(`/api/v1/agents/${agentId}`, updates)
        const updated = res.data.data

        if (!cancelled && updated) {
          setFullAgent(updated)
          // Keep React Query cache in sync for this agent
          queryClient.setQueryData(AGENT_QUERY_KEYS.detail(updated.id), updated)
        }
      } catch (error: any) {
        if (!cancelled) {
          setHasSaveError(true)
        }
      } finally {
        if (!cancelled) {
          setIsAutosaving(false)
        }
      }
    }, 800)

    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [agentId, value, readOnly, isTemplateAgent, queryClient, fullAgent])

  return (
    <div className="pt-4 pb-20">
      {/* Template Agent Update Banner */}
      {isTemplateAgent && fullAgent?.updateInfo?.needsUpdate && !readOnly && (
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
                  <Icon name="arrow-up-circle" className="w-2.5 h-2.5" />v{fullAgent?.updateInfo?.latestVersion}
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
      <Dialog open={showUpdateDialog && !readOnly} onOpenChange={setShowUpdateDialog}>
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
              <p className="text-muted-foreground">This will update your agent with the latest template configuration, including instructions, model settings, and tool assignments.</p>
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

      {/* Primary actions & publication status - compact banner (styled like navbar, sticky with offset) */}
      <div className="sticky top-4 z-20 flex flex-col sm:flex-row items-center justify-between gap-3 rounded-xl border border-border/40 bg-card px-3 py-2 shadow-sm mb-10">
        {agentId && (
          <div className="flex items-center gap-4 text-sm">
            {/* Avatar + name/slug on the far left */}
            {showIdentityInBanner && (
              <div className="flex items-center gap-3">
                <AgentAvatar
                  seed={fullAgent?.name || value.name || value.slug || 'Agent'}
                  imageUrl={avatarUrl}
                  size={36}
                  rounded
                  className="h-9 w-9 rounded-xl overflow-hidden ring-1 ring-primary/40 bg-background"
                />
                <div className="flex flex-col leading-tight min-w-0">
                  <span className="text-base font-semibold truncate tracking-tight">{fullAgent?.name || value.name || 'Untitled agent'}</span>
                  {(fullAgent?.slug || value.slug) && <span className="text-xs text-muted-foreground truncate font-mono">{fullAgent?.slug || value.slug}</span>}
                </div>
              </div>
            )}

            {/* Text stack to the right of avatar/name */}
            <div className="flex flex-col gap-2">
              {/* Save indicator */}
              <div className="flex items-center gap-1 text-xs font-medium">
                <div className="w-3 h-3 flex items-center justify-center">
                  <div className={cn('w-2 h-2 rounded-full animate-pulse', isAutosaving ? 'bg-amber-400' : hasSaveError ? 'bg-red-400' : 'bg-emerald-400')} />
                </div>
                <span className="text-muted-foreground">{isAutosaving ? 'Saving…' : hasSaveError ? 'Save failed' : 'All changes saved'}</span>
              </div>

              {/* Status, Version & Last updated */}
              <div className="flex flex-wrap items-center gap-3 text-xs font-medium">
                <span
                  className={cn(
                    'inline-flex items-center gap-1 font-medium',
                    publicationStatus === 'published'
                      ? 'text-emerald-500'
                      : publicationStatus === 'pending_approval'
                        ? 'text-amber-500'
                        : publicationStatus === 'rejected'
                          ? 'text-red-500'
                          : 'text-muted-foreground'
                  )}
                >
                  <Icon
                    name={publicationStatus === 'published' ? 'check-circle' : publicationStatus === 'pending_approval' ? 'clock' : publicationStatus === 'rejected' ? 'x-circle' : 'info'}
                    className="w-3 h-3"
                  />
                  <span className="capitalize">{publicationStatus.replace('_', ' ')}</span>
                </span>
                {fullAgent?.version && (
                  <span className="inline-flex items-center gap-1 text-muted-foreground font-mono">
                    <Icon name="hash" className="w-3 h-3" />v{fullAgent.version}
                  </span>
                )}
                {fullAgent?.updatedAt && (
                  <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                    <Icon name="clock" className="w-3 h-3" />
                    <span>Last updated {formatUpdatedAt(fullAgent.updatedAt)}</span>
                  </div>
                )}
              </div>

              {publicationStatus === 'rejected' && (
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <span>Last request was rejected. Update your agent and request publication again.</span>
                </div>
              )}
            </div>
          </div>
        )}

        {!readOnly && (
          <div className="flex flex-col gap-1 items-start sm:items-end">
            <div className="flex flex-wrap items-center gap-2">
              {hasExistingAgent && (
                <Button
                  type="button"
                  size="sm"
                  variant="primaryOutline"
                  className="gap-1.5"
                  disabled={isRequestingPublish || !canRequestPublication}
                  onClick={() => {
                    if (!canRequestPublication) return

                    // Provide a sensible default changelog if none is set yet
                    if (!changelog.trim()) {
                      if (!fullAgent?.publishedTemplateId) {
                        // First-time publish
                        setChangelog('Initial publication of this agent to the marketplace.')
                      } else if (publishedChangeDetails.length > 0) {
                        // Re-publish with detected changes – summarize the changed fields
                        const summary = publishedChangeDetails.join(', ').toLowerCase()
                        setChangelog(`Updated ${summary}.`)
                      } else {
                        // Fallback when we can't detect specific fields
                        setChangelog('Minor updates and fixes.')
                      }
                    }

                    // Provide sensible default changelogs for tools as well, if not already set
                    if (assignedToolsForOverrides.length > 0) {
                      setToolOverrides(prev => {
                        const next = { ...prev }
                        for (const tool of assignedToolsForOverrides) {
                          const existing = next[tool.id] || {
                            versionBump: 'patch' as const,
                            changelog: '',
                          }
                          if (existing.changelog && existing.changelog.trim()) continue

                          const isNewTemplate = !tool.publishedTemplateId
                          const hasTemplateUpdate = !!tool.updateInfo?.needsUpdate

                          let defaultLog: string
                          if (isNewTemplate) {
                            defaultLog = 'Initial publication of this tool for this agent.'
                          } else if (hasTemplateUpdate) {
                            defaultLog = 'Synced latest tool definition changes for this agent.'
                          } else {
                            defaultLog = 'Minor updates and fixes for this tool.'
                          }

                          next[tool.id] = {
                            versionBump: existing.versionBump || 'patch',
                            changelog: defaultLog,
                          }
                        }
                        return next
                      })
                    }

                    // Always start the stepped flow at the agent card
                    setActivePublishStep('agent')
                    setShowPublishDialog(true)
                  }}
                >
                  <Icon name="rocket-launch" className="w-3.5 h-3.5" />
                  {isRequestingPublish ? 'Publishing…' : publicationStatus === 'pending_approval' ? 'Pending approval' : isRepublishable ? 'Publish update' : 'Publish'}
                </Button>
              )}
            </div>

            {hasExistingAgent && publicationStatus === 'published' && fullAgent?.publishedTemplateId && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-[11px] text-muted-foreground cursor-pointer underline underline-offset-2 decoration-dotted px-0 py-0.5">
                    {differsFromPublishedTemplate && publishedChangeDetails.length > 0 ? `${publishedChangeDetails.length} changes to publish` : 'No new changes to publish'}
                  </button>
                </TooltipTrigger>
                {differsFromPublishedTemplate && publishedChangeDetails.length > 0 && (
                  <TooltipContent side="bottom" align="end" className="max-w-xs p-2 text-xs rounded-xl shadow-frosted-lg bg-popover text-popover-foreground border border-border/60">
                    <div className="font-semibold mb-1 text-foreground">Changes since last published version</div>
                    <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                      {publishedChangeDetails.map(change => (
                        <li key={change}>{change}</li>
                      ))}
                    </ul>
                  </TooltipContent>
                )}
              </Tooltip>
            )}
          </div>
        )}
      </div>

      {/* Publication Request Dialog */}
      <AgentPublishModal
        open={showPublishDialog}
        readOnly={readOnly}
        onOpenChange={setShowPublishDialog}
        fullAgent={fullAgent}
        value={value}
        differsFromPublishedTemplate={differsFromPublishedTemplate}
        publishedChangeDetails={publishedChangeDetails}
        assignedToolsForOverrides={assignedToolsForOverrides}
        versionBump={versionBump}
        setVersionBump={setVersionBump}
        changelog={changelog}
        setChangelog={setChangelog}
        toolOverrides={toolOverrides}
        setToolOverrides={setToolOverrides}
        publishSteps={publishSteps}
        activePublishStep={activePublishStep}
        setActivePublishStep={setActivePublishStep}
        nextVersion={nextVersion}
        isRequestingPublish={isRequestingPublish}
        onSubmit={() => {
          void handleRequestPublication()
        }}
      />

      {/* Quick selectors + core fields */}
      <div className="space-y-2 mb-4">
        {/* Category section */}
        <div className="border-b border-border/10 pb-2">
          <div className="flex items-center gap-2 px-3">
            <div className="flex items-center gap-2 text-muted-foreground min-w-[120px]">
              <Icon name="tag" className="w-4 h-4" />
              <span className="text-xs font-semibold">Category</span>
            </div>
            <div className="w-[260px]">
              <StandardSelect
                mode="single"
                aria-label="Change category"
                disabled={isTemplateAgent || readOnly}
                value={value.category}
                options={AGENT_CATEGORIES.map(cat => ({
                  value: cat,
                  label: (
                    <span className="flex items-center gap-2">
                      <span className={cn('h-2 w-2 rounded-full', CATEGORY_DOT_COLORS[cat] || CATEGORY_DOT_COLORS.general)} />
                      <span className="capitalize">{cat}</span>
                    </span>
                  ),
                  keywords: cat,
                }))}
                placeholder="Select a category"
                triggerClassName={cn('w-full', (isTemplateAgent || readOnly) && 'cursor-not-allowed')}
                onChange={cat => {
                  onChange({ ...value, category: (cat as AgentFormData['category']) ?? value.category })
                }}
              />
            </div>
          </div>
        </div>

        {/* Model section */}
        <div className="border-b border-border/10 pb-2">
          <div className="flex items-center gap-2 px-3">
            <div className="flex items-center gap-2 text-muted-foreground min-w-[120px]">
              <Icon name="cpu" className="w-4 h-4" />
              <span className="text-xs font-semibold">Model</span>
            </div>
            <div className="w-[260px]">
              <StandardSelect
                mode="single"
                aria-label="Select model"
                disabled={isLoadingModels || isTemplateAgent || readOnly}
                value={value.model}
                options={availableModels.map(m => ({
                  value: m,
                  label: <span className="font-mono text-xs">{m}</span>,
                  keywords: m,
                }))}
                placeholder={isLoadingModels ? 'Loading models...' : 'Select a model'}
                searchPlaceholder="Search models..."
                emptyLabel={isLoadingModels ? 'Loading models…' : 'No models found.'}
                triggerClassName="w-full"
                onChange={m => {
                  if (typeof m === 'string') {
                    onFieldChange?.('model', m)
                  }
                }}
              />
            </div>
          </div>
        </div>

        {/* Tools section */}
        <div className="border-b border-border/10 pb-2">
          <div className="flex items-center gap-2 px-3">
            <div className="flex items-center gap-2 text-muted-foreground min-w-[120px]">
              <Icon name="wrench" className="w-4 h-4" />
              <span className="text-xs font-semibold">Assigned Tools</span>
            </div>
            <div className="w-[260px]">
              <StandardSelect
                mode="multiple"
                aria-label="Select tools"
                disabled={isTemplateAgent || readOnly}
                value={selectedToolSlugs}
                options={allToolOptions.map(slug => ({
                  value: slug,
                  label: (
                    <span className="flex items-center gap-2">
                      <Icon name="wrench" className="w-3 h-3" />
                      <span className="font-mono text-xs">{slug}</span>
                    </span>
                  ),
                  keywords: slug,
                }))}
                placeholder="Select tools"
                searchPlaceholder="Search tools..."
                emptyLabel="No tools found."
                triggerClassName={cn('w-full', (isTemplateAgent || readOnly) && 'opacity-60 cursor-not-allowed')}
                renderTriggerLabel={({ selectedOptions }) => {
                  if (!selectedOptions.length) {
                    return <span className="text-xs text-muted-foreground">{isTemplateAgent || readOnly ? 'No tools assigned' : 'Select tools'}</span>
                  }
                  const values = selectedOptions.map(opt => String(opt.value))
                  let label: string
                  if (values.length <= 3) {
                    label = values.join(', ')
                  } else {
                    label = `${values[0]}, ${values[1]} and ${values.length - 2} others`
                  }
                  return <span className="text-xs font-mono truncate max-w-full">{label}</span>
                }}
                onOptionToggle={(slug, wasSelected) => {
                  if (isTemplateAgent || readOnly) return
                  void handleToggleTool(slug, wasSelected)
                }}
              />
            </div>
          </div>
        </div>

        {/* Description */}
        <div className="border-b border-border/10 pb-2">
          <div className="flex items-start gap-2 px-3">
            <div className="flex items-center gap-2 text-muted-foreground min-w-[120px] pt-1">
              <Icon name="file-text" className="w-4 h-4" />
              <span className="text-xs font-semibold">Description</span>
            </div>
            <div className={cn('flex-1', (isTemplateAgent || readOnly) && 'opacity-60 pointer-events-none cursor-not-allowed')}>
              <RichMarkdownEditor
                value={value.description}
                onChange={val => onFieldChange?.('description', val)}
                placeholder="Write a clear description. Markdown supported."
                className="pl-2"
                noMinHeight
                readOnly={readOnly}
              />
            </div>
          </div>
        </div>

        {/* System Prompt */}
        <div className="border-b border-border/10 pb-2">
          <div className="flex items-start gap-2 px-3">
            <div className="flex items-center gap-2 text-muted-foreground min-w-[120px] pt-1">
              <Icon name="sparkles" className="w-4 h-4" />
              <span className="text-xs font-semibold">System Prompt</span>
            </div>
            <div className={cn('flex-1', (isTemplateAgent || readOnly) && 'opacity-60 pointer-events-none cursor-not-allowed')}>
              <RichMarkdownEditor
                value={value.systemPrompt}
                onChange={val => onFieldChange?.('systemPrompt', val)}
                placeholder="Define the agent's character, mission, and behavior..."
                className="pl-2"
                minHeightPx={200}
                readOnly={readOnly}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Examples (Preview Prompts) */}
      <div className="border-b border-border/10 pb-2 mt-2">
        <div className="flex items-start gap-2 px-3">
          <div className="flex items-center gap-2 text-muted-foreground min-w-[120px] pt-1">
            <Icon name="list-bullet" className="w-4 h-4" />
            <span className="text-xs font-semibold">Examples</span>
          </div>
          <div className="flex-1">
            <div className="space-y-2">
              <div className="space-y-1">
                {(value.previewPrompts || []).length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No preview prompts yet. Add a few examples to help users get started.</p>
                ) : (
                  <ul className="space-y-1">
                    {(value.previewPrompts || []).map((prompt, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <Input
                          className="text-xs flex-1"
                          value={prompt}
                          disabled={isTemplateAgent || readOnly}
                          onChange={e => {
                            const next = [...(value.previewPrompts || [])]
                            next[idx] = e.target.value
                            const cleaned = next
                              .map(s => s.trim())
                              .filter(Boolean)
                              .slice(0, 10)
                            onFieldChange?.('previewPrompts', cleaned)
                          }}
                          placeholder="Example: Help me draft a customer support reply…"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={isTemplateAgent || readOnly}
                          className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => {
                            const next = (value.previewPrompts || []).filter((_, i) => i !== idx)
                            onFieldChange?.('previewPrompts', next)
                          }}
                        >
                          <Icon name="x" className="w-3 h-3" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  className="text-xs flex-1"
                  placeholder="Add a sample user prompt…"
                  value={newPreviewPrompt}
                  disabled={isTemplateAgent || readOnly}
                  onChange={e => setNewPreviewPrompt(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      if (isTemplateAgent || readOnly) return
                      const trimmed = newPreviewPrompt.trim()
                      const existing = value.previewPrompts || []
                      if (!trimmed || existing.length >= 10) return
                      onFieldChange?.('previewPrompts', [...existing, trimmed])
                      setNewPreviewPrompt('')
                    }
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  className="text-xs"
                  disabled={isTemplateAgent || readOnly || !newPreviewPrompt.trim() || (value.previewPrompts || []).length >= 10}
                  onClick={() => {
                    if (isTemplateAgent || readOnly) return
                    const trimmed = newPreviewPrompt.trim()
                    const existing = value.previewPrompts || []
                    if (!trimmed || existing.length >= 10) return
                    onFieldChange?.('previewPrompts', [...existing, trimmed])
                    setNewPreviewPrompt('')
                  }}
                >
                  Add
                </Button>
              </div>
              <div className="text-[10px] text-muted-foreground flex items-center justify-between">
                <span>These appear as example prompts in the chat input when this agent is mentioned.</span>
                <span>
                  {(value.previewPrompts || []).length}
                  /10
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Advanced options (includes Blueprint) */}
      <Collapsible defaultOpen={false} className="border-b border-border/10 pb-2 mt-2">
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center gap-2 px-3 py-1.5 text-muted-foreground">
            <Icon name="sliders-horizontal" className="w-4 h-4" />
            <span className="text-xs font-semibold flex-1 text-left">Advanced options</span>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-4 mt-1">
            {/* Blueprint first */}
            <div>
              <div className="flex items-start gap-2 px-3">
                <div className="flex items-center gap-2 text-muted-foreground min-w-[120px] pt-1">
                  <Icon name="network" className="w-4 h-4" />
                  <span className="text-xs font-semibold">Blueprint</span>
                </div>
                <div className="flex-1">
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
              </div>
            </div>

            {/* Then numeric advanced controls */}
            <div className="space-y-2 border-t border-border/10 pt-2">
              {/* Temperature */}
              <div className="flex items-center gap-2 px-3">
                <div className="flex items-center gap-2 text-muted-foreground min-w-[120px]">
                  <span className="text-xs font-semibold">Temperature</span>
                </div>
                <div className="w-[260px]">
                  <Input
                    id="agent-temperature"
                    type="number"
                    min="0"
                    max="2"
                    step="0.1"
                    value={value.temperature}
                    onChange={e => onFieldChange?.('temperature', parseFloat(e.target.value) || 0)}
                    disabled={isTemplateAgent || readOnly}
                    className="text-xs"
                  />
                </div>
              </div>

              {/* Max Tokens */}
              <div className="flex items-center gap-2 px-3">
                <div className="flex items-center gap-2 text-muted-foreground min-w-[120px]">
                  <span className="text-xs font-semibold">Max Tokens</span>
                </div>
                <div className="w-[260px]">
                  <Input
                    id="agent-max-tokens"
                    type="number"
                    min="1"
                    step="1"
                    value={value.maxTokens}
                    onChange={e => onFieldChange?.('maxTokens', parseInt(e.target.value, 10) || 2048)}
                    disabled={isTemplateAgent || readOnly}
                    className="text-xs"
                  />
                </div>
              </div>

              {/* Timeout */}
              <div className="flex items-center gap-2 px-3">
                <div className="flex items-center gap-2 text-muted-foreground min-w-[120px]">
                  <span className="text-xs font-semibold">Timeout (ms)</span>
                </div>
                <div className="w-[260px]">
                  <Input
                    id="agent-timeout"
                    type="number"
                    min="1000"
                    step="1000"
                    value={value.timeout}
                    onChange={e => onFieldChange?.('timeout', parseInt(e.target.value, 10) || 60000)}
                    disabled={isTemplateAgent || readOnly}
                    className="text-xs"
                  />
                </div>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Category & Icon removed: now controlled via the badge selector above */}
    </div>
  )
}
