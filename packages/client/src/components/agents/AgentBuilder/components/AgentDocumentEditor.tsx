'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import Icon from '@/components/primitives/Icon'
import type { AgentFormData } from '../types'
import { cn } from '@/lib/utils'
import { getCategoryColor, getCategoryDotColor, getCategoryIcon } from '../utils/categoryHelpers'
import { AGENT_CATEGORIES } from '../constants'
import AgentAvatar from '@/components/animated/AgentAvatar'
import { useMessageAttachments } from '@/hooks/useFileUpload'
import { StandardSelect } from './StandardSelect'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api, { getCurrentToken } from '@/lib/api'
import type { ToolModel, ApiResponse, AgentModel, UpdateAgentRequest } from '@starships/protocol'
import type { FetchResponse } from '@/lib/types'
import { toast } from 'sonner'
import { useLlmModels } from '@/hooks/useLlmModels'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { AGENT_QUERY_KEYS } from '@/hooks/useAgents'
import { AgentPublishModal } from './AgentPublishModal'
import { areStatesEqual, shouldSkipStateUpdateToPreservePlugins, baseStateHasPlugins } from '@/utils/agent-state'
import type { ConversationState } from '@starships/protocol'
import { ErrorBoundary } from '@/components/ui/error-boundary'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { StarshipAgentToolPermissionModel, UpdateAgentToolPermissionsRequest } from '@starships/protocol'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

// Lazy-load the blueprint visualizer so the landing-page "embedded" demo doesn't
// pull in ELK/WebWorker code (which can break when evaluated in the SSR bundle).
const BlueprintVisualization = dynamic(() => import('@/components/blueprint/BlueprintVisualization').then(m => m.BlueprintVisualization), {
  ssr: false,
  loading: () => <div className="h-[320px] w-full rounded-lg bg-muted/20" />,
})

interface AgentDocumentEditorProps {
  value: AgentFormData
  onChange: (next: AgentFormData) => void
  onFieldChange?: (field: keyof AgentFormData, value: string | boolean | number | string[]) => void
  onSave?: () => void
  onCancel?: () => void
  starshipId?: string
  /**
   * Optional: canonical id of the agent being edited. When provided, we skip the
   * starship-scoped slug lookup and hydrate directly from /api/v1/agents/:id.
   */
  agentId?: string
  /**
   * Optional: canonical agent model already fetched by the parent.
   * When present, the editor must not issue its own /agents/:id fetch.
   */
  agent?: AgentModel | null
  /**
   * When true, renders the editor in read-only/inspection mode:
   * - All form controls are disabled
   * - No mutations or publish/update actions are triggered
   */
  readOnly?: boolean
  /**
   * When true, renders in a compact embedded mode (e.g., landing page demo).
   * Hides ship-page-specific chrome like publish banners / sticky action bars.
   */
  embedded?: boolean
}

