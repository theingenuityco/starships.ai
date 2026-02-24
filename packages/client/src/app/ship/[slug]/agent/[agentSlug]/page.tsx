'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import type { MessageModel } from '@starships/protocol'
import type { LlmToolCall } from '@starships/autopilot'

import { AgentBuilderView, AgentBuilderViewRef } from '@/components/agents/AgentBuilder'
import AgentAvatar from '@/components/animated/AgentAvatar'
import { useMessageAttachments } from '@/hooks/useFileUpload'
import { ConversationMessageInput } from '@/components/conversation/ConversationMessageInput'
import type { ConversationMessageInputRef } from '@/components/conversation/ConversationMessageInput'
import { AgentSelector } from '@/components/conversation/AgentSelector'
import { useConversationStreamContext } from '@/hooks/ConversationStreamContext'
import { useStarshipBySlug } from '@/hooks/useStarships'
import api, { agentAPI, getCurrentToken } from '@/lib/api'
import { AGENT_QUERY_KEYS, useAgent, useStarshipAgents } from '@/hooks/useAgents'
import { useConversationAgents, useStarshipChannels } from '@/hooks/useConversations'
import { useAuth } from '@/hooks/useAuth'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { LoadingSpinner } from '@/components/primitives/LoadingSpinner'
import Icon from '@/components/primitives/Icon'

