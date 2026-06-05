'use client'

import Icon from '@/components/primitives/Icon'
import AgentAvatar from '@/components/animated/AgentAvatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { PresenceIndicator } from '@/components/ui/PresenceIndicator'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { HoverProfilePopover } from '@/components/conversation/HoverProfilePopover'
import { AgentProfileHoverCardContent, UserProfileHoverCardContent } from '@/components/conversation/ProfileHoverCardContent'
import { WizardStepper } from '@/components/marketplace/WizardStepper'
import { useMessageAttachments } from '@/hooks/useFileUpload'
import type { StarshipInviteListItem, StarshipMemberListItem, StarshipMembersAndInvitesPage } from '@/hooks/useStarshipMembers'
import { STARSHIP_MEMBERS_QUERY_KEYS, useInfiniteStarshipMembers, useRemoveStarshipMember, useRevokeStarshipInvite } from '@/hooks/useStarshipMembers'
import { useCreateStarshipInvite } from '@/hooks/useStarshipInvites'
import { AGENT_QUERY_KEYS, useInfiniteStarshipAgents } from '@/hooks/useAgents'
import { useDeleteAgent, useDeleteAgentWithUnusedTools } from '@/hooks/useAgents'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { useStarshipPresence } from '@/hooks/useStarshipPresence'
import { useAuth } from '@/hooks/useAuth'
import type { AgentModel } from '@starships/protocol'
import { useQueryClient } from '@tanstack/react-query'
import { formatAgentDisplayName } from '@/lib/agentDisplay'
import { isImageUrl } from '@/lib/isImageUrl'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { MobileNavToggleButton } from '@/components/navigation/MobileNavToggleButton'
import { MobileBottomFilterBar } from '@/components/layout/MobileBottomFilterBar'
import { toast } from 'sonner'
import { getSafeErrorMessage } from '@/lib/error-utils'
import { getCurrentToken } from '@/lib/api'

type Filter = 'all' | 'humans' | 'agents'

type AgentWithAvatar = AgentModel & { avatarAttachmentId?: string | null }

const SKELETON_CARD_COUNT = 2
type ImportWizardStep = 1 | 2 | 3
type ImportWizardStepMeta = { id: ImportWizardStep; label: string; subtitle: string }
const IMPORT_WIZARD_STEPS: ImportWizardStepMeta[] = [
  { id: 1, label: 'Choose file', subtitle: 'Select a bundle (.zip)' },
  { id: 2, label: 'Analyze', subtitle: 'Review changes & resolve conflicts' },
  { id: 3, label: 'Upload', subtitle: 'Confirm & upload' },
]

function safeFilenameSegment(input: string): string {
  const raw = String(input || '').trim()
  const sanitized = raw.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '')
  return sanitized.length > 0 ? sanitized : 'export'
}

function initialsFromName(name?: string | null): string {
  if (!name || typeof name !== 'string') return 'U'
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2)
  if (parts.length === 0) return 'U'
  return (
    parts
      .map(p => p[0]?.toUpperCase())
      .filter(Boolean)
      .join('') || 'U'
  )
}

function formatMemberRoleLabel(role?: string | null): string {
  const r = typeof role === 'string' ? role.trim().toLowerCase() : ''
  if (!r) return ''
  if (r === 'owner') return 'Owner'
  if (r === 'admin') return 'Admin'
  if (r === 'collaborator') return 'Collaborator'
  return r.replace(/\b\w/g, c => c.toUpperCase())
}

function getUserLabel(m: StarshipMemberListItem): { primary: string; secondary?: string } {
  const displayName = typeof m.displayName === 'string' ? m.displayName.trim() : ''
  const email = typeof m.email === 'string' ? m.email.trim() : ''
  const primary = displayName || email || 'Unknown member'
  const role = typeof m.role === 'string' ? m.role.trim() : ''
  const secondaryParts = [role ? role[0]?.toUpperCase() + role.slice(1) : null, displayName && email ? email : null].filter(Boolean) as string[]
  return { primary, secondary: secondaryParts.length ? secondaryParts.join(' · ') : undefined }
}

function getAgentLabel(a: AgentWithAvatar): { primary: string; secondary?: string } {
  const primary = formatAgentDisplayName(a)
  return { primary }
}


function getCategoryMeta(category?: string): { label: string; className: string } | null {
  const raw = typeof category === 'string' ? category.trim().toLowerCase() : ''
  if (!raw) return null

  if (raw === 'coding') return { label: 'Coding', className: 'text-muted-foreground' }
  if (raw === 'creative') return { label: 'Creative', className: 'text-muted-foreground' }
  if (raw === 'analysis') return { label: 'Analysis', className: 'text-muted-foreground' }
  if (raw === 'support') return { label: 'Support', className: 'text-muted-foreground' }
  if (raw === 'general') return { label: 'General', className: 'text-muted-foreground' }

  // Fallback for other categories (utility, data, communication, automation, etc.)
  const label = raw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  return { label, className: 'text-muted-foreground' }
}