export function AgentDocumentEditor({
  value,
  onChange,
  onFieldChange,
  onSave,
  onCancel,
  starshipId,
  agentId: providedAgentId,
  agent: providedAgent,
  readOnly = false,
  embedded = false,
}: AgentDocumentEditorProps) {
  const { data: llmModels, isLoading: isLoadingModels } = useLlmModels()
  const queryClient = useQueryClient()
  // Track whether the user explicitly changed the Reasoning dropdown.
  // Important: we must NOT mutate agent reasoning/blueprint just by opening the editor.
  const reasoningDirtyRef = useRef<boolean>(false)
  const systemPromptTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const selectLikeFieldClass =
    'rounded-lg border border-border/70 bg-background/80 px-2 transition-colors hover:bg-muted/30 hover:shadow-sm hover:border-border/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 focus-visible:border-ring'

  const availableModels = useMemo(() => {
    const fetched = llmModels?.map(m => m.model).filter(Boolean) || []
    const current = typeof value?.model === 'string' && value.model.trim() ? [value.model.trim()] : []
    return Array.from(new Set([...fetched, ...current]))
  }, [llmModels, value?.model])

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

  const formatAgentDisplayName = (name: string | undefined | null, role: string | undefined | null): string => {
    const n = typeof name === 'string' ? name.trim() : ''
    const r = typeof role === 'string' ? role.trim() : ''
    if (n && r) return `${n}: ${r}`
    return n || 'Untitled agent'
  }

  const avatarAttachmentId = fullAgent?.avatarAttachmentId
  const avatarIds = useMemo(() => (avatarAttachmentId ? [avatarAttachmentId] : []), [avatarAttachmentId])
  const { data: avatarAttachments = [] } = useMessageAttachments(avatarIds, starshipId)
  const avatarUrl = avatarAttachments?.[0]?.previewUrl
  const avatarCreatedAt = avatarAttachments?.[0]?.createdAt

  // Control whether mini identity (avatar + name + slug) is shown in the sticky banner.
  // It appears only after the main page header scrolls away.
  const [showIdentityInBanner, setShowIdentityInBanner] = useState(false)

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

  const promptsEditable = !readOnly
  const agentIdForPermissions = (providedAgent?.id || providedAgentId || fullAgent?.id || null) as string | null

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

  // Tool permissions (reuse the same starship-scoped rows as the Tools tab, but filter to this agent)
  const { data: permissionRows = [] } = useQuery({
    queryKey: ['starship-agent-tool-permissions', starshipId] as const,
    queryFn: async (): Promise<StarshipAgentToolPermissionModel[]> => {
      if (!starshipId) return []
      const response: FetchResponse<ApiResponse<StarshipAgentToolPermissionModel[]>> = await api.get(`/api/v1/starships/${starshipId}/agent-tool-permissions`)
      return response.data.data || []
    },
    enabled: !!starshipId,
    staleTime: 10 * 1000,
  })

  const permissionByToolSlug = useMemo(() => {
    const map = new Map<string, StarshipAgentToolPermissionModel['permission']>()
    if (!agentIdForPermissions) return map
    for (const row of permissionRows || []) {
      if (!row?.agentId || !row?.toolSlug) continue
      if (row.agentId !== agentIdForPermissions) continue
      map.set(row.toolSlug, row.permission)
    }
    return map
  }, [permissionRows, agentIdForPermissions])

  const assignedToolModels = useMemo(() => {
    const slugs = Array.isArray(value?.assignedToolSlugs) ? (value.assignedToolSlugs as string[]) : []
    if (!slugs.length) return [] as ToolModel[]
    const bySlug = new Map<string, ToolModel>()
    for (const t of Array.isArray(starshipTools) ? starshipTools : []) {
      if (t?.slug) bySlug.set(t.slug, t)
    }
    return slugs.map(s => bySlug.get(s)).filter((t): t is ToolModel => !!t)
  }, [value?.assignedToolSlugs, starshipTools])

  const PERMISSION_ORDER = ['allow', 'ask', 'deny'] as const
  const permissionLabel = (p: StarshipAgentToolPermissionModel['permission']): string => {
    if (p === 'allow') return 'Allow'
    if (p === 'ask') return 'Ask first'
    return 'Deny'
  }
  const permissionDescription = (p: StarshipAgentToolPermissionModel['permission']): string => {
    if (p === 'allow') return 'Agent can trigger this tool without confirmation.'
    if (p === 'ask') return 'Agent can trigger this tool, but you will be asked to confirm.'
    return 'Agent cannot trigger this tool.'
  }
  const permissionIconName = (p: StarshipAgentToolPermissionModel['permission']): string => {
    if (p === 'allow') return 'check-circle'
    if (p === 'ask') return 'help-circle'
    return 'x-circle'
  }
  const permissionBadgeClassName = (p: StarshipAgentToolPermissionModel['permission']): string => {
    if (p === 'allow') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
    if (p === 'ask') return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
    return 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'
  }
  const permissionMenuItemClassName = (p: StarshipAgentToolPermissionModel['permission']): string => {
    if (p === 'allow') return 'hover:bg-emerald-500/10 focus:bg-emerald-500/10'
    if (p === 'ask') return 'hover:bg-amber-500/10 focus:bg-amber-500/10'
    return 'hover:bg-red-500/10 focus:bg-red-500/10'
  }
  const permissionMenuItemSelectedClassName = (p: StarshipAgentToolPermissionModel['permission']): string => {
    if (p === 'allow') return 'bg-emerald-500/10'
    if (p === 'ask') return 'bg-amber-500/10'
    return 'bg-red-500/10'
  }
  const permissionMenuIconClassName = (p: StarshipAgentToolPermissionModel['permission']): string => {
    if (p === 'allow') return 'text-emerald-500'
    if (p === 'ask') return 'text-amber-500'
    return 'text-red-500'
  }
  const permissionDotClassName = (p: StarshipAgentToolPermissionModel['permission']): string => {
    if (p === 'allow') return 'bg-emerald-500/70'
    if (p === 'ask') return 'bg-amber-500/70'
    return 'bg-red-500/70'
  }
  const permissionOptions: Array<{
    value: StarshipAgentToolPermissionModel['permission']
    label: string
    description: string
    icon: string
  }> = [
    { value: 'allow', label: 'Allow', description: permissionDescription('allow'), icon: permissionIconName('allow') },
    { value: 'ask', label: 'Ask first', description: permissionDescription('ask'), icon: permissionIconName('ask') },
    { value: 'deny', label: 'Deny', description: permissionDescription('deny'), icon: permissionIconName('deny') },
  ]

  const setPermissionMutation = useMutation({
    mutationFn: async (input: { toolSlug: string; permission: StarshipAgentToolPermissionModel['permission'] }) => {
      if (!agentIdForPermissions) throw new Error('Missing agent id')
      const body: UpdateAgentToolPermissionsRequest = { permissions: [{ toolSlug: input.toolSlug, permission: input.permission }] }
      await api.put(`/api/v1/agents/${agentIdForPermissions}/tool-permissions`, body)
      return input
    },
    onMutate: async (input: { toolSlug: string; permission: StarshipAgentToolPermissionModel['permission'] }) => {
      if (!agentIdForPermissions) return
      await queryClient.cancelQueries({ queryKey: ['starship-agent-tool-permissions', starshipId] as const })
      const prev = queryClient.getQueryData<StarshipAgentToolPermissionModel[]>(['starship-agent-tool-permissions', starshipId] as const)
      queryClient.setQueryData<StarshipAgentToolPermissionModel[]>(['starship-agent-tool-permissions', starshipId] as const, old => {
        const next = Array.isArray(old) ? [...old] : []
        const idx = next.findIndex(r => r.agentId === agentIdForPermissions && r.toolSlug === input.toolSlug)
        if (idx >= 0) {
          next[idx] = { ...next[idx], permission: input.permission }
          return next
        }
        // Only add a new row when we already have data; otherwise cache was empty and
        // we'd end up with one row, making all other tools show the fallback ('allow').
        if (next.length > 0) {
          next.push({ agentId: agentIdForPermissions, toolId: '', toolSlug: input.toolSlug, permission: input.permission })
          return next
        }
        return old
      })
      return { prev }
    },
    onError: (_err: unknown, _input: unknown, ctx: { prev?: StarshipAgentToolPermissionModel[] } | undefined) => {
      if (ctx?.prev) queryClient.setQueryData(['starship-agent-tool-permissions', starshipId] as const, ctx.prev)
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['starship-agent-tool-permissions', starshipId] as const })
    },
  })
  const selectedToolSlugs = value.assignedToolSlugs || []
  const allToolOptions = useMemo(() => {
    const fetchedSlugs = Array.isArray(starshipTools) ? Array.from(new Set(starshipTools.map((t: ToolModel) => t.slug).filter(Boolean))) : []
    return Array.from(new Set([...(selectedToolSlugs as string[]), ...fetchedSlugs]))
  }, [starshipTools, selectedToolSlugs])

  // Publication workflow has been removed; no tool overrides are needed.
  const assignedToolsForOverrides: ToolModel[] = []

  // Show compact identity in the sticky banner only after the main page header scrolls out of view.
  useEffect(() => {
    if (embedded) return
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

  // Auto-grow the System Prompt textarea to fit content
  useEffect(() => {
    const el = systemPromptTextareaRef.current
    if (!el) return
    try {
      el.style.height = 'auto'
      const nextHeight = Math.max(el.scrollHeight, 200)
      el.style.height = `${nextHeight}px`
    } catch {
      // ignore
    }
  }, [value.systemPrompt])

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
        if (!value?.slug || value.slug === 'new') {
          if (!cancelled) {
            setAgentId(null)
            setFullAgent(null)
          }
          return
        }

        // If parent already provided the full agent model, use it and do NOT fetch.
        if (providedAgent && typeof providedAgent.id === 'string' && providedAgent.id.trim().length > 0) {
          if (!cancelled) {
            setAgentId(providedAgent.id)
            setFullAgent(providedAgent)
          }
          return
        }

        // If the parent already provided the canonical id, hydrate directly from /agents/:id.
        if (typeof providedAgentId === 'string' && providedAgentId.trim().length > 0) {
          const id = providedAgentId.trim()
          if (!cancelled) setAgentId(id)
          // Do not fetch here. The parent page is responsible for fetching /agents/:id and can pass `agent`.
          if (!cancelled) setFullAgent(null)
          return
        }

        // Fallback: resolve id from starship+slug, then hydrate canonical /agents/:id.
        if (!starshipId) {
          if (!cancelled) {
            setAgentId(null)
            setFullAgent(null)
          }
          return
        }
        const starshipUrl = `/api/v1/starships/${starshipId}/agents/${value.slug}`
        // NOTE: the starship-scoped agent endpoint is primarily for resolving the id by slug.
        // Its payload may be a partial AgentModel (missing model settings), which can cause
        // false "changes to publish" vs the published template after a hard reload.
        // We immediately hydrate `fullAgent` from the canonical agent detail endpoint.
        const result = await safeGet<AgentModel>(starshipUrl)
        if (result.ok && result.data?.id) {
          const agent = result.data
          if (!cancelled) {
            setAgentId(agent.id || null)
          }
          // Fetch full agent details (canonical shape) for publish diff + autosave baseline.
          // IMPORTANT: use React Query so concurrent callers share a single request.
          try {
            const hydrated = await queryClient.fetchQuery({
              queryKey: AGENT_QUERY_KEYS.detail(agent.id),
              queryFn: async (): Promise<AgentModel> => {
                const res: FetchResponse<ApiResponse<AgentModel>> = await api.get(`/api/v1/agents/${agent.id}`)
                return res.data.data
              },
              staleTime: 30 * 1000,
            })
            if (!cancelled) setFullAgent(hydrated?.id ? hydrated : agent)
          } catch {
            if (!cancelled) setFullAgent(agent)
          }
        } else {
          if (!cancelled) {
            setAgentId(null)
            setFullAgent(null)
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
  }, [starshipId, value?.slug, providedAgentId, providedAgent, queryClient])

  // Toggle tool assignment with optimistic UI and server persistence when possible
  const handleToggleTool = async (slug: string, isSelected: boolean) => {
    if (readOnly) return
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
          onFieldChange?.('assignedToolSlugs', slugs)
        }
        hasSyncedAssignedRef.current = true
      } catch {
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
      // If the parent page provided agentId, it also owns the canonical /agents/:id fetch + prefill.
      // Avoid an additional /agents/:id request from inside the editor.
      if ((typeof providedAgentId === 'string' && providedAgentId.trim().length > 0) || (providedAgent && providedAgent.id)) {
        hasSyncedAgentRef.current = true
        return
      }
      try {
        // If we reached here, we're in a non-page context that didn't provide `agent`.
        // Fetch once to backfill missing form fields.
        const res: FetchResponse<ApiResponse<AgentModel>> = await api.get(`/api/v1/agents/${agentId}`)
        const agent = res.data.data
        if (!agent) return
        if (!value.name && agent.name) onFieldChange?.('name', agent.name)
        if (!value.role && agent.role) onFieldChange?.('role', agent.role)
        if (!value.slug && agent.slug) onFieldChange?.('slug', agent.slug)
        if (!value.description && agent.description) onFieldChange?.('description', agent.description)
        if (!value.model && agent.model) onFieldChange?.('model', agent.model)
        if (!value.category && agent.category) {
          onFieldChange?.('category', agent.category as any)
        }
        if (value.temperature == null && agent.temperature != null) onFieldChange?.('temperature', agent.temperature as any)
        if (value.maxTokens == null && agent.maxTokens != null) onFieldChange?.('maxTokens', agent.maxTokens as any)
        if ((value.reasoning === 'none' || !value.reasoning) && (agent as any).reasoning) {
          const effort = (agent as any)?.reasoning?.effort as AgentFormData['reasoning'] | undefined
          if (effort === 'low' || effort === 'medium' || effort === 'high') {
            onFieldChange?.('reasoning', effort as any)
          }
        } else if (!value.reasoning) {
          onFieldChange?.('reasoning', 'none' as any)
        }
        if (!value.systemPrompt && agent.systemPrompt) onFieldChange?.('systemPrompt', agent.systemPrompt)
        if ((!Array.isArray(value.previewPrompts) || value.previewPrompts.length === 0) && Array.isArray(agent.previewPrompts)) {
          onFieldChange?.('previewPrompts', (agent.previewPrompts as string[]).filter(Boolean))
        }
        if (value.timeout == null && agent.timeout != null) onFieldChange?.('timeout', agent.timeout as any)
        if (agent.blueprint && (!value.blueprint || value.blueprint.trim() === '' || value.blueprint.trim() === '{\n  "nodes": [],\n  "edges": []\n}')) {
          onFieldChange?.('blueprint', JSON.stringify(agent.blueprint, null, 2))
        }
        hasSyncedAgentRef.current = true
      } catch {
        // ignore
      }
    }
    void syncAgent()
  }, [agentId, value, onChange, providedAgentId, providedAgent, onFieldChange])

  const hasExistingAgent = !!agentId
  const canRequestPublication = hasExistingAgent && !!fullAgent && !readOnly

  // Autosave agent changes for existing agents
  useEffect(() => {
    if (!agentId) return
    if (readOnly) return
    if (!fullAgent) return

    // Build update payload from current form value
    const buildUpdates = (): UpdateAgentRequest => {
      // JSONB objects coming from Postgres don't have stable key ordering.
      // Using JSON.stringify for comparisons can cause infinite autosave loops.
      const stableStringify = (input: unknown): string => {
        const sortKeys = (v: unknown): unknown => {
          if (Array.isArray(v)) return v.map(sortKeys)
          if (v && typeof v === 'object') {
            const rec = v as Record<string, unknown>
            const out: Record<string, unknown> = {}
            for (const k of Object.keys(rec).sort()) {
              out[k] = sortKeys(rec[k])
            }
            return out
          }
          return v
        }
        return JSON.stringify(sortKeys(input))
      }

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
      const baseReasoning = (base as any)?.reasoning as { effort?: string } | undefined
      const nextEffort = value.reasoning as AgentFormData['reasoning']

      if (value.name && value.name.trim().length > 0 && value.name !== base.name) {
        updates.name = value.name
      }

      if (typeof value.role === 'string') {
        const nextRole = value.role.trim()
        const baseRole = typeof base.role === 'string' ? base.role : ''
        if (nextRole.length > 0 && nextRole !== baseRole) {
          updates.role = nextRole
        }
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

      if (value.category && fullAgent?.category !== value.category) {
        updates.category = value.category as any
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

      // Reasoning (effort select)
      // Only persist reasoning changes when the user explicitly changed the dropdown.
      if (reasoningDirtyRef.current) {
        if (nextEffort === 'none') {
          // If user picked "none", explicitly clear reasoning so the backend can reconcile
          // any historical blueprint defaults.
          ;(updates as any).reasoning = null
        } else {
          const nextObj = { enabled: true, effort: nextEffort }
          const baseEffort = baseReasoning?.effort
          if (baseEffort !== nextEffort) {
            ;(updates as any).reasoning = nextObj
          }
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
        const nextStr = stableStringify(blueprintObj)
        const baseStr = stableStringify(baseBlueprint)
        if (nextStr !== baseStr) {
          ;(updates as any).blueprint = blueprintObj
        }
      }

      // State (including plugins for web browsing)
      // Only update state if form has state AND it differs from base
      // If form state is missing plugins but base has plugins, don't remove them
      if (value.state && typeof value.state === 'object') {
        const baseState = (base.state && typeof base.state === 'object' ? base.state : {}) as ConversationState
        const nextState = value.state as ConversationState

        // Check if we should skip update to preserve plugins
        if (shouldSkipStateUpdateToPreservePlugins(baseState, nextState)) {
          // Don't update - preserve base state with plugins
        } else if (!areStatesEqual(baseState, nextState)) {
          updates.state = nextState
        } else {
        }
      } else if (base.state && typeof base.state === 'object') {
        // If form has no state but base has state, preserve base state
        // This ensures plugins aren't lost when form state is reset
        if (baseStateHasPlugins(base.state as ConversationState)) {
          // Don't update - let base state persist
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
          // ALWAYS preserve state from updates if we sent it, regardless of API response
          // This ensures state (like plugins) is never lost
          if (updates.state && typeof updates.state === 'object') {
            ;(updated as any).state = updates.state
          }
          setFullAgent(updated)
          // Keep React Query cache in sync for this agent
          queryClient.setQueryData(AGENT_QUERY_KEYS.detail(updated.id), updated)
          // IMPORTANT:
          // Editing the agent name regenerates its slug on the server. The agent page route is slug-based
          // and resolves agentId from the starship agents list. If we don't refresh that list, a later
          // background refetch (focus/refresh) can cause "Agent not found" due to URL slug mismatch.
          if (starshipId) {
            queryClient.invalidateQueries({ queryKey: AGENT_QUERY_KEYS.byStarship(starshipId) })
          }
          // If we successfully persisted a reasoning change, clear the dirty flag
          if (Object.prototype.hasOwnProperty.call(updates as object, 'reasoning')) {
            reasoningDirtyRef.current = false
          }
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
  }, [agentId, value, readOnly, queryClient, fullAgent])

  return (
    <div className={embedded ? 'pt-2 pb-6' : 'pt-4 pb-20'}>
      {/* Primary actions & publication status - compact banner (styled like navbar, sticky with offset) */}
      {!embedded ? (
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
                    <span className="text-base font-semibold truncate tracking-tight">{formatAgentDisplayName(fullAgent?.name || value.name, fullAgent?.role || value.role)}</span>
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

                {/* Version & Last updated */}
                <div className="flex flex-wrap items-center gap-3 text-xs font-medium">
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
                        setChangelog('Initial publication of this agent to Explore.')
                      }

                      // Always start the stepped flow at the agent card
                      setActivePublishStep('agent')
                      setShowPublishDialog(true)
                    }}
                  >
                    <Icon name="rocket-launch" className="w-3.5 h-3.5" />
                    {isRequestingPublish ? 'Publishing…' : 'Publish'}
                  </Button>
                )}
              </div>

            </div>
          )}
        </div>
      ) : null}

      {/* Publication Request Dialog */}
      {!embedded ? (
        <AgentPublishModal
          open={showPublishDialog}
          readOnly={readOnly}
          onOpenChange={setShowPublishDialog}
          fullAgent={fullAgent}
          value={value}
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
      ) : null}

      {/* Core configuration */}
      <Card className="rounded-2xl border-border/50 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Icon name="settings" className="h-4 w-4 text-primary" />
            Agent profile
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-3">
          {/* Name */}
          <div className="border-b border-border/10 pb-2">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="flex items-center gap-2 text-muted-foreground w-full sm:min-w-[160px] sm:w-auto">
                <Icon name="id-card" className="w-4 h-4" />
                <span className="text-xs font-semibold">Name</span>
              </div>
              <div className="w-full sm:w-[260px]">
                <Input
                  id="agent-name"
                  value={value.name}
                  onChange={e => onFieldChange?.('name', e.target.value)}
                  placeholder="Agent name"
                  disabled={readOnly}
                  className={cn('text-sm h-9', selectLikeFieldClass)}
                />
              </div>
            </div>
          </div>

          {/* Role */}
          <div className="border-b border-border/10 pb-2">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="flex items-center gap-2 text-muted-foreground w-full sm:min-w-[160px] sm:w-auto">
                <Icon name="user-cog" className="w-4 h-4" />
                <span className="text-xs font-semibold">Role</span>
              </div>
              <div className="w-full sm:w-[260px]">
                <Input
                  value={value.role}
                  onChange={e => onFieldChange?.('role', e.target.value)}
                  placeholder='e.g. "Customer Support Agent"'
                  disabled={readOnly}
                  className={cn('text-sm h-9', selectLikeFieldClass)}
                />
              </div>
            </div>
          </div>

          {/* Category section */}
          <div className="border-b border-border/10 pb-2">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="flex items-center gap-2 text-muted-foreground w-full sm:min-w-[160px] sm:w-auto">
                <Icon name="tag" className="w-4 h-4" />
                <span className="text-xs font-semibold">Category</span>
              </div>
              <div className="w-full sm:w-[260px]">
                <StandardSelect
                  mode="single"
                  aria-label="Change category"
                  disabled={readOnly}
                  value={value.category}
                  options={AGENT_CATEGORIES.map(cat => ({
                    value: cat,
                    label: (
                      <span className="flex items-center gap-2">
                        <span className={cn('h-2 w-2 rounded-full', getCategoryDotColor(cat as any))} />
                        <span className="capitalize">{cat}</span>
                      </span>
                    ),
                    keywords: cat,
                  }))}
                  placeholder="Select a category"
                  triggerClassName={cn('w-full', readOnly && 'cursor-not-allowed')}
                  onChange={cat => {
                    onChange({ ...value, category: (cat as AgentFormData['category']) ?? value.category })
                  }}
                />
              </div>
            </div>
          </div>

          {/* Model section */}
          <div className="border-b border-border/10 pb-2">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="flex items-center gap-2 text-muted-foreground w-full sm:min-w-[160px] sm:w-auto">
                <Icon name="cpu" className="w-4 h-4" />
                <span className="text-xs font-semibold">Model</span>
              </div>
              <div className="w-full sm:w-[260px]">
                <StandardSelect
                  mode="single"
                  aria-label="Select model"
                  disabled={isLoadingModels || readOnly}
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
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="flex items-center gap-2 text-muted-foreground w-full sm:min-w-[160px] sm:w-auto">
                <Icon name="wrench" className="w-4 h-4" />
                <span className="text-xs font-semibold">Assigned Tools</span>
              </div>
              <div className="w-full sm:w-[260px]">
                <StandardSelect
                  mode="multiple"
                  aria-label="Select tools"
                  disabled={readOnly}
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
                  triggerClassName={cn('w-full', readOnly && 'opacity-60 cursor-not-allowed')}
                  renderTriggerLabel={({ selectedOptions }) => {
                    if (!selectedOptions.length) {
                      return <span className="text-xs text-muted-foreground">{readOnly ? 'No tools assigned' : 'Select tools'}</span>
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
                    if (readOnly) return
                    void handleToggleTool(slug, wasSelected)
                  }}
                />
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="border-b border-border/10 pb-2">
            <div className="flex flex-col sm:flex-row sm:items-start gap-2">
              <div className="flex items-center gap-2 text-muted-foreground w-full sm:min-w-[160px] sm:w-auto pt-0 sm:pt-2">
                <Icon name="file-text" className="w-4 h-4" />
                <span className="text-xs font-semibold">Description</span>
              </div>
              <div className={cn('flex-1', readOnly && 'opacity-60 pointer-events-none cursor-not-allowed')}>
                <Textarea
                  value={value.description}
                  onChange={e => onFieldChange?.('description', e.target.value)}
                  placeholder="Write a clear description."
                  className={cn('text-sm min-h-[80px] resize-none', selectLikeFieldClass)}
                  disabled={readOnly}
                />
              </div>
            </div>
          </div>

          {/* System prompt moved under Advanced settings */}
        </CardContent>
      </Card>

      {/* Capabilities (tool permissions) */}
      <Card className="rounded-2xl border-border/50 shadow-sm mt-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Icon name="wrench" className="h-4 w-4 text-primary" />
            Capabilities
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!agentIdForPermissions ? (
            <div className="text-sm text-muted-foreground">Save the agent to configure tool permissions.</div>
          ) : assignedToolModels.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/50 bg-muted/10 p-4 text-sm text-muted-foreground">No tools assigned. Assign tools above to configure permissions.</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {assignedToolModels.map(tool => {
                const current = permissionByToolSlug.get(tool.slug) ?? ('ask' as StarshipAgentToolPermissionModel['permission'])
                const disabled = readOnly || setPermissionMutation.isPending
                const toolSecondary = (tool.description || '').trim() || tool.slug
                return (
                  <div key={tool.slug} className="group relative rounded-xl border border-border/50 bg-gradient-to-br from-background/50 to-background/30 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="mt-1.5 flex-shrink-0">
                          <div className={cn('h-2 w-2 rounded-full', permissionDotClassName(current))} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold leading-5 text-foreground truncate">{tool.name || tool.slug}</div>
                          <div className={cn('mt-1.5 text-xs leading-relaxed text-muted-foreground line-clamp-2', !tool.description ? 'font-mono' : undefined)}>{toolSecondary}</div>
                        </div>
                      </div>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <span className={cn('inline-flex', disabled && 'cursor-not-allowed')}>
                            <button
                              type="button"
                              disabled={disabled}
                              className={cn('inline-flex items-center', disabled && 'opacity-70')}
                              aria-label={`Tool permission for ${tool.slug}: ${permissionLabel(current)}. Open menu to change.`}
                            >
                              <Badge variant="outline" className={cn('whitespace-nowrap border', permissionBadgeClassName(current))}>
                                <span className="inline-flex items-center gap-1.5">
                                  <Icon name={permissionIconName(current)} className="h-3.5 w-3.5" />
                                  <span>{permissionLabel(current)}</span>
                                  <Icon name="chevron-down" className="h-3.5 w-3.5 opacity-70" />
                                </span>
                              </Badge>
                            </button>
                          </span>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-64">
                          {permissionOptions.map(opt => (
                            <DropdownMenuItem
                              key={opt.value}
                              className={cn('cursor-pointer', permissionMenuItemClassName(opt.value), opt.value === current && permissionMenuItemSelectedClassName(opt.value))}
                              onClick={() => {
                                if (disabled) return
                                setPermissionMutation.mutate({ toolSlug: tool.slug, permission: opt.value })
                              }}
                            >
                              <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-2">
                                  <Icon name={opt.icon} className={cn('h-4 w-4', permissionMenuIconClassName(opt.value))} />
                                  <span className="text-sm font-medium">{opt.label}</span>
                                  <span className="ml-auto" />
                                </div>
                                <div className="text-xs text-muted-foreground">{opt.description}</div>
                              </div>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Try these prompts (Preview Prompts) */}
      <Card className="rounded-2xl border-border/50 shadow-sm mt-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Icon name="message-square" className="h-4 w-4 text-primary" />
            Try these prompts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="space-y-1">
              {(value.previewPrompts || []).length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/50 bg-muted/10 p-4 text-xs text-muted-foreground">
                  No prompts yet. Add 3–5 prompts to show what this agent is best at.
                </div>
              ) : (
                <ul className="grid grid-cols-1 gap-3">
                  {(value.previewPrompts || []).map((prompt, idx) => (
                    <li key={idx} className={cn('group relative rounded-lg border border-border/50 bg-gradient-to-br from-background/50 to-background/30 p-4', promptsEditable && 'transition-colors')}>
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex-shrink-0">
                          <Icon name="sparkles" className="h-4 w-4 text-primary" />
                        </div>

                        <div className="min-w-0 flex-1">
                          {promptsEditable ? (
                            <Input
                              className={cn('h-auto border-0 bg-transparent px-0 py-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0', 'text-sm leading-relaxed text-foreground')}
                              value={prompt}
                              onChange={e => {
                                const next = [...(value.previewPrompts || [])]
                                next[idx] = e.target.value
                                const cleaned = next
                                  .map(s => s.trim())
                                  .filter(Boolean)
                                  .slice(0, 10)
                                onFieldChange?.('previewPrompts', cleaned)
                              }}
                              placeholder="Add a prompt…"
                            />
                          ) : (
                            <p className="text-sm leading-relaxed text-foreground">{prompt}</p>
                          )}
                        </div>

                        {promptsEditable ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={() => {
                              const next = (value.previewPrompts || []).filter((_, i) => i !== idx)
                              onFieldChange?.('previewPrompts', next)
                            }}
                            aria-label="Remove prompt"
                          >
                            <Icon name="x" className="w-3 h-3" />
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {promptsEditable ? (
              <div className="flex items-center gap-2">
                <Input
                  className={cn('text-sm flex-1 h-9', selectLikeFieldClass)}
                  placeholder="Add a prompt…"
                  value={newPreviewPrompt}
                  onChange={e => setNewPreviewPrompt(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
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
                  className="h-9 px-3 rounded-xl text-[11px]"
                  disabled={!newPreviewPrompt.trim() || (value.previewPrompts || []).length >= 10}
                  onClick={() => {
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
            ) : null}
            <div className="text-[11px] text-muted-foreground flex items-center justify-end">
              <span>
                {(value.previewPrompts || []).length}
                /10
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Advanced options (includes Blueprint) */}
      <Card className="rounded-2xl border-border/50 shadow-sm mt-6 overflow-hidden">
          <Collapsible defaultOpen={false}>
            <CollapsibleTrigger className="w-full">
              <div className="flex items-center gap-2 px-6 py-4 text-muted-foreground hover:text-foreground transition-colors">
                <Icon name="sliders-horizontal" className="w-4 h-4 text-primary" />
                <span className="text-base font-semibold flex-1 text-left">Advanced settings</span>
                <Icon name="chevron-down" className="w-4 h-4 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent unmountOnClose>
              <div className="space-y-4 border-t border-border/30 p-6 pt-4">
                {/* Blueprint first */}
                {!embedded ? (
                  <div>
                    <div className="flex flex-col sm:flex-row sm:items-start gap-2">
                      <div className="flex items-center gap-2 text-muted-foreground w-full sm:min-w-[160px] sm:w-auto pt-0 sm:pt-1">
                        <Icon name="network" className="w-4 h-4" />
                        <span className="text-xs font-semibold">Blueprint</span>
                      </div>
                      <div className="flex-1">
                        <ErrorBoundary component="BlueprintVisualization" fallback={<div className="h-[320px] w-full rounded-lg border border-border/60 bg-muted/20" />}>
                          <BlueprintVisualization
                            blueprint={(() => {
                              try {
                                const parsed = JSON.parse(value.blueprint || '{"nodes":[],"edges":[]}')
                                // Ensure blueprint has valid structure
                                if (!parsed || typeof parsed !== 'object') {
                                  return { nodes: [], edges: [] } as any
                                }
                                if (!Array.isArray(parsed.nodes)) {
                                  parsed.nodes = []
                                }
                                if (!Array.isArray(parsed.edges)) {
                                  parsed.edges = []
                                }
                                return parsed
                              } catch {
                                return { nodes: [], edges: [] } as any
                              }
                            })()}
                            className="h-[320px]"
                            transparent
                            nodesDraggable={false}
                          />
                        </ErrorBoundary>
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* Then numeric advanced controls */}
                <div className="space-y-2 border-t border-border/10 pt-2">
                  {/* Reasoning */}
                  <div className="flex flex-col sm:flex-row sm:items-start gap-2">
                    <div className="flex items-center gap-2 text-muted-foreground w-full sm:min-w-[160px] sm:w-auto pt-0 sm:pt-1">
                      <Icon name="brain" className="w-4 h-4" />
                      <span className="text-xs font-semibold">Reasoning</span>
                    </div>
                    <div className="flex-1">
                      <div className="w-full sm:w-[260px]">
                        <StandardSelect
                          aria-label="Select reasoning effort"
                          disabled={readOnly}
                          value={value.reasoning}
                          options={[
                            { value: 'none', label: <span className="text-xs text-muted-foreground">None</span>, keywords: 'none off disabled' },
                            { value: 'low', label: <span className="text-xs">Low</span>, keywords: 'low' },
                            { value: 'medium', label: <span className="text-xs">Medium</span>, keywords: 'medium' },
                            { value: 'high', label: <span className="text-xs">High</span>, keywords: 'high' },
                          ]}
                          placeholder="Select reasoning"
                          triggerClassName={cn('w-full', readOnly && 'opacity-60 cursor-not-allowed')}
                          onChange={val => {
                            if (typeof val !== 'string') return
                            if (readOnly) return

                            const nextEffort = val as AgentFormData['reasoning']
                            reasoningDirtyRef.current = true
                            onFieldChange?.('reasoning', nextEffort as any)
                          }}
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">Controls the model’s reasoning effort (when supported).</p>
                    </div>
                  </div>

                  {/* Temperature */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <div className="flex items-center gap-2 text-muted-foreground w-full sm:min-w-[160px] sm:w-auto">
                      <span className="text-xs font-semibold">Temperature</span>
                    </div>
                    <div className="w-full sm:w-[260px]">
                      <Input
                        id="agent-temperature"
                        type="number"
                        min="0"
                        max="2"
                        step="0.1"
                        value={value.temperature}
                        onChange={e => onFieldChange?.('temperature', parseFloat(e.target.value) || 0)}
                        disabled={readOnly}
                        className={cn('text-sm h-7', selectLikeFieldClass)}
                      />
                    </div>
                  </div>

                  {/* Max Tokens */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <div className="flex items-center gap-2 text-muted-foreground w-full sm:min-w-[160px] sm:w-auto">
                      <span className="text-xs font-semibold">Max Tokens</span>
                    </div>
                    <div className="w-full sm:w-[260px]">
                      <Input
                        id="agent-max-tokens"
                        type="number"
                        min="1"
                        step="1"
                        value={value.maxTokens}
                        onChange={e => onFieldChange?.('maxTokens', parseInt(e.target.value, 10) || 2048)}
                        disabled={readOnly}
                        className={cn('text-sm h-7', selectLikeFieldClass)}
                      />
                    </div>
                  </div>

                  {/* Timeout */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <div className="flex items-center gap-2 text-muted-foreground w-full sm:min-w-[160px] sm:w-auto">
                      <span className="text-xs font-semibold">Timeout (ms)</span>
                    </div>
                    <div className="w-full sm:w-[260px]">
                      <Input
                        id="agent-timeout"
                        type="number"
                        min="1000"
                        step="1000"
                        value={value.timeout}
                        onChange={e => onFieldChange?.('timeout', parseInt(e.target.value, 10) || 60000)}
                        disabled={readOnly}
                        className={cn('text-sm h-7', selectLikeFieldClass)}
                      />
                    </div>
                  </div>
                </div>

                {/* System prompt (advanced) */}
                <div className="space-y-2 border-t border-border/10 pt-4">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-2">
                    <div className="flex items-center gap-2 text-muted-foreground w-full sm:min-w-[160px] sm:w-auto pt-0 sm:pt-2">
                      <Icon name="sparkles" className="w-4 h-4" />
                      <span className="text-xs font-semibold">System prompt</span>
                    </div>
                    <div className={cn('flex-1', readOnly && 'opacity-60 pointer-events-none cursor-not-allowed')}>
                      <Textarea
                        ref={systemPromptTextareaRef}
                        value={value.systemPrompt}
                        onChange={e => {
                          onFieldChange?.('systemPrompt', e.target.value)
                          try {
                            e.currentTarget.style.height = 'auto'
                            const nextHeight = Math.max(e.currentTarget.scrollHeight, 200)
                            e.currentTarget.style.height = `${nextHeight}px`
                          } catch {
                            // ignore
                          }
                        }}
                        placeholder="Define the agent's character, mission, and behavior..."
                        className={cn('text-sm min-h-[200px] resize-none overflow-hidden', selectLikeFieldClass)}
                        disabled={readOnly}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </Card>

      {/* Category & Icon removed: now controlled via the badge selector above */}
    </div>
  )
}