export default function AgentBuilderPage(): React.JSX.Element | null {
  const { slug, agentSlug } = useParams<{ slug: string; agentSlug: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isInstanceAdmin } = useAuth()

  const { data: starship } = useStarshipBySlug(slug, true)
  const agentBuilderRef = useRef<AgentBuilderViewRef>(null)
  const messageInputRef = useRef<ConversationMessageInputRef>(null)
  const queryClient = useQueryClient()
  const conversationId = searchParams.get('conversationId') || null
  const { data: agents = [], isLoading: isLoadingAgents } = useStarshipAgents(starship?.id || '', !!starship?.id)
  const { data: convAgents = [] } = useConversationAgents(conversationId)
  const { data: channelsData } = useStarshipChannels(starship?.id ?? '', Boolean(starship?.id))
  const selectedAgent = useMemo(() => {
    if (convAgents && convAgents.length > 0) return convAgents[0]
    return agents[0] || null
  }, [convAgents, agents])

  // Keep conversation streaming state via the ship-layout provider
  const { messages: liveMessages = [], isResponding } = useConversationStreamContext()

  // Control the expandable overlay: user-driven; semi-expanded shows automatically while streaming
  const [isOverlayExpanded, setIsOverlayExpanded] = useState<boolean>(false)

  // Avatar preview/regenerate modal
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState<boolean>(false)
  const [isRegeneratingAvatar, setIsRegeneratingAvatar] = useState<boolean>(false)
  const [avatarRegenMode, setAvatarRegenMode] = useState<'avatar_only' | 'full_chain' | 'migrate_2d_to_3d' | null>(null)
  const [avatarStyleMode, setAvatarStyleMode] = useState<'2d' | '3d'>('3d')
  const [isUploadingAvatar, setIsUploadingAvatar] = useState<boolean>(false)
  const [isDownloadingAvatar, setIsDownloadingAvatar] = useState<boolean>(false)
  const avatarFileInputRef = useRef<HTMLInputElement>(null)

  // Autofocus the conversation input when the page loads (and conversation is present)
  useEffect(() => {
    if (!conversationId) return
    // On small screens, avoid auto-focusing the input (prevents mobile keyboard pop).
    if (typeof window !== 'undefined' && window.innerWidth < 768) return
    const t = setTimeout(() => {
      try {
        messageInputRef.current?.focusInput?.()
      } catch {}
    }, 150)
    return () => clearTimeout(t)
  }, [conversationId])

  // Ensure slug is present in form ASAP so downstream effects can resolve agentId
  useEffect(() => {
    if (!agentBuilderRef.current) return
    if (agentSlug && agentSlug !== 'new') {
      agentBuilderRef.current.updateField('slug', String(agentSlug))
    }
  }, [agentSlug])

  // Resolve agent id from the already-fetched starship agent list to avoid slug-based lookups.
  const resolvedAgentId = useMemo(() => {
    if (!agentSlug || agentSlug === 'new') return null
    const match = (agents || []).find(a => String((a as any)?.slug || '') === String(agentSlug))
    return match?.id || null
  }, [agents, agentSlug])

  // Keep a stable canonical agent id once we have it.
  // This prevents false "Agent not found" states when the server regenerates the slug
  // (e.g. user edits agent name) and the URL/list momentarily diverge during refetches.
  const [canonicalAgentId, setCanonicalAgentId] = useState<string | null>(null)

  // When we normalize a slug (router.replace to the canonical slug for an agent id),
  // we should NOT clear the canonical agent id on the ensuing route change. For any
  // other agentSlug navigation (e.g. user clicks into a different agent or an invalid
  // slug), we MUST clear it to avoid stale redirects back to the previously viewed agent.
  const slugNormalizationTargetRef = useRef<string | null>(null)
  const prevAgentSlugRef = useRef<string | null>(null)
  useEffect(() => {
    const current = agentSlug ? String(agentSlug) : null

    // If this navigation was initiated by our own slug-normalization replace, keep canonical id.
    if (slugNormalizationTargetRef.current && current === slugNormalizationTargetRef.current) {
      slugNormalizationTargetRef.current = null
      prevAgentSlugRef.current = current
      return
    }

    // If the user navigated to a different slug, reset canonical id immediately.
    if (prevAgentSlugRef.current !== null && prevAgentSlugRef.current !== current) {
      setCanonicalAgentId(null)
    }
    prevAgentSlugRef.current = current
  }, [agentSlug])

  useEffect(() => {
    if (agentSlug === 'new') {
      setCanonicalAgentId(null)
      return
    }
    if (resolvedAgentId && resolvedAgentId !== canonicalAgentId) {
      setCanonicalAgentId(resolvedAgentId)
    }
  }, [agentSlug, resolvedAgentId, canonicalAgentId])

  // Use canonical id when available, but fall back to the resolved id for the same render
  // to avoid transient "not found" flashes before the canonical effect runs.
  const effectiveAgentId = canonicalAgentId || resolvedAgentId || null

  const isEditingExisting = agentSlug !== 'new'
  const isResolvingExistingAgentId = isEditingExisting && !effectiveAgentId && isLoadingAgents
  const isMissingExistingAgent = isEditingExisting && !effectiveAgentId && !isLoadingAgents

  // Prefill when editing an existing agent via canonical id endpoint.
  const { data: existingAgent, isError: isExistingAgentError } = useAgent(effectiveAgentId || '', !!effectiveAgentId)
  const lastPrefilledAgentIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (!isEditingExisting) return
    if (!existingAgent?.slug) return
    if (!agentSlug || agentSlug === 'new') return
    const nextSlug = String(existingAgent.slug)
    if (nextSlug) {
      // IMPORTANT:
      // We update the address bar via history.replaceState (no Next.js navigation) to avoid remounting
      // the page/form during renames. Because of that, `useParams().agentSlug` can be stale relative to
      // the address bar. Always compare against the current location slug.
      let locationSlug: string | null = null
      try {
        if (typeof window !== 'undefined') {
          const parts = window.location.pathname.split('/').filter(Boolean)
          const last = parts.length > 0 ? parts[parts.length - 1] : null
          locationSlug = last ? decodeURIComponent(last) : null
        }
      } catch {
        locationSlug = null
      }
      if (locationSlug && locationSlug === nextSlug) return

      // Renaming an agent can regenerate its slug on the server. We want the URL to reflect that,
      // but navigating (router.replace) remounts the whole page and causes the form to lose focus.
      // Instead, update the address bar without a Next.js navigation.
      try {
        if (typeof window !== 'undefined') {
          const desiredPath = `/ship/${slug}/agent/${encodeURIComponent(nextSlug)}`
          const q = conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : ''
          const desiredUrl = `${desiredPath}${q}`
          const curUrl = `${window.location.pathname}${window.location.search}`
          if (curUrl !== desiredUrl) {
            window.history.replaceState(null, '', desiredUrl)
          }
          return
        }
      } catch {
        // ignore
      }
      // Fallback (should rarely happen): if history APIs fail, do a normal replace.
      const q = conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : ''
      slugNormalizationTargetRef.current = nextSlug
      router.replace(`/ship/${slug}/agent/${encodeURIComponent(nextSlug)}${q}`)
    }
  }, [isEditingExisting, existingAgent?.slug, agentSlug, conversationId, router, slug])

  useEffect(() => {
    if (!existingAgent || !agentBuilderRef.current) return
    // Only prefill once per agent id to avoid clobbering in-flight edits on background refetches.
    if (existingAgent.id && lastPrefilledAgentIdRef.current === existingAgent.id) return
    try {
      console.debug('[AgentBuilder] Prefill fetched agent', { id: existingAgent.id, slug: existingAgent.slug })
    } catch {}
    const currentForm = agentBuilderRef.current.getFormData?.()
    agentBuilderRef.current.updateField('name', existingAgent.name || '')
    if (!currentForm?.role && existingAgent.role) agentBuilderRef.current.updateField('role', existingAgent.role || '')
    if (existingAgent.slug) agentBuilderRef.current.updateField('slug', existingAgent.slug)
    if (existingAgent.description) agentBuilderRef.current.updateField('description', existingAgent.description)
    if (existingAgent.model) agentBuilderRef.current.updateField('model', existingAgent.model)
    if (!currentForm?.category && existingAgent.category) {
      agentBuilderRef.current.updateField('category', existingAgent.category as any)
    }
    {
      const effort = (existingAgent as any)?.reasoning?.effort
      if (typeof effort === 'string' && (effort === 'low' || effort === 'medium' || effort === 'high')) {
        agentBuilderRef.current.updateField('reasoning', effort)
      } else {
        agentBuilderRef.current.updateField('reasoning', 'none' as any)
      }
    }
    if (existingAgent.systemPrompt) agentBuilderRef.current.updateField('systemPrompt', existingAgent.systemPrompt)
    if (existingAgent.temperature !== undefined) agentBuilderRef.current.updateField('temperature', existingAgent.temperature as any)
    if (existingAgent.maxTokens !== undefined) agentBuilderRef.current.updateField('maxTokens', existingAgent.maxTokens as any)
    if (existingAgent.timeout !== undefined) agentBuilderRef.current.updateField('timeout', existingAgent.timeout as any)
    if (Array.isArray((existingAgent as any).assignedToolSlugs)) agentBuilderRef.current.updateField('assignedToolSlugs', (existingAgent as any).assignedToolSlugs as any)
    if ((!Array.isArray(currentForm?.previewPrompts) || (currentForm.previewPrompts || []).length === 0) && Array.isArray(existingAgent.previewPrompts)) {
      const prompts = (existingAgent.previewPrompts as unknown[])
        .filter(p => typeof p === 'string')
        .map(p => (p as string).trim())
        .filter(Boolean)
        .slice(0, 10) as string[]
      agentBuilderRef.current.updateField('previewPrompts', prompts as any)
    }
    if (existingAgent.blueprint) agentBuilderRef.current.updateField('blueprint', JSON.stringify(existingAgent.blueprint, null, 2))
    if ((existingAgent as any).icon) agentBuilderRef.current.updateField('icon', (existingAgent as any).icon)
    // Load state (including plugins for web browsing) - CRITICAL: must preserve state
    if (existingAgent.state && typeof existingAgent.state === 'object') {
      console.log('[AgentBuilder] Prefill loading state:', {
        state: existingAgent.state,
        hasPlugins: 'plugins' in existingAgent.state,
        plugins: (existingAgent.state as { plugins?: unknown })?.plugins,
      })
      agentBuilderRef.current.updateField('state', existingAgent.state as any)
    }
    if (existingAgent.id) lastPrefilledAgentIdRef.current = existingAgent.id
  }, [existingAgent])

  const handleCancel = () => {
    if (conversationId) {
      const channels = channelsData?.channels ?? []
      const match = channels.find((ch: any) => String(ch?.conversationId || '') === String(conversationId)) ?? null
      const channelSlug = match?.slug ? String(match.slug) : ''
      if (channelSlug) {
        router.push(`/ship/${slug}/channels/${encodeURIComponent(channelSlug)}`)
        return
      }
      router.push(`/ship/${slug}/conversations/${encodeURIComponent(conversationId)}`)
    } else {
      router.push(`/ship/${slug}`)
    }
  }

  // Header should reflect the agent implied by the current route (agentSlug), NOT the "leading mention" agent.
  // Otherwise, navigating to /agent/new or an unknown slug can incorrectly retain the previous agent's identity.
  const routeAgentFromList = useMemo(() => {
    if (!agentSlug || agentSlug === 'new') return null
    const match = (agents || []).find(a => String((a as any)?.slug || '') === String(agentSlug))
    return match || null
  }, [agents, agentSlug])

  const headerAgentModel = existingAgent || routeAgentFromList || null
  const headerAgentName = agentSlug === 'new' ? 'New agent' : headerAgentModel?.name || String(agentSlug)

  // Display convention across the app: "Name: Role"
  const headerAgentRole = headerAgentModel?.role
  const headerAgentDisplayName = headerAgentName && headerAgentRole ? `${headerAgentName}: ${headerAgentRole}` : headerAgentName

  const headerAgentSubtitle = headerAgentModel?.slug || (agentSlug !== 'new' ? String(agentSlug) : undefined)
  const headerAvatarAttachmentId = (headerAgentModel as any)?.avatarAttachmentId as string | undefined
  const headerAvatarIds = useMemo(() => (headerAvatarAttachmentId ? [headerAvatarAttachmentId] : []), [headerAvatarAttachmentId])
  const { data: headerAvatarAttachments = [] } = useMessageAttachments(headerAvatarIds, starship?.id)
  const headerAvatarUrl = headerAvatarAttachments?.[0]?.previewUrl

  if (!starship?.id) return null

  const canRegenerateAvatar = !!existingAgent?.id

  const handleRegenerateAvatar = async (mode: 'avatar_only' | 'full_chain' | 'migrate_2d_to_3d') => {
    if (!existingAgent?.id) return
    try {
      setIsRegeneratingAvatar(true)
      setAvatarRegenMode(mode)
      await api.post(`/api/v1/agents/${existingAgent.id}/avatar/generate`, { mode, avatarMode: avatarStyleMode })
      const suffix = avatarStyleMode === '2d' ? ' (2D)' : ' (3D)'
      toast.success(
        (mode === 'migrate_2d_to_3d'
          ? 'Avatar migrated to 3D'
          : mode === 'full_chain'
            ? 'Avatar reset & regenerated'
            : headerAvatarUrl
              ? 'Avatar regenerated'
              : 'Avatar generated') + suffix
      )
      // Refresh agent + attachments
      await queryClient.invalidateQueries({ queryKey: AGENT_QUERY_KEYS.byStarship(starship.id) })
      await queryClient.invalidateQueries({ queryKey: AGENT_QUERY_KEYS.detail(existingAgent.id), exact: true })
    } catch (err: any) {
      const message = err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Failed to regenerate avatar'
      toast.error('Avatar regeneration failed', { description: message })
    } finally {
      setIsRegeneratingAvatar(false)
      setAvatarRegenMode(null)
    }
  }

  const handleUploadAvatar = async (file: File) => {
    if (!existingAgent?.id || !starship?.id) return
    try {
      setIsUploadingAvatar(true)

      if (!file.type.startsWith('image/')) {
        toast.error('Invalid file type', { description: 'Please upload an image (PNG, JPG, WebP, GIF).' })
        return
      }

      const initResponse = await api.post(`/api/v1/agents/${existingAgent.id}/avatar/upload/init`, {
        filename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      })
      const upload = (initResponse as any)?.data?.data?.upload as { uploadUrl: string; s3Key: string } | undefined
      if (!upload?.uploadUrl || !upload?.s3Key) {
        toast.error('Avatar upload failed', { description: 'Failed to initialize upload' })
        return
      }

      const putResp = await fetch(upload.uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type,
        },
        body: file,
      })
      if (!putResp.ok) {
        toast.error('Avatar upload failed', { description: 'Failed to upload to storage' })
        return
      }

      await api.post(`/api/v1/agents/${existingAgent.id}/avatar/upload/complete`, {
        s3Key: upload.s3Key,
        filename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      })

      toast.success('Avatar uploaded')
      await queryClient.invalidateQueries({ queryKey: AGENT_QUERY_KEYS.byStarship(starship.id) })
      await queryClient.invalidateQueries({ queryKey: AGENT_QUERY_KEYS.detail(existingAgent.id), exact: true })
    } catch (err: any) {
      const message = err?.response?.data?.error || err?.message || 'Upload failed'
      toast.error('Avatar upload failed', { description: message })
    } finally {
      setIsUploadingAvatar(false)
      // Reset the file input so the same file can be selected again
      if (avatarFileInputRef.current) avatarFileInputRef.current.value = ''
    }
  }

  const handleDownloadAvatar = async () => {
    if (!headerAvatarAttachmentId || !starship?.id) return
    try {
      setIsDownloadingAvatar(true)
      const token = await getCurrentToken()
      if (!token) {
        toast.error('Not authenticated', { description: 'Please sign in again and retry.' })
        return
      }

      const previewUrl = `/api/v1/attachments/${encodeURIComponent(headerAvatarAttachmentId)}/preview?starshipId=${encodeURIComponent(starship.id)}`
      const response = await fetch(previewUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        const message = errorData?.error?.message || errorData?.error || 'Download failed'
        toast.error('Avatar download failed', { description: message })
        return
      }

      const blob = await response.blob()
      const contentType = response.headers.get('content-type') || blob.type
      const ext =
        contentType.includes('image/webp') ? 'webp' : contentType.includes('image/png') ? 'png' : contentType.includes('image/jpeg') ? 'jpg' : 'img'

      const agentSlugOrId = String((headerAgentModel as any)?.slug || headerAgentModel?.id || 'agent')
      const filename = `agent-${agentSlugOrId}-avatar.${ext}`

      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(objectUrl)
    } catch (err: any) {
      const message = err?.message || 'Download failed'
      toast.error('Avatar download failed', { description: message })
    } finally {
      setIsDownloadingAvatar(false)
    }
  }

  return (
    <div className="bg-background min-h-screen">
      <div className="flex flex-col items-center px-6 py-6">
        <div className="w-full max-w-6xl mx-auto space-y-0">
          {/* Page header - mirrors ship agents/tools overview pages */}
          <div id="agent-page-header" className="text-center mt-10">
            <div className="flex flex-col items-center justify-center gap-2 mb-2">
              <button
                type="button"
                className="group rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
                onClick={() => {
                  setIsAvatarModalOpen(true)
                }}
                disabled={!headerAvatarUrl && !headerAgentName}
                aria-label="Open agent avatar preview"
              >
                <AgentAvatar
                  seed={headerAgentName}
                  imageUrl={headerAvatarUrl}
                  size={112}
                  rounded
                  className="h-28 w-28 rounded-2xl overflow-hidden shadow-lg bg-background/80 transition-transform group-hover:scale-[1.02]"
                />
              </button>
              <div className="flex flex-col items-center">
                <h1 className="text-3xl sm:text-4xl font-semibold truncate max-w-xs sm:max-w-xl">{headerAgentDisplayName}</h1>
              </div>
            </div>
          </div>

          {/* Avatar Preview / Regenerate Modal */}
          <Dialog open={isAvatarModalOpen} onOpenChange={setIsAvatarModalOpen}>
            <DialogContent className="sm:max-w-xl rounded-lg">
              <DialogHeader>
                <DialogTitle>Agent Avatar</DialogTitle>
                <DialogDescription>{canRegenerateAvatar ? 'Preview the avatar and regenerate it if you want a new look.' : 'Preview the avatar.'}</DialogDescription>
              </DialogHeader>

              <div className="flex items-center justify-center py-2">
                <div className="relative rounded-2xl overflow-hidden bg-background/80 shadow-lg ring-1 ring-border/70">
                  <AgentAvatar seed={headerAgentName} imageUrl={headerAvatarUrl} size={384} rounded={false} className="h-96 w-96 rounded-2xl" />
                  <input
                    ref={avatarFileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (file) void handleUploadAvatar(file)
                    }}
                    disabled={!canRegenerateAvatar || isRegeneratingAvatar || isUploadingAvatar}
                  />
                  <div className="absolute top-3 right-3 z-10 flex flex-col gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      onClick={() => avatarFileInputRef.current?.click()}
                      disabled={!canRegenerateAvatar || isRegeneratingAvatar || isUploadingAvatar}
                      aria-label="Upload avatar"
                      title="Upload avatar"
                      className="h-9 w-9 bg-background/75 hover:bg-background/90 backdrop-blur border border-border/60 shadow-sm"
                    >
                      {isUploadingAvatar ? <Icon name="loading" className="h-4 w-4" /> : <Icon name="upload" className="h-4 w-4" />}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      onClick={() => void handleDownloadAvatar()}
                      disabled={!headerAvatarAttachmentId || isRegeneratingAvatar || isDownloadingAvatar}
                      aria-label="Download avatar"
                      title="Download avatar"
                      className="h-9 w-9 bg-background/75 hover:bg-background/90 backdrop-blur border border-border/60 shadow-sm"
                    >
                      {isDownloadingAvatar ? <Icon name="loading" className="h-4 w-4" /> : <Icon name="download" className="h-4 w-4" />}
                    </Button>
                  </div>
                  {isRegeneratingAvatar && (
                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-background/60 backdrop-blur-[1px]">
                      <LoadingSpinner size={28} className="text-foreground" label="Regenerating avatar" />
                      <div className="mt-2 text-xs font-medium text-foreground/80">
                        {avatarRegenMode === 'migrate_2d_to_3d'
                          ? 'Migrating to 3D…'
                          : avatarRegenMode === 'full_chain'
                            ? 'Resetting & generating…'
                            : headerAvatarUrl
                              ? 'Regenerating…'
                              : 'Generating…'}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {canRegenerateAvatar && (
                <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-card/40 px-4 py-3">
                  <div className="flex flex-col">
                    <div className="text-sm font-medium">Avatar style</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={avatarStyleMode === '2d' ? 'text-sm font-semibold text-foreground' : 'text-sm text-muted-foreground'}>
                      2D
                    </span>
                    <Switch
                      size="sm"
                      checked={avatarStyleMode === '3d'}
                      onCheckedChange={checked => setAvatarStyleMode(checked ? '3d' : '2d')}
                      disabled={isRegeneratingAvatar}
                      aria-label="Toggle avatar style between 2D and 3D"
                    />
                    <span className={avatarStyleMode === '3d' ? 'text-sm font-semibold text-foreground' : 'text-sm text-muted-foreground'}>
                      3D
                    </span>
                  </div>
                </div>
              )}

              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={() => setIsAvatarModalOpen(false)} disabled={isRegeneratingAvatar}>
                  Close
                </Button>
                {avatarStyleMode === '3d' && (
                  <Button
                    variant="secondary"
                    onClick={() => void handleRegenerateAvatar('migrate_2d_to_3d')}
                    disabled={!canRegenerateAvatar || isRegeneratingAvatar || !headerAvatarAttachmentId}
                  >
                    {isRegeneratingAvatar && avatarRegenMode === 'migrate_2d_to_3d' ? 'Migrating…' : 'Migrate 2D → 3D'}
                  </Button>
                )}
                {isInstanceAdmin && (
                  <Button variant="outline" onClick={() => void handleRegenerateAvatar('full_chain')} disabled={!canRegenerateAvatar || isRegeneratingAvatar}>
                    {isRegeneratingAvatar && avatarRegenMode === 'full_chain' ? 'Resetting…' : 'Reset & Generate'}
                  </Button>
                )}
                <Button onClick={() => void handleRegenerateAvatar('avatar_only')} disabled={!canRegenerateAvatar || isRegeneratingAvatar}>
                  {isRegeneratingAvatar && avatarRegenMode === 'avatar_only' ? (headerAvatarUrl ? 'Regenerating…' : 'Generating…') : headerAvatarUrl ? 'Regenerate' : 'Generate'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <div className="relative w-full rounded-2xl bg-background/80 shadow-sm min-h-[600px] mb-16">
            <div className="relative h-full w-full">
              {isResolvingExistingAgentId ? (
                <div className="flex items-center justify-center min-h-[600px]">
                  <LoadingSpinner size="lg" />
                </div>
              ) : isExistingAgentError || isMissingExistingAgent ? (
                <div className="flex flex-col items-center justify-center text-center min-h-[600px] px-6">
                  <div className="text-lg font-semibold">Agent not found</div>
                  <div className="text-sm text-muted-foreground mt-2">This agent slug doesn’t exist in this starship.</div>
                  <div className="mt-4">
                    <Button variant="outline" onClick={handleCancel}>
                      Back
                    </Button>
                  </div>
                </div>
              ) : (
                <AgentBuilderView
                  ref={agentBuilderRef}
                  starshipId={starship.id}
                  agentId={effectiveAgentId || undefined}
                  agent={existingAgent || null}
                  onCancel={handleCancel}
                  initialSlug={agentSlug !== 'new' ? String(agentSlug) : undefined}
                />
              )}

              {conversationId && (
                <div className="absolute left-0 right-0 bottom-[22px] px-6 z-30 pointer-events-none">
                  <div className="max-w-2xl mx-auto pointer-events-auto">
                    <ConversationMessageInput
                      ref={messageInputRef}
                      selectedAgent={selectedAgent}
                      starshipId={starship.id}
                      conversationId={conversationId}
                      isToolFormOpen={true}
                      minimal={true}
                      showExpandableOverlay={true}
                      isOverlayExpanded={isOverlayExpanded}
                      onFocus={() => {
                        if (!isResponding) setIsOverlayExpanded(true)
                      }}
                      onBlur={() => setIsOverlayExpanded(false)}
                      onToggleOverlay={() => setIsOverlayExpanded(prev => !prev)}
                      starshipSlug={slug}
                    >
                      <AgentSelector selectedAgent={selectedAgent} onAgentChange={() => {}} starshipId={starship.id} compact={true} />
                    </ConversationMessageInput>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}