export default function MembersPage() {
  const { slug: slugParam } = useParams<{ slug: string }>()
  const slug = typeof slugParam === 'string' ? slugParam : ''
  const { user, isInstanceAdmin } = useAuth()
  const queryClient = useQueryClient()
  const { data: starship } = useStarshipBySlug(slug, Boolean(slug))
  const starshipId = starship?.id ?? null
  const starshipIdStr = starshipId ? String(starshipId) : null

  const [filter, setFilter] = useState<Filter>('all')
  const [searchText, setSearchText] = useState<string>('')
  const [debouncedSearch, setDebouncedSearch] = useState<string>('')

  const SEARCH_DEBOUNCE_MS = 400
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null)
  const [exportingAgentId, setExportingAgentId] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [importStep, setImportStep] = useState<ImportWizardStep>(1)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importAnalysis, setImportAnalysis] = useState<{
    tools: Array<{
      kind: 'tool'
      file: string
      name: string
      bundleHash: string
      status: 'new' | 'same' | 'conflict'
      existing?: { id: string; name: string; slug: string; contentHash?: string }
    }>
    agents: Array<{
      kind: 'agent'
      file: string
      name: string
      bundleHash: string
      status: 'new' | 'same' | 'conflict'
      existing?: { id: string; name: string; slug: string; contentHash?: string }
    }>
  } | null>(null)
  const [importDecisions, setImportDecisions] = useState<{
    tools: Record<string, { action: 'skip' | 'copy' | 'overwrite'; targetId?: string }>
    agents: Record<string, { action: 'skip' | 'copy' | 'overwrite'; targetId?: string }>
  }>({ tools: {}, agents: {} })
  const [isAnalyzingImport, setIsAnalyzingImport] = useState(false)
  const [isApplyingImport, setIsApplyingImport] = useState(false)

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedSearch(searchText.trim()), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(handle)
  }, [SEARCH_DEBOUNCE_MS, searchText])

  useEffect(() => {
    if (!inviteOpen) return
    setInviteEmail('')
    setLastInviteUrl(null)
  }, [inviteOpen])

  useEffect(() => {
    if (!importOpen) return
    setImportStep(1)
    setImportFile(null)
    setImportAnalysis(null)
    setImportDecisions({ tools: {}, agents: {} })
    setIsAnalyzingImport(false)
    setIsApplyingImport(false)
  }, [importOpen])

  const importHasExistingTools = Boolean(importAnalysis?.tools.some(t => t.status !== 'new'))
  const importHasExistingAgents = Boolean(importAnalysis?.agents.some(a => a.status !== 'new'))
  const importHasExisting = importHasExistingTools || importHasExistingAgents

  const importToolDecisionCounts = useMemo(() => {
    const counts = { skip: 0, copy: 0, overwrite: 0 }
    const tools = importAnalysis?.tools ?? []
    for (const t of tools) {
      const key = String((t as any)?.bundleHash ?? '')
      const chosen = importDecisions.tools[key]?.action
      const fallback: 'skip' | 'copy' | 'overwrite' = t.status === 'same' ? 'skip' : 'copy'
      const action = (chosen ?? fallback) as 'skip' | 'copy' | 'overwrite'
      counts[action]++
    }
    return counts
  }, [importAnalysis, importDecisions.tools])

  const importAgentDecisionCounts = useMemo(() => {
    const counts = { skip: 0, copy: 0, overwrite: 0 }
    const agents = importAnalysis?.agents ?? []
    for (const a of agents) {
      const key = String((a as any)?.bundleHash ?? '')
      const chosen = importDecisions.agents[key]?.action
      const fallback: 'skip' | 'copy' | 'overwrite' = a.status === 'same' ? 'skip' : 'copy'
      const action = (chosen ?? fallback) as 'skip' | 'copy' | 'overwrite'
      counts[action]++
    }
    return counts
  }, [importAnalysis, importDecisions.agents])

  const canGoNextImport = useMemo(() => {
    if (importStep === 1) return !!importFile && !!starshipIdStr
    if (importStep === 2) return !!importAnalysis && !isAnalyzingImport
    return false
  }, [importStep, importFile, starshipIdStr, importAnalysis, isAnalyzingImport])

  const handleImportBack = () => {
    if (isAnalyzingImport || isApplyingImport) return
    if (importStep === 1) {
      setImportOpen(false)
      return
    }
    if (importStep === 2) {
      setImportStep(1)
      setImportAnalysis(null)
      setImportDecisions({ tools: {}, agents: {} })
      return
    }
    setImportStep(2)
  }

  const handleImportNext = async () => {
    if (isAnalyzingImport || isApplyingImport) return
    if (importStep === 1) {
      if (!importFile || !starshipIdStr) return
      setImportStep(2)
      const ok = await analyzeImportBundle()
      if (!ok) setImportStep(1)
      return
    }
    if (importStep === 2) {
      if (!importAnalysis) return
      setImportStep(3)
      return
    }
    await applyImportBundle()
  }

  const analyzeImportBundle = async (): Promise<boolean> => {
    if (!importFile || !starshipIdStr) return false
    setIsAnalyzingImport(true)
    try {
      const token = await getCurrentToken()
      const fd = new FormData()
      fd.append('file', importFile)
      const res = await fetch(`/api/v1/starships/${encodeURIComponent(starshipIdStr)}/import-bundle/analyze`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: fd,
      })
      if (!res.ok) throw new Error(`Analyze failed (${res.status})`)
      const json = await res.json()
      const data = json?.data ?? json
      setImportAnalysis(data)

      const nextDecisions = {
        tools: {} as Record<string, { action: 'skip' | 'copy' | 'overwrite'; targetId?: string }>,
        agents: {} as Record<string, { action: 'skip' | 'copy' | 'overwrite'; targetId?: string }>,
      }
      for (const t of (data?.tools ?? []) as any[]) {
        const status = t?.status
        const action: 'skip' | 'copy' | 'overwrite' = status === 'same' ? 'skip' : 'copy'
        nextDecisions.tools[String(t.bundleHash)] = { action, targetId: t?.existing?.id }
      }
      for (const a of (data?.agents ?? []) as any[]) {
        const status = a?.status
        const action: 'skip' | 'copy' | 'overwrite' = status === 'same' ? 'skip' : 'copy'
        nextDecisions.agents[String(a.bundleHash)] = { action, targetId: a?.existing?.id }
      }
      setImportDecisions(nextDecisions)
      return true
    } catch (error) {
      toast.error('Analyze failed', { description: getSafeErrorMessage(error) })
      return false
    } finally {
      setIsAnalyzingImport(false)
    }
  }

  const applyImportBundle = async (): Promise<boolean> => {
    if (!importFile || !starshipIdStr || !importAnalysis) return false
    setIsApplyingImport(true)
    try {
      const token = await getCurrentToken()
      const fd = new FormData()
      fd.append('file', importFile)
      fd.append('decisions', JSON.stringify(importDecisions))
      const res = await fetch(`/api/v1/starships/${encodeURIComponent(starshipIdStr)}/import-bundle/apply`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: fd,
      })
      if (!res.ok) throw new Error(`Import failed (${res.status})`)
      const json = await res.json()
      const data = json?.data ?? json
      const importedTools = Number(data?.imported?.tools ?? 0)
      const importedAgents = Number(data?.imported?.agents ?? 0)
      const warnings = Array.isArray(data?.warnings) ? (data.warnings as unknown[]).length : 0

      queryClient.invalidateQueries({ queryKey: AGENT_QUERY_KEYS.all })
      toast.success('Import complete', {
        description: `${importedAgents} agent(s), ${importedTools} tool(s) imported${warnings ? ` · ${warnings} warning(s)` : ''}.`,
      })
      setImportOpen(false)
      return true
    } catch (error) {
      toast.error('Import failed', { description: getSafeErrorMessage(error) })
      return false
    } finally {
      setIsApplyingImport(false)
    }
  }

  const humansQuery = useInfiniteStarshipMembers(String(starshipId || ''), Boolean(starshipId), { limit: 50, search: debouncedSearch })
  const agentsQuery = useInfiniteStarshipAgents(String(starshipId || ''), Boolean(starshipId), { limit: 50, order: 'ASC', search: debouncedSearch })

  const humans = useMemo(() => {
    const pages: StarshipMembersAndInvitesPage[] = humansQuery.data?.pages ?? []
    return pages.flatMap(p => p.members)
  }, [humansQuery.data])

  const invites = useMemo(() => {
    const pages: StarshipMembersAndInvitesPage[] = humansQuery.data?.pages ?? []
    return pages.flatMap(p => p.invites)
  }, [humansQuery.data])

  const agents = useMemo(() => {
    const pages = agentsQuery.data?.pages ?? []
    return pages.flatMap(p => p.agents) as AgentWithAvatar[]
  }, [agentsQuery.data])

  const filteredHumans = useMemo(() => {
    if (filter === 'agents') return []
    return humans
  }, [humans, filter])

  const filteredInvites = useMemo(() => {
    if (filter === 'agents') return []
    return invites
  }, [invites, filter])

  const filteredAgents = useMemo(() => {
    if (filter === 'humans') return []
    return agents
  }, [agents, filter])

  const presence = useStarshipPresence(starshipIdStr ?? '', Boolean(starshipIdStr))
  const removeMember = useRemoveStarshipMember(starshipIdStr ?? '')
  const revokeInvite = useRevokeStarshipInvite(starshipIdStr ?? '')
  const createInvite = useCreateStarshipInvite(starshipIdStr ?? '')
  const deleteAgent = useDeleteAgent()
  const deleteAgentWithUnusedTools = useDeleteAgentWithUnusedTools()

  const [confirmAction, setConfirmAction] = useState<
    | { kind: 'kickHuman'; userId: string; label: string }
    | { kind: 'revokeInvite'; email: string; label: string }
    | { kind: 'deleteAgent'; agentId: string; label: string }
    | null
  >(null)

  const visibleAgentAvatarAttachmentIds = useMemo(() => {
    if (!starshipIdStr) return []
    if (filter === 'humans') return []
    const ids = new Set<string>()
    for (const a of filteredAgents) {
      const id = typeof a.avatarAttachmentId === 'string' ? a.avatarAttachmentId.trim() : ''
      if (id) ids.add(id)
    }
    return Array.from(ids)
  }, [filteredAgents, filter, starshipIdStr])

  const { data: agentAvatarAttachments = [] } = useMessageAttachments(visibleAgentAvatarAttachmentIds, starshipIdStr ?? undefined)

  const agentAvatarUrlByAttachmentId = useMemo(() => {
    const map = new Map<string, string>()
    for (const att of agentAvatarAttachments) {
      const id = typeof att?.id === 'string' ? att.id.trim() : ''
      const url = typeof att?.previewUrl === 'string' ? att.previewUrl.trim() : ''
      if (id && url) map.set(id, url)
    }
    return map
  }, [agentAvatarAttachments])

  const renderHumanRow = (m: StarshipMemberListItem) => {
    const label = getUserLabel(m)
    const userId = typeof m.userId === 'string' ? m.userId.trim() : ''
    const isOnline = presence.isUserOnline(userId)
    const avatarUrlRaw = typeof m.avatar === 'string' ? m.avatar.trim() : ''
    const avatarUrl = isImageUrl(avatarUrlRaw) ? avatarUrlRaw : null
    const presenceText = isOnline ? 'Online' : 'Offline'
    const isAuthedUser = Boolean(user?.id && userId && String(user.id) === String(userId))
    const displayName = typeof m.displayName === 'string' ? m.displayName.trim() : ''
    const email = typeof m.email === 'string' ? m.email.trim() : ''
    const userHoverTitle = isAuthedUser ? 'You' : label.primary
    const userHoverSub = isAuthedUser ? displayName || email || '' : email && email !== label.primary ? email : ''
    const userHoverCard = (
      <UserProfileHoverCardContent
        title={userHoverTitle}
        subtitle={userHoverSub || undefined}
        isAuthedUser={isAuthedUser}
        explicitAvatarUrl={avatarUrl || undefined}
        resolvedAvatarUrl={undefined}
        avatarSeed={label.primary || undefined}
        fallbackInitials={initialsFromName(userHoverTitle || email || displayName || label.primary)}
        fallbackVariant="initials"
        userIdShort={userId ? `#${userId.slice(0, 6)}` : undefined}
        email={email || undefined}
        roleLabel={formatMemberRoleLabel(m.role) || undefined}
        memberSince={m.createdAt || undefined}
        statusLabel={presenceText}
      />
    )
    const chatHref = !isAuthedUser && slug ? `/ship/${encodeURIComponent(slug)}/rooms/lobby` : null
    const canKick = Boolean(!isAuthedUser && m.role !== 'owner' && userId)
    return (
      <div key={userId || `${label.primary}-${label.secondary || ''}`} className={cn('rounded-lg border border-border/60 bg-card px-4 py-3 flex items-start justify-between gap-3')}>
        <div className={cn('min-w-0 flex-1')} aria-label={label.primary}>
          <div className="flex items-start gap-3">
            <div className="relative mt-0.5 h-10 w-10 flex-shrink-0">
              <span className={cn('flex h-10 w-10 items-center justify-center rounded-full ring-1 ring-border/50 bg-muted/10 overflow-hidden')}>
                <AgentAvatar seed={label.primary} imageUrl={avatarUrl} fill instanceId={userId ? `member-u-${userId}` : `member-u-${label.primary}`} rounded />
              </span>
              <PresenceIndicator
                kind={isOnline ? 'online' : 'offline'}
                active={true}
                size="sm"
                placement="outset"
                // Slightly more down/right for 40px avatar.
                className="translate-x-[22%] translate-y-[6%]"
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <HoverProfilePopover
                  trigger={
                    <button type="button" className={cn('block max-w-full truncate text-left text-sm font-medium text-foreground hover:underline underline-offset-2')}>
                      {label.primary}
                    </button>
                  }
                  content={userHoverCard}
                  side="right"
                />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className={cn('truncate', isOnline ? 'text-emerald-600 dark:text-emerald-400' : undefined)}>{presenceText}</span>
                {label.secondary ? <span aria-hidden="true">·</span> : null}
                {label.secondary ? <span className="truncate">{label.secondary}</span> : null}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 self-center">
          {chatHref ? (
            <Button asChild size="sm" variant="ghost" className="h-8 text-muted-foreground hover:bg-accent/80 hover:text-foreground">
              <Link href={chatHref} className="inline-flex items-center gap-1.5">
                <Icon name="message-square" className="h-4 w-4" />
                Chat
              </Link>
            </Button>
          ) : null}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:bg-accent/80 hover:text-foreground" aria-label="More options">
                <Icon name="dots-vertical" className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {canKick ? (
                <DropdownMenuItem
                  onClick={() => setConfirmAction({ kind: 'kickHuman', userId, label: label.primary })}
                  className="flex items-center gap-2 cursor-pointer hover:bg-destructive/10 focus:bg-destructive/10 text-destructive focus:text-destructive"
                >
                  <Icon name="x-circle" className="h-4 w-4" />
                  Kick
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem disabled className="text-muted-foreground">
                  No actions
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    )
  }

  const renderInviteRow = (inv: StarshipInviteListItem) => {
    const emailRaw = typeof inv.invitedEmail === 'string' ? inv.invitedEmail.trim() : ''
    const roleRaw = typeof inv.role === 'string' ? inv.role.trim() : ''
    const roleLabel = roleRaw ? roleRaw[0]?.toUpperCase() + roleRaw.slice(1) : ''
    const key = emailRaw ? `invite-${emailRaw}` : `invite-${inv.createdAt}`
    const primary = emailRaw || 'Invited member'
    const canRevoke = Boolean(canInviteUsers && emailRaw)
    return (
      <div key={key} className={cn('rounded-lg border border-border/60 bg-card px-4 py-3 flex items-start justify-between gap-3')}>
        <div className={cn('min-w-0 flex-1 outline-none rounded-md')} aria-label={primary}>
          <div className="flex items-start gap-3">
            <div className="relative mt-0.5 h-10 w-10 flex-shrink-0">
              <span className={cn('flex h-10 w-10 items-center justify-center rounded-full ring-1 ring-border/50 bg-muted/10 overflow-hidden')}>
                <AgentAvatar seed={primary} imageUrl={null} fill instanceId={key} rounded />
              </span>
              <PresenceIndicator kind="offline" active={true} size="sm" placement="outset" className="translate-x-[22%] translate-y-[6%]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={cn('text-sm font-medium truncate text-foreground')}>{primary}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className="truncate">Invited</span>
                {roleLabel ? <span aria-hidden="true">·</span> : null}
                {roleLabel ? <span className="truncate">{roleLabel}</span> : null}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 self-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:bg-accent/80 hover:text-foreground" aria-label="More options">
                <Icon name="dots-vertical" className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {canRevoke ? (
                <DropdownMenuItem
                  onClick={() => setConfirmAction({ kind: 'revokeInvite', email: emailRaw, label: primary })}
                  className="flex items-center gap-2 cursor-pointer hover:bg-destructive/10 focus:bg-destructive/10 text-destructive focus:text-destructive"
                >
                  <Icon name="x-circle" className="h-4 w-4" />
                  Revoke
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem disabled className="text-muted-foreground">
                  No actions
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    )
  }

  const renderAgentRow = (a: AgentWithAvatar) => {
    const label = getAgentLabel(a)
    const categoryMeta = getCategoryMeta((a as any).category)
    const agentSlug = typeof a.slug === 'string' ? a.slug.trim() : ''
    const key = a.id || agentSlug || label.primary
    const avatarAttachmentId = typeof a.avatarAttachmentId === 'string' ? a.avatarAttachmentId.trim() : ''
    const avatarUrl = avatarAttachmentId ? (agentAvatarUrlByAttachmentId.get(avatarAttachmentId) ?? null) : null
    const modelIdRaw = (a as any)?.model
    const modelId = typeof modelIdRaw === 'string' ? modelIdRaw : undefined
    const agentHoverCard = (
      <AgentProfileHoverCardContent
        name={label.primary || 'Assistant'}
        avatarUrl={avatarUrl || undefined}
        modelId={modelId}
        statusLabel="Available"
        roleLabel={typeof (a as any).role === 'string' ? (a as any).role : undefined}
        category={categoryMeta?.label || (typeof (a as any).category === 'string' ? (a as any).category : undefined)}
        version={typeof (a as any).version === 'string' ? (a as any).version : undefined}
        createdAt={typeof a.createdAt === 'string' ? a.createdAt : undefined}
        updatedAt={typeof a.updatedAt === 'string' ? a.updatedAt : undefined}
      />
    )
    const detailsHref = slug && agentSlug ? `/ship/${encodeURIComponent(slug)}/agent/${encodeURIComponent(agentSlug)}` : null
    const agentId = typeof a.id === 'string' ? a.id.trim() : ''
    const chatHref = slug && agentId ? `/ship/${encodeURIComponent(slug)}/rooms/lobby?agentId=${encodeURIComponent(agentId)}` : slug ? `/ship/${encodeURIComponent(slug)}/rooms/lobby` : null
    const canDelete = Boolean(a.id)
    const canExportBundle = Boolean(isInstanceAdmin === true && a.id)
    const isExporting = Boolean(exportingAgentId && a.id && exportingAgentId === a.id)
    return (
      <div key={key} className={cn('rounded-lg border border-border/60 bg-card px-4 py-3 flex items-start justify-between gap-3')}>
        <div className={cn('min-w-0 flex-1')} aria-label={label.primary}>
          <div className="flex items-start gap-3">
            <div className="relative mt-0.5 h-10 w-10 flex-shrink-0">
              <span className={cn('flex h-10 w-10 items-center justify-center rounded-full ring-1 ring-border/50 bg-muted/10 overflow-hidden')}>
                <AgentAvatar seed={label.primary} imageUrl={avatarUrl} fill instanceId={a.id ? `member-a-${a.id}` : `member-a-${label.primary}`} rounded />
              </span>
              <PresenceIndicator kind="online" active={true} size="sm" placement="outset" className="translate-x-[22%] translate-y-[6%]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <HoverProfilePopover
                  trigger={
                    detailsHref ? (
                      <Link href={detailsHref} className={cn('block max-w-full truncate text-sm font-medium text-foreground hover:underline underline-offset-2')}>
                        {label.primary}
                      </Link>
                    ) : (
                      <span className={cn('block max-w-full truncate text-sm font-medium text-foreground')}>{label.primary}</span>
                    )
                  }
                  content={agentHoverCard}
                  side="right"
                />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className="truncate text-emerald-600 dark:text-emerald-400">Online</span>
                {categoryMeta ? <span aria-hidden="true">·</span> : null}
                {categoryMeta ? (
                  <span className={cn('inline-flex items-center gap-1', categoryMeta.className)} aria-label={`Category: ${categoryMeta.label}`} title={`Category: ${categoryMeta.label}`}>
                    <span>{categoryMeta.label}</span>
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 self-center">
          {chatHref ? (
            <Button asChild size="sm" variant="ghost" className="h-8 text-muted-foreground hover:bg-accent/80 hover:text-foreground">
              <Link href={chatHref} className="inline-flex items-center gap-1.5">
                <Icon name="message-square" className="h-4 w-4" />
                Chat
              </Link>
            </Button>
          ) : null}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:bg-accent/80 hover:text-foreground" aria-label="More options">
                <Icon name="dots-vertical" className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {canExportBundle ? (
                <DropdownMenuItem
                  disabled={isExporting}
                  onClick={async () => {
                    if (!a.id) return
                    setExportingAgentId(a.id)
                    try {
                      const token = await getCurrentToken()
                      const res = await fetch(`/api/v1/agents/${encodeURIComponent(a.id)}/export-bundle`, {
                        method: 'GET',
                        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
                      })

                      if (!res.ok) {
                        throw new Error(`Export failed (${res.status})`)
                      }

                      const blob = await res.blob()
                      const contentDisposition = res.headers.get('content-disposition') || ''
                      const filenameMatch = /filename\*?=(?:UTF-8''|")?([^\";]+)"?/i.exec(contentDisposition)
                      const fallbackName = `${safeFilenameSegment(`bundle-${agentSlug || a.id}`)}.zip`
                      const filename = filenameMatch?.[1] ? decodeURIComponent(filenameMatch[1]) : fallbackName

                      const url = window.URL.createObjectURL(blob)
                      const link = document.createElement('a')
                      link.href = url
                      link.download = filename
                      document.body.appendChild(link)
                      link.click()
                      link.remove()
                      window.setTimeout(() => window.URL.revokeObjectURL(url), 1500)

                      toast.success('Export ready', { description: `Downloaded ${filename}` })
                    } catch (error) {
                      toast.error('Export failed', { description: getSafeErrorMessage(error) })
                    } finally {
                      setExportingAgentId(prev => (prev === a.id ? null : prev))
                    }
                  }}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Icon name="download" className="h-4 w-4" />
                  {isExporting ? 'Exporting…' : 'Export bundle'}
                </DropdownMenuItem>
              ) : null}

              {canDelete ? (
                <DropdownMenuItem
                  onClick={() => setConfirmAction({ kind: 'deleteAgent', agentId: a.id, label: label.primary })}
                  className="flex items-center gap-2 cursor-pointer hover:bg-destructive/10 focus:bg-destructive/10 text-destructive focus:text-destructive"
                >
                  <Icon name="trash" className="h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem disabled className="text-muted-foreground">
                  No actions
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    )
  }

  const q = debouncedSearch

  // Match connectors page behavior:
  // - show skeletons for initial load (empty search)
  // - show a centered "Searching…" message while search is running
  // - show a centered "No matches…" message when search completes with empty results
  const canLoadMoreHumans = Boolean(humansQuery.hasNextPage)
  const canLoadMoreAgents = Boolean(agentsQuery.hasNextPage)
  const isLoadingMoreHumans = Boolean(humansQuery.isFetchingNextPage)
  const isLoadingMoreAgents = Boolean(agentsQuery.isFetchingNextPage)

  const isInitialLoading = !q && Boolean(humansQuery.isLoading || agentsQuery.isLoading)
  const isSearching = Boolean(
    q &&
      // New query keys for search can report isLoading=true; treat that as "searching" not "initial loading".
      (humansQuery.isLoading || agentsQuery.isLoading || (humansQuery.isFetching && !isLoadingMoreHumans) || (agentsQuery.isFetching && !isLoadingMoreAgents))
  )

  const humansCount = humans.length
  const invitesCount = invites.length
  const agentsCount = agents.length

  const renderCenteredState = (message: string) => {
    return (
      <div className="flex items-center justify-center py-10">
        <p className="text-sm text-muted-foreground text-center">{message}</p>
      </div>
    )
  }

  const onlineHumansCount = useMemo(() => {
    let n = 0
    for (const m of humans) {
      const userId = typeof (m as any)?.userId === 'string' ? String((m as any).userId).trim() : ''
      if (!userId) continue
      if (presence.isUserOnline(userId)) n += 1
    }
    return n
  }, [humans, presence])

  const onlineVisibleHumansCount = useMemo(() => {
    let n = 0
    for (const m of filteredHumans) {
      const userId = typeof (m as any)?.userId === 'string' ? String((m as any).userId).trim() : ''
      if (!userId) continue
      if (presence.isUserOnline(userId)) n += 1
    }
    return n
  }, [filteredHumans, presence])
  // Agents are rendered as "Online" throughout this page.
  const onlineAgentsCount = agentsCount
  const onlineVisibleAgentsCount = filteredAgents.length

  const canInviteUsers = Boolean(starship?.id && (isInstanceAdmin === true || (user?.id && starship?.ownerId && String(starship.ownerId) === String(user.id))))

  const isFilterValue = (value: string): value is Filter => value === 'all' || value === 'humans' || value === 'agents'
  const openInviteFlow = () => setInviteOpen(true)
  const openImportFlow = () => setImportOpen(true)

  const humansTabCount = humansCount + invitesCount
  const allTabCount = humansTabCount + agentsCount

  const mobileFilterOptions = useMemo(() => {
    const withCount = (label: string, n: number) => `${label} (${n})`
    return [
      { value: 'all', label: withCount('All', allTabCount) },
      { value: 'humans', label: withCount('Humans', humansTabCount) },
      { value: 'agents', label: withCount('Agents', agentsCount) },
    ]
  }, [agentsCount, allTabCount, humansTabCount])

  const renderMemberCardSkeleton = (key: string) => {
    return (
      <div key={key} className={cn('rounded-lg border border-border/60 bg-card px-4 py-3 flex items-start justify-between gap-3')}>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <div className="relative mt-0.5 h-10 w-10 flex-shrink-0">
              <Skeleton className="h-10 w-10 rounded-full" />
              {/* Presence dot placeholder to keep spacing stable */}
              <Skeleton className="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-40 max-w-[70%]" />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                <Skeleton className="h-3 w-14" />
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex flex-col min-h-full min-w-0">
      <div className="sticky top-0 z-10 border-b border-border/60 bg-card">
        <div className="px-4 pt-3.5 pb-2 md:py-2">
          <div className="w-full">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                <div className="flex min-w-0 w-full gap-2 items-center">
                  <span className="flex-shrink-0 self-center md:hidden">
                    <MobileNavToggleButton className="mx-2" />
                  </span>
                  <div className="min-w-0 flex-1 flex flex-col justify-center gap-1">
                    <div className="flex items-baseline gap-2 min-w-0 w-full">
                      <span aria-hidden="true" className="flex-shrink-0 self-center text-foreground leading-none">
                        <Icon name="users" weight="bold" className="h-4 w-4" />
                      </span>
                      <h3 className="flex-1 text-base font-medium text-foreground truncate leading-tight min-w-0">Members</h3>
                    </div>

                    <div className="min-w-0 text-xs leading-snug text-muted-foreground min-h-6">
                      <span
                        className="block min-w-0 truncate font-medium leading-snug text-muted-foreground"
                        title="Invite collaborators, manage roles, and deploy agents to your starship."
                      >
                        Invite collaborators, manage roles, and deploy agents to your starship.
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-visible md:overflow-y-auto px-4 pt-6 pb-8 md:pb-8">
        <div className={cn('w-full bg-transparent max-w-4xl mx-auto min-h-full flex flex-col')}>
          <div className="pt-4 pb-8 hidden md:block">
            <Tabs
              value={filter}
              onValueChange={value => {
                if (isFilterValue(value)) setFilter(value)
              }}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex justify-start">
                  <TabsList className="w-full sm:w-auto flex-nowrap justify-center sm:justify-start gap-1 overflow-x-auto custom-scrollbar">
                    <TabsTrigger value="all" className="flex-1 sm:flex-none min-w-0 justify-center">
                      <span className="inline-flex items-center gap-1.5">
                        <span>All</span>
                        {!isInitialLoading ? (
                          <Badge variant={filter === 'all' ? 'default' : 'secondary'} className="h-4 px-1.5 py-0 text-[10px] font-medium leading-none tabular-nums">
                            {allTabCount}
                          </Badge>
                        ) : null}
                      </span>
                    </TabsTrigger>
                    <TabsTrigger value="humans" className="flex-1 sm:flex-none min-w-0 justify-center">
                      <span className="inline-flex items-center gap-1.5">
                        <span>Humans</span>
                        {!isInitialLoading ? (
                          <Badge variant={filter === 'humans' ? 'default' : 'secondary'} className="h-4 px-1.5 py-0 text-[10px] font-medium leading-none tabular-nums">
                            {humansTabCount}
                          </Badge>
                        ) : null}
                      </span>
                    </TabsTrigger>
                    <TabsTrigger value="agents" className="flex-1 sm:flex-none min-w-0 justify-center">
                      <span className="inline-flex items-center gap-1.5">
                        <span>Agents</span>
                        {!isInitialLoading ? (
                          <Badge variant={filter === 'agents' ? 'default' : 'secondary'} className="h-4 px-1.5 py-0 text-[10px] font-medium leading-none tabular-nums">
                            {agentsCount}
                          </Badge>
                        ) : null}
                      </span>
                    </TabsTrigger>
                  </TabsList>
                </div>
                <div className="w-full sm:w-64">
                  <div className="relative">
                    <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4 z-10 pointer-events-none" />
                    <Input
                      value={searchText}
                      onChange={e => setSearchText(e.target.value)}
                      placeholder="Search members"
                      className="pl-9 h-9 py-1.5 text-[13px] rounded-2xl border-border/60 bg-card shadow-sm"
                      aria-label="Search members"
                    />
                  </div>
                </div>
              </div>
            </Tabs>
          </div>

          {isInitialLoading ? (
            <div className="space-y-10">
              {filter !== 'agents' ? (
                <div>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex items-baseline gap-3">
                      <h3 className="text-lg font-semibold leading-tight text-foreground">Humans</h3>
                      <Skeleton className="h-4 w-8" />
                    </div>
                    {slug && canInviteUsers ? (
                      <Button type="button" size="sm" variant="ghost" className="h-8 text-primary hover:text-primary" onClick={openInviteFlow}>
                        <Icon name="user-plus" iconOverride={{ type: 'phosphor', component: 'UserPlus' }} className="h-4 w-4 mr-1.5" />
                        Invite user
                      </Button>
                    ) : null}
                  </div>
                  <div className="space-y-2">{Array.from({ length: SKELETON_CARD_COUNT }, (_, i) => renderMemberCardSkeleton(`human-skel-${i}`))}</div>
                </div>
              ) : null}

              {filter !== 'humans' ? (
                <div>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex items-baseline gap-3">
                      <h3 className="text-lg font-semibold leading-tight text-foreground">Agents</h3>
                      <Skeleton className="h-4 w-8" />
                    </div>
                    <Button asChild size="sm" variant="ghost" className="h-8 text-primary hover:text-primary">
                      <Link href="/explore">
                        <Icon name="store" iconOverride={{ type: 'phosphor', component: 'Storefront' }} className="h-4 w-4 mr-1.5" />
                        Explore agents
                      </Link>
                    </Button>
                  </div>
                  <div className="space-y-2">{Array.from({ length: SKELETON_CARD_COUNT }, (_, i) => renderMemberCardSkeleton(`agent-skel-${i}`))}</div>
                </div>
              ) : null}
            </div>
          ) : isSearching ? (
            renderCenteredState(`Searching “${q}”…`)
          ) : filteredHumans.length === 0 && filteredInvites.length === 0 && filteredAgents.length === 0 ? (
            renderCenteredState(q ? `No members match “${q}”.` : 'No members found.')
          ) : (
            <div className="space-y-10">
              {filteredHumans.length > 0 || filteredInvites.length > 0 ? (
                <div>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex items-baseline gap-3">
                      <h3 className="text-lg font-semibold leading-tight text-foreground">Humans</h3>
                      <span className="text-xs tabular-nums text-emerald-600 dark:text-emerald-400">({onlineVisibleHumansCount} online)</span>
                    </div>
                    {slug && canInviteUsers ? (
                      <Button type="button" size="sm" variant="ghost" className="h-8 text-primary hover:text-primary" onClick={openInviteFlow}>
                        <Icon name="user-plus" iconOverride={{ type: 'phosphor', component: 'UserPlus' }} className="h-4 w-4 mr-1.5" />
                        Invite user
                      </Button>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    {filteredHumans.map(renderHumanRow)}
                    {filteredInvites.map(renderInviteRow)}
                  </div>
                  {filter !== 'agents' && canLoadMoreHumans ? (
                    <div className="flex justify-center pt-4">
                      <Button variant="secondary" onClick={() => humansQuery.fetchNextPage()} disabled={isLoadingMoreHumans} className="h-8">
                        {isLoadingMoreHumans ? 'Loading…' : 'Load more humans'}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {filteredAgents.length > 0 ? (
                <div>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex items-baseline gap-3">
                      <h3 className="text-lg font-semibold leading-tight text-foreground">Agents</h3>
                      <span className="text-xs tabular-nums text-emerald-600 dark:text-emerald-400">({onlineVisibleAgentsCount} online)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {isInstanceAdmin === true && starshipIdStr ? (
                        <Button type="button" size="sm" variant="ghost" className="h-8 text-primary hover:text-primary" onClick={openImportFlow}>
                          <Icon name="upload" className="h-4 w-4 mr-1.5" />
                          Import bundle
                        </Button>
                      ) : null}
                      <Button asChild size="sm" variant="ghost" className="h-8 text-primary hover:text-primary">
                        <Link href="/explore">
                          <Icon name="store" iconOverride={{ type: 'phosphor', component: 'Storefront' }} className="h-4 w-4 mr-1.5" />
                          Explore agents
                        </Link>
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">{filteredAgents.map(renderAgentRow)}</div>
                  {filter !== 'humans' && canLoadMoreAgents ? (
                    <div className="flex justify-center pt-4">
                      <Button variant="secondary" onClick={() => agentsQuery.fetchNextPage()} disabled={isLoadingMoreAgents} className="h-8">
                        {isLoadingMoreAgents ? 'Loading…' : 'Load more agents'}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <MobileBottomFilterBar
        filterValue={filter}
        onFilterChange={v => {
          if (isFilterValue(v)) setFilter(v)
        }}
        filterOptions={mobileFilterOptions}
        filterPlaceholder="Filter"
        searchValue={searchText}
        onSearchChange={setSearchText}
        searchPlaceholder="Search members"
      />

      <Dialog
        open={inviteOpen}
        onOpenChange={open => {
          setInviteOpen(open)
          if (open) {
            setInviteEmail('')
            setLastInviteUrl(null)
          } else {
            setLastInviteUrl(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Invite collaborator</DialogTitle>
            <DialogDescription>Send an invite link to a teammate.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input id="invite-email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="teammate@example.com" disabled={createInvite.isPending} />
            </div>
            {lastInviteUrl ? (
              <div className="max-w-full overflow-hidden rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-3 text-sm">
                <div className="flex items-start gap-2">
                  <Icon name="check-circle" className="h-4 w-4 text-emerald-700 dark:text-emerald-400 mt-0.5" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="font-medium text-emerald-800 dark:text-emerald-300">We have sent them an invite. You can also use this invite link:</p>
                    <div className="relative min-w-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1 h-7 w-7 text-muted-foreground hover:text-foreground"
                        aria-label="Copy invite link"
                        title="Copy invite link"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(lastInviteUrl)
                          } catch {
                            // ignore
                          }
                        }}
                      >
                        <Icon name="copy" className="h-4 w-4" />
                      </Button>
                      <code className="block min-w-0 break-all rounded-md border border-border/60 bg-card/60 px-2 py-2 pr-9 text-[12px]">{lastInviteUrl}</code>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="ghost" onClick={() => setInviteOpen(false)} disabled={createInvite.isPending}>
              Close
            </Button>
            <Button
              type="button"
              disabled={!canInviteUsers || !starshipIdStr || !inviteEmail.trim() || createInvite.isPending}
              onClick={async () => {
                if (!starshipIdStr) return
                const email = inviteEmail.trim()
                if (!email) return
                const res = await createInvite.mutateAsync({ email })
                setLastInviteUrl(res.inviteUrl || null)
                queryClient.invalidateQueries({ queryKey: STARSHIP_MEMBERS_QUERY_KEYS.byStarship(starshipIdStr) })
              }}
            >
              {createInvite.isPending ? 'Sending…' : 'Send invite'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmAction !== null}
        onOpenChange={open => {
          if (!open) setConfirmAction(null)
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="text-destructive">
              {confirmAction?.kind === 'kickHuman'
                ? 'Kick member'
                : confirmAction?.kind === 'revokeInvite'
                  ? 'Revoke invitation'
                  : confirmAction?.kind === 'deleteAgent'
                    ? 'Delete agent'
                    : 'Confirm'}
            </DialogTitle>
            <DialogDescription>
              {confirmAction?.kind === 'kickHuman'
                ? "This will remove this member's access to the starship immediately."
                : confirmAction?.kind === 'revokeInvite'
                  ? 'This will revoke the invite so it can no longer be used.'
                  : confirmAction?.kind === 'deleteAgent'
                    ? 'This will permanently delete the agent. You can optionally also delete any tools that become unassigned.'
                    : ''}
            </DialogDescription>
          </DialogHeader>

          {confirmAction ? (
            <div className="p-3 rounded-lg border border-destructive/20 bg-destructive/10 text-sm">
              <div className="flex items-start gap-2">
                <Icon name="alert-triangle" className="h-4 w-4 text-destructive mt-0.5" />
                <div className="min-w-0">
                  <p className="font-medium text-destructive">You&apos;re about to:</p>
                  <p className="text-destructive/80 break-words">
                    {confirmAction.kind === 'kickHuman'
                      ? `Kick ${confirmAction.label}`
                      : confirmAction.kind === 'revokeInvite'
                        ? `Revoke invitation for ${confirmAction.label}`
                        : `Delete ${confirmAction.label}`}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {confirmAction?.kind === 'deleteAgent' ? (
            <DialogFooter className="gap-2 sm:gap-2 sm:flex-row">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirmAction(null)}
                disabled={removeMember.isPending || deleteAgent.isPending || deleteAgentWithUnusedTools.isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="outline"
                className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={deleteAgent.isPending || deleteAgentWithUnusedTools.isPending}
                onClick={async () => {
                  const action = confirmAction
                  if (!action || action.kind !== 'deleteAgent') return
                  try {
                    await deleteAgent.mutateAsync(action.agentId)
                  } finally {
                    setConfirmAction(null)
                  }
                }}
              >
                {deleteAgent.isPending ? 'Deleting…' : 'Delete agent'}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={deleteAgent.isPending || deleteAgentWithUnusedTools.isPending}
                onClick={async () => {
                  const action = confirmAction
                  if (!action || action.kind !== 'deleteAgent') return
                  try {
                    await deleteAgentWithUnusedTools.mutateAsync(action.agentId)
                  } finally {
                    setConfirmAction(null)
                  }
                }}
              >
                {deleteAgentWithUnusedTools.isPending ? 'Deleting…' : 'Delete + unused tools'}
              </Button>
            </DialogFooter>
          ) : (
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirmAction(null)}
                disabled={removeMember.isPending || revokeInvite.isPending || deleteAgent.isPending || deleteAgentWithUnusedTools.isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={removeMember.isPending || revokeInvite.isPending || deleteAgent.isPending || deleteAgentWithUnusedTools.isPending}
                onClick={async () => {
                  const action = confirmAction
                  if (!action) return
                  try {
                    if (action.kind === 'kickHuman') {
                      await removeMember.mutateAsync(action.userId)
                    } else if (action.kind === 'revokeInvite') {
                      await revokeInvite.mutateAsync(action.email)
                    }
                  } finally {
                    setConfirmAction(null)
                  }
                }}
              >
                {confirmAction?.kind === 'kickHuman'
                  ? removeMember.isPending
                    ? 'Kicking…'
                    : 'Kick'
                  : confirmAction?.kind === 'revokeInvite'
                    ? revokeInvite.isPending
                      ? 'Revoking…'
                      : 'Revoke'
                    : 'Confirm'}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="flex flex-col w-[calc(100vw-2rem)] max-w-3xl h-[80vh] overflow-hidden p-0">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <DialogHeader className="shrink-0 px-6 pt-6 pb-6 space-y-6">
              <DialogTitle>Import bundle</DialogTitle>
              <DialogDescription>Upload a bundle exported from Members → Agents → Export bundle.</DialogDescription>
              <div>
                <WizardStepper currentStep={importStep} steps={IMPORT_WIZARD_STEPS} />
              </div>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              {importStep === 1 ? (
                <div className="space-y-4">
                  <div className="text-sm font-semibold">Choose a bundle to import</div>
                  <div className="space-y-2 max-w-xl">
                    <Label htmlFor="bundle-file">Bundle (.zip)</Label>
                    <Input
                      id="bundle-file"
                      type="file"
                      accept=".zip,application/zip"
                      disabled={isAnalyzingImport || isApplyingImport}
                      onChange={e => {
                        const f = e.target.files?.[0] ?? null
                        setImportFile(f)
                        setImportAnalysis(null)
                        setImportDecisions({ tools: {}, agents: {} })
                      }}
                    />
                  </div>
                  {!importFile ? <div className="text-xs text-muted-foreground max-w-xl">Select a .zip file to continue.</div> : null}
                </div>
              ) : null}

              {importStep === 2 ? (
                <div className="space-y-4">
                  <div className="text-sm font-semibold">Choose how to resolve these conflicts</div>

                  {isAnalyzingImport ? (
                    <div className="rounded-lg border border-border/60 bg-card/10 p-3">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        <div className="text-sm font-semibold leading-tight">Analyzing…</div>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">This usually takes a few seconds.</div>
                    </div>
                  ) : null}

                  {importAnalysis ? (
                    <div className="space-y-4">
                      <div className="space-y-6">
                        <div>
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-semibold text-foreground">Tools</div>
                            <div className="text-xs text-muted-foreground">{importAnalysis.tools.length} in bundle</div>
                          </div>
                          <div className="mt-3 space-y-2">
                            {importAnalysis.tools.map(t => {
                              const decision = importDecisions.tools[t.bundleHash] ?? {
                                action: t.status === 'same' ? ('skip' as const) : ('copy' as const),
                                targetId: t.existing?.id,
                              }
                              const badge =
                                t.status === 'same'
                                  ? { label: 'Same', className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' }
                                  : t.status === 'conflict'
                                    ? { label: 'Conflict', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' }
                                    : { label: 'New', className: 'bg-muted text-muted-foreground' }
                              return (
                                <div key={t.bundleHash} className="rounded-lg border border-border/60 bg-card px-3 py-2 flex items-center justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className={cn('text-[11px] px-2 py-0.5 rounded-full font-medium', badge.className)}>{badge.label}</span>
                                      <span className="text-sm font-medium text-foreground truncate">{t.name}</span>
                                    </div>
                                    {t.existing ? (
                                      <div className="mt-1 text-xs text-muted-foreground truncate">
                                        Existing: {t.existing.name} ({t.existing.slug})
                                      </div>
                                    ) : null}
                                  </div>
                                  <select
                                    className="h-8 rounded-md border border-border/60 bg-background px-2 text-sm"
                                    disabled={isApplyingImport}
                                    value={decision.action}
                                    onChange={e => {
                                      const action = e.target.value as 'skip' | 'copy' | 'overwrite'
                                      setImportDecisions(prev => ({
                                        ...prev,
                                        tools: {
                                          ...prev.tools,
                                          [t.bundleHash]: { action, targetId: t.existing?.id },
                                        },
                                      }))
                                    }}
                                  >
                                    <option value="skip">Skip</option>
                                    <option value="copy">Import copy</option>
                                    <option value="overwrite" disabled={!t.existing}>
                                      Overwrite existing
                                    </option>
                                  </select>
                                </div>
                              )
                            })}
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-semibold text-foreground">Agents</div>
                            <div className="text-xs text-muted-foreground">{importAnalysis.agents.length} in bundle</div>
                          </div>
                          <div className="mt-3 space-y-2">
                            {importAnalysis.agents.map(a => {
                              const decision = importDecisions.agents[a.bundleHash] ?? {
                                action: a.status === 'same' ? ('skip' as const) : ('copy' as const),
                                targetId: a.existing?.id,
                              }
                              const badge =
                                a.status === 'same'
                                  ? { label: 'Same', className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' }
                                  : a.status === 'conflict'
                                    ? { label: 'Conflict', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' }
                                    : { label: 'New', className: 'bg-muted text-muted-foreground' }
                              return (
                                <div key={a.bundleHash} className="rounded-lg border border-border/60 bg-card px-3 py-2 flex items-center justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className={cn('text-[11px] px-2 py-0.5 rounded-full font-medium', badge.className)}>{badge.label}</span>
                                      <span className="text-sm font-medium text-foreground truncate">{a.name}</span>
                                    </div>
                                    {a.existing ? (
                                      <div className="mt-1 text-xs text-muted-foreground truncate">
                                        Existing: {a.existing.name} ({a.existing.slug})
                                      </div>
                                    ) : null}
                                  </div>
                                  <select
                                    className="h-8 rounded-md border border-border/60 bg-background px-2 text-sm"
                                    disabled={isApplyingImport}
                                    value={decision.action}
                                    onChange={e => {
                                      const action = e.target.value as 'skip' | 'copy' | 'overwrite'
                                      setImportDecisions(prev => ({
                                        ...prev,
                                        agents: {
                                          ...prev.agents,
                                          [a.bundleHash]: { action, targetId: a.existing?.id },
                                        },
                                      }))
                                    }}
                                  >
                                    <option value="skip">Skip</option>
                                    <option value="copy">Import copy</option>
                                    <option value="overwrite" disabled={!a.existing}>
                                      Overwrite existing
                                    </option>
                                  </select>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-border/60 bg-card/10 p-4">
                      <div className="text-sm font-semibold text-foreground">No analysis yet</div>
                      <div className="mt-1 text-xs text-muted-foreground">Press Next to analyze this bundle.</div>
                    </div>
                  )}
                </div>
              ) : null}

              {importStep === 3 ? (
                <div className="space-y-4">
                  <div className="text-sm font-semibold">Review</div>

                  <div className="space-y-3">
                    <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted/50">
                          <Icon name="wrench" className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Tools</p>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground tabular-nums">{importToolDecisionCounts.skip}</span> skipped
                            <span aria-hidden="true" className="h-3 w-px bg-border/60" />
                            <span className="font-medium text-foreground tabular-nums">{importToolDecisionCounts.copy}</span> copied
                            <span aria-hidden="true" className="h-3 w-px bg-border/60" />
                            <span className="font-medium text-foreground tabular-nums">{importToolDecisionCounts.overwrite}</span> upserted
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted/50">
                          <Icon name="bot" className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Agents</p>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground tabular-nums">{importAgentDecisionCounts.skip}</span> skipped
                            <span aria-hidden="true" className="h-3 w-px bg-border/60" />
                            <span className="font-medium text-foreground tabular-nums">{importAgentDecisionCounts.copy}</span> copied
                            <span aria-hidden="true" className="h-3 w-px bg-border/60" />
                            <span className="font-medium text-foreground tabular-nums">{importAgentDecisionCounts.overwrite}</span> upserted
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border/60 bg-card/10 p-3">
                    <div className="text-sm font-semibold text-foreground">Ready to upload</div>
                    <div className="mt-1 text-xs text-muted-foreground">Press Upload to import using the decisions you selected.</div>
                  </div>
                </div>
              ) : null}
            </div>

            <DialogFooter className="shrink-0 px-6 py-4 gap-2 flex-row justify-between sm:justify-between sm:space-x-0">
              <div>
                <Button type="button" variant="ghost" onClick={() => setImportOpen(false)} disabled={isAnalyzingImport || isApplyingImport}>
                  Cancel
                </Button>
              </div>

              <div className="flex items-center gap-2">
                {importStep > 1 ? (
                  <Button type="button" variant="ghost" onClick={handleImportBack} disabled={isAnalyzingImport || isApplyingImport}>
                    <Icon name="caret-left" className="h-4 w-4 mr-1" />
                    Back
                  </Button>
                ) : null}

                {importStep < 3 ? (
                  <Button type="button" variant="primaryOutline" onClick={handleImportNext} disabled={isAnalyzingImport || isApplyingImport || !canGoNextImport} className="min-w-[120px]">
                    Next
                    <Icon name="caret-right" className="h-4 w-4 ml-1" />
                  </Button>
                ) : (
                  <Button type="button" onClick={handleImportNext} disabled={isAnalyzingImport || isApplyingImport || !importFile || !starshipIdStr || !importAnalysis} className="min-w-[140px]">
                    {isApplyingImport ? (
                      <>
                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                        Uploading…
                      </>
                    ) : (
                      <>
                        Upload
                        <Icon name="upload" className="w-4 h-4 ml-2" />
                      </>
                    )}
                  </Button>
                )}
              </div>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
