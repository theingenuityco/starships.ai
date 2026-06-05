'use client'

import { useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { toast } from 'sonner'

import Icon from '@/components/primitives/Icon'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { getSafeErrorMessage } from '@/lib/error-utils'

import { useStarshipBySlug } from '@/hooks/useStarships'
import { useStarshipAgents, useCreateAgent, useDeleteAgent } from '@/hooks/useAgents'
import { useStarshipAgentTokens, useMintAgentToken, useRevokeAgentToken, type MintTokenResult } from '@/hooks/useAgentTokens'
import {
  useAgentHeartbeats,
  useCreateHeartbeat,
  useUpdateHeartbeat,
  useDeleteHeartbeat,
  type AgentHeartbeatModel,
} from '@/hooks/useAgentHeartbeats'
import { useAgentEvents } from '@/hooks/useAgentEvents'
import type { AgentAccessRole, AgentKind, AgentModel } from '@starships/protocol'

const AGENT_KINDS: Array<{ value: AgentKind; label: string }> = [
  { value: 'claude-code', label: 'Claude Code' },
  { value: 'codex', label: 'Codex' },
  { value: 'hermes', label: 'Hermes' },
  { value: 'openclaw', label: 'OpenClaw' },
  { value: 'custom', label: 'Custom' },
]

const ACCESS_ROLES: Array<{ value: AgentAccessRole; label: string; hint: string }> = [
  { value: 'contributor', label: 'Contributor', hint: 'Read + write (create/update tables, tasks, docs)' },
  { value: 'viewer', label: 'Viewer', hint: 'Read-only access' },
]

function kindLabel(kind: string): string {
  return AGENT_KINDS.find((k) => k.value === kind)?.label ?? kind
}

// The MCP server is not behind the reverse proxy; default to its dev port on the
// same host. Override with NEXT_PUBLIC_MCP_URL in other environments.
function mcpEndpoint(): string {
  if (process.env.NEXT_PUBLIC_MCP_URL) return process.env.NEXT_PUBLIC_MCP_URL
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:4100/mcp`
  }
  return 'http://localhost:4100/mcp'
}

async function copyText(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${label} copied`)
  } catch {
    toast.error(`Could not copy ${label.toLowerCase()}`)
  }
}

// Interval is stored in seconds; the UI edits it as a value + unit.
const INTERVAL_UNITS: Array<{ value: string; label: string; seconds: number }> = [
  { value: 'minutes', label: 'minutes', seconds: 60 },
  { value: 'hours', label: 'hours', seconds: 3600 },
  { value: 'days', label: 'days', seconds: 86400 },
]

function formatInterval(seconds: number): string {
  if (seconds % 86400 === 0) return `every ${seconds / 86400} day${seconds === 86400 ? '' : 's'}`
  if (seconds % 3600 === 0) return `every ${seconds / 3600} hour${seconds === 3600 ? '' : 's'}`
  return `every ${Math.round(seconds / 60)} min`
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.round(diff / 1000)
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

export default function AgentsPage() {
  const params = useParams<{ slug: string }>()
  const slug = params?.slug ?? ''
  const { data: starship } = useStarshipBySlug(slug, !!slug)
  const starshipId = starship?.id ?? ''
  const { data: agents = [], isLoading } = useStarshipAgents(starshipId, !!starshipId)

  const createAgent = useCreateAgent()
  const deleteAgent = useDeleteAgent()

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<AgentKind>('claude-code')
  const [accessRole, setAccessRole] = useState<AgentAccessRole>('contributor')
  const [description, setDescription] = useState('')

  // Connect + heartbeats + activity + delete targets
  const [connectAgent, setConnectAgent] = useState<AgentModel | null>(null)
  const [heartbeatAgent, setHeartbeatAgent] = useState<AgentModel | null>(null)
  const [activityAgent, setActivityAgent] = useState<AgentModel | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AgentModel | null>(null)

  function resetCreate() {
    setName('')
    setKind('claude-code')
    setAccessRole('contributor')
    setDescription('')
  }

  async function onCreate() {
    if (!name.trim() || !starshipId || createAgent.isPending) return
    try {
      const created = await createAgent.mutateAsync({
        starshipId,
        name: name.trim(),
        kind,
        accessRole,
        description: description.trim() || undefined,
      })
      setCreateOpen(false)
      resetCreate()
      // Jump straight into the connect flow so the agent is usable immediately.
      setConnectAgent(created)
    } catch (e) {
      // useCreateAgent already toasts; keep dialog open for correction.
    }
  }

  async function onConfirmDelete() {
    if (!deleteTarget || deleteAgent.isPending) return
    try {
      await deleteAgent.mutateAsync(deleteTarget.id)
      setDeleteTarget(null)
    } catch {
      // hook toasts on error
    }
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <PageHeader icon="bot" title="Agents" />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Register an external agent (Claude Code, Codex, etc.), then generate a connection token so it can reach this
          workspace through the MCP server.
        </p>
        <Button type="button" size="sm" onClick={() => { resetCreate(); setCreateOpen(true) }} disabled={!starshipId}>
          <Icon name="plus" className="mr-1.5 h-4 w-4" />
          New agent
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading agents…</p>
      ) : agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-12">
          <Icon name="bot" className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No agents registered yet.</p>
          <Button type="button" variant="ghost" className="text-primary hover:text-primary" onClick={() => { resetCreate(); setCreateOpen(true) }}>
            <Icon name="plus" className="mr-1.5 h-4 w-4" />
            Register your first agent
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {agents.map((agent) => (
            <li key={agent.id} className="rounded-lg border border-border px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{agent.name}</span>
                    <span className="rounded bg-accent px-2 py-0.5 text-xs text-muted-foreground">{kindLabel(agent.kind)}</span>
                    <span className="rounded bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground capitalize">{agent.accessRole}</span>
                  </div>
                  {agent.description ? <p className="mt-1 truncate text-xs text-muted-foreground">{agent.description}</p> : null}
                </div>
                <div className="flex items-center gap-1">
                  <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => setConnectAgent(agent)}>
                    <Icon name="key" className="mr-1.5 h-4 w-4" />
                    Connect
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" size="sm" variant="ghost" className="h-8 w-8 p-0" aria-label="More options">
                        <Icon name="dots-vertical" className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem
                        onClick={() => setHeartbeatAgent(agent)}
                        className="flex cursor-pointer items-center gap-2"
                      >
                        <Icon name="heart-pulse" className="h-4 w-4" />
                        Heartbeats
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setActivityAgent(agent)}
                        className="flex cursor-pointer items-center gap-2"
                      >
                        <Icon name="activity" className="h-4 w-4" />
                        Activity
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setDeleteTarget(agent)}
                        className="flex cursor-pointer items-center gap-2 text-destructive focus:text-destructive"
                      >
                        <Icon name="trash" className="h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Create agent dialog */}
      <Dialog open={createOpen} onOpenChange={(next) => { setCreateOpen(next); if (next) resetCreate() }}>
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Register agent</DialogTitle>
            <DialogDescription>Add an external agent to this workspace. You will get a connection token next.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className="text-xs text-muted-foreground">Name</div>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Backlog bot" autoFocus />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <div className="text-xs text-muted-foreground">Kind</div>
                <Select value={kind} onValueChange={(v) => setKind(v as AgentKind)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AGENT_KINDS.map((k) => (
                      <SelectItem key={k.value} value={k.value}>
                        {k.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <div className="text-xs text-muted-foreground">Access</div>
                <Select value={accessRole} onValueChange={(v) => setAccessRole(v as AgentAccessRole)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCESS_ROLES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">{ACCESS_ROLES.find((r) => r.value === accessRole)?.hint}</p>

            <div className="space-y-1.5">
              <div className="text-xs text-muted-foreground">Description (optional)</div>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this agent for?" rows={2} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={onCreate} disabled={!name.trim() || createAgent.isPending}>
              {createAgent.isPending ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Connect dialog */}
      <ConnectDialog
        agent={connectAgent}
        starshipId={starshipId}
        onClose={() => setConnectAgent(null)}
      />

      {/* Heartbeats dialog */}
      <HeartbeatsDialog
        agent={heartbeatAgent}
        starshipId={starshipId}
        onClose={() => setHeartbeatAgent(null)}
      />

      {/* Activity dialog */}
      <ActivityDialog
        agent={activityAgent}
        starshipId={starshipId}
        onClose={() => setActivityAgent(null)}
      />

      {/* Delete confirm dialog */}
      <Dialog open={deleteTarget !== null} onOpenChange={(next) => { if (!next && !deleteAgent.isPending) setDeleteTarget(null) }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete agent</DialogTitle>
            <DialogDescription>
              This removes {deleteTarget?.name} from the registry and revokes its access. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={deleteAgent.isPending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onConfirmDelete} disabled={deleteAgent.isPending}>
              {deleteAgent.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ConnectDialog({
  agent,
  starshipId,
  onClose,
}: {
  agent: AgentModel | null
  starshipId: string
  onClose: () => void
}) {
  const open = agent !== null
  const { data: tokens = [] } = useStarshipAgentTokens(starshipId, open)
  const mintToken = useMintAgentToken(starshipId)
  const revokeToken = useRevokeAgentToken(starshipId)

  // The freshly minted secret, shown exactly once for this agent.
  const [minted, setMinted] = useState<MintTokenResult | null>(null)

  const endpoint = useMemo(() => mcpEndpoint(), [])
  const agentTokens = useMemo(
    () => tokens.filter((t) => t.agentId === agent?.id && !t.revokedAt),
    [tokens, agent?.id]
  )

  const cliCommand = minted
    ? `claude mcp add --transport http starships ${endpoint} --header "Authorization: Bearer ${minted.token}"`
    : ''

  async function onMint() {
    if (!agent || mintToken.isPending) return
    try {
      const result = await mintToken.mutateAsync({ agentId: agent.id, name: `${agent.name} token` })
      setMinted(result)
    } catch {
      // hook toasts on error
    }
  }

  function handleClose() {
    setMinted(null)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) handleClose() }}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Connect {agent?.name}</DialogTitle>
          <DialogDescription>
            Generate a connection token and point your agent at the MCP endpoint. The secret is shown only once.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Endpoint */}
          <div className="space-y-1.5">
            <div className="text-xs text-muted-foreground">MCP endpoint</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-md border border-border bg-muted/30 px-3 py-2 font-mono text-xs">{endpoint}</code>
              <Button type="button" size="sm" variant="outline" className="h-9" onClick={() => copyText(endpoint, 'Endpoint')}>
                <Icon name="copy" className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Mint / freshly minted secret */}
          {minted ? (
            <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Icon name="key" className="h-4 w-4 text-primary" />
                Connection token
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded-md border border-border bg-background px-3 py-2 font-mono text-xs">{minted.token}</code>
                <Button type="button" size="sm" variant="outline" className="h-9" onClick={() => copyText(minted.token, 'Token')}>
                  <Icon name="copy" className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-[11px] text-amber-600 dark:text-amber-500">
                Copy this now. For security it cannot be shown again.
              </p>

              <div className="space-y-1.5 pt-1">
                <div className="text-xs text-muted-foreground">Add to Claude Code</div>
                <div className="flex items-start gap-2">
                  <code className="flex-1 whitespace-pre-wrap break-all rounded-md border border-border bg-background px-3 py-2 font-mono text-[11px]">{cliCommand}</code>
                  <Button type="button" size="sm" variant="outline" className="h-9" onClick={() => copyText(cliCommand, 'Command')}>
                    <Icon name="copy" className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <Button type="button" onClick={onMint} disabled={mintToken.isPending}>
              <Icon name="key" className="mr-1.5 h-4 w-4" />
              {mintToken.isPending ? 'Generating…' : 'Generate connection token'}
            </Button>
          )}

          {/* Existing tokens */}
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">Active tokens ({agentTokens.length})</div>
            {agentTokens.length === 0 ? (
              <p className="text-xs text-muted-foreground">No active tokens.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {agentTokens.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm">{t.name || 'Token'}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {t.lastUsedAt ? `Last used ${new Date(t.lastUsedAt).toLocaleDateString()}` : 'Never used'}
                        {' · '}
                        Created {new Date(t.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 text-destructive hover:text-destructive"
                      onClick={() => revokeToken.mutate(t.id)}
                      disabled={revokeToken.isPending}
                    >
                      <Icon name="unlink" className="mr-1.5 h-4 w-4" />
                      Revoke
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function HeartbeatsDialog({
  agent,
  starshipId,
  onClose,
}: {
  agent: AgentModel | null
  starshipId: string
  onClose: () => void
}) {
  const open = agent !== null
  const agentId = agent?.id ?? ''
  const { data: heartbeats = [] } = useAgentHeartbeats(starshipId, agentId, open)
  const createHeartbeat = useCreateHeartbeat(starshipId, agentId)
  const updateHeartbeat = useUpdateHeartbeat(starshipId, agentId)
  const deleteHeartbeat = useDeleteHeartbeat(starshipId, agentId)

  // Poll the activity log while the dialog is open so fires surface live.
  const { data: events = [] } = useAgentEvents(starshipId, { enabled: open, refetchInterval: open ? 15000 : false })

  // heartbeatId -> { count, lastFiredAt } from heartbeat_fired events (newest first).
  const firesByHeartbeat = useMemo(() => {
    const map = new Map<string, { count: number; lastAt: string }>()
    for (const e of events) {
      if (e.type !== 'heartbeat_fired' || e.agentId !== agentId) continue
      const hbId = typeof e.payload?.heartbeatId === 'string' ? e.payload.heartbeatId : null
      if (!hbId) continue
      const existing = map.get(hbId)
      if (existing) existing.count += 1
      else map.set(hbId, { count: 1, lastAt: e.createdAt }) // events are newest-first, so first seen is latest
    }
    return map
  }, [events, agentId])

  // New-heartbeat form state.
  const [hbName, setHbName] = useState('')
  const [commandType, setCommandType] = useState('heartbeat')
  const [intervalValue, setIntervalValue] = useState('15')
  const [intervalUnit, setIntervalUnit] = useState('minutes')
  const [payloadText, setPayloadText] = useState('')

  function resetForm() {
    setHbName('')
    setCommandType('heartbeat')
    setIntervalValue('15')
    setIntervalUnit('minutes')
    setPayloadText('')
  }

  function handleClose() {
    resetForm()
    onClose()
  }

  async function onCreate() {
    if (!agent || createHeartbeat.isPending) return
    const unit = INTERVAL_UNITS.find((u) => u.value === intervalUnit) ?? INTERVAL_UNITS[0]
    const intervalSeconds = Math.round(Number(intervalValue) * unit.seconds)
    if (!Number.isFinite(intervalSeconds) || intervalSeconds < 60) {
      toast.error('Interval must be at least 1 minute')
      return
    }
    if (!commandType.trim()) {
      toast.error('Command type is required')
      return
    }
    let payload: Record<string, unknown> | undefined
    if (payloadText.trim()) {
      try {
        const parsed = JSON.parse(payloadText)
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          throw new Error('not an object')
        }
        payload = parsed as Record<string, unknown>
      } catch {
        toast.error('Payload must be a valid JSON object')
        return
      }
    }
    try {
      await createHeartbeat.mutateAsync({
        name: hbName.trim() || undefined,
        commandType: commandType.trim(),
        intervalSeconds,
        payload,
      })
      resetForm()
    } catch {
      // hook toasts on error
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) handleClose() }}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Heartbeats · {agent?.name}</DialogTitle>
          <DialogDescription>
            Trigger this agent on a schedule. Each beat dispatches a command the agent receives on its next poll.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* New heartbeat form */}
          <div className="space-y-3 rounded-lg border border-border p-3">
            <div className="text-xs font-medium text-muted-foreground">New heartbeat</div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <div className="text-xs text-muted-foreground">Name (optional)</div>
                <Input value={hbName} onChange={(e) => setHbName(e.target.value)} placeholder="e.g. Hourly sync" />
              </div>
              <div className="space-y-1.5">
                <div className="text-xs text-muted-foreground">Command type</div>
                <Input value={commandType} onChange={(e) => setCommandType(e.target.value)} placeholder="heartbeat" />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="text-xs text-muted-foreground">Run every</div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  value={intervalValue}
                  onChange={(e) => setIntervalValue(e.target.value)}
                  className="w-24"
                />
                <Select value={intervalUnit} onValueChange={setIntervalUnit}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INTERVAL_UNITS.map((u) => (
                      <SelectItem key={u.value} value={u.value}>
                        {u.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-[11px] text-muted-foreground">Minimum 1 minute.</p>
            </div>

            <div className="space-y-1.5">
              <div className="text-xs text-muted-foreground">Payload (optional JSON)</div>
              <Textarea
                value={payloadText}
                onChange={(e) => setPayloadText(e.target.value)}
                placeholder={'{ "prompt": "Check for new issues" }'}
                rows={2}
                className="font-mono text-xs"
              />
            </div>

            <Button type="button" size="sm" onClick={onCreate} disabled={createHeartbeat.isPending}>
              <Icon name="plus" className="mr-1.5 h-4 w-4" />
              {createHeartbeat.isPending ? 'Adding…' : 'Add heartbeat'}
            </Button>
          </div>

          {/* Existing heartbeats */}
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">Configured ({heartbeats.length})</div>
            {heartbeats.length === 0 ? (
              <p className="text-xs text-muted-foreground">No heartbeats yet.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {heartbeats.map((hb: AgentHeartbeatModel) => (
                  <li key={hb.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm">{hb.name || hb.commandType}</span>
                        <span className="rounded bg-accent px-1.5 py-0.5 text-[11px] text-muted-foreground">{formatInterval(hb.intervalSeconds)}</span>
                        {!hb.enabled ? <span className="rounded bg-muted/40 px-1.5 py-0.5 text-[11px] text-muted-foreground">paused</span> : null}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        <code>{hb.commandType}</code>
                        {' · '}
                        {(() => {
                          const fires = firesByHeartbeat.get(hb.id)
                          if (fires) return `Fired ${fires.count}× · last ${timeAgo(fires.lastAt)}`
                          return hb.lastFiredAt ? `Last fired ${timeAgo(hb.lastFiredAt)}` : 'Never fired'
                        })()}
                        {hb.enabled ? ` · next ${new Date(hb.nextFireAt).toLocaleTimeString()}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8"
                        onClick={() => updateHeartbeat.mutate({ id: hb.id, enabled: !hb.enabled })}
                        disabled={updateHeartbeat.isPending}
                        aria-label={hb.enabled ? 'Pause heartbeat' : 'Resume heartbeat'}
                      >
                        <Icon name={hb.enabled ? 'pause' : 'play'} className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 text-destructive hover:text-destructive"
                        onClick={() => deleteHeartbeat.mutate(hb.id)}
                        disabled={deleteHeartbeat.isPending}
                        aria-label="Delete heartbeat"
                      >
                        <Icon name="trash" className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Activity-log event types -> display metadata. Unknown types fall back to the raw type.
const EVENT_META: Record<string, { label: string; icon: string; tone: string }> = {
  heartbeat_fired: { label: 'Heartbeat fired', icon: 'heart-pulse', tone: 'text-muted-foreground' },
  command_acked: { label: 'Command picked up', icon: 'play', tone: 'text-blue-600 dark:text-blue-400' },
  command_completed: { label: 'Command completed', icon: 'check', tone: 'text-emerald-600 dark:text-emerald-400' },
  status: { label: 'Status report', icon: 'activity', tone: 'text-muted-foreground' },
}

function eventSummary(payload: Record<string, unknown> | undefined): string {
  if (!payload || typeof payload !== 'object') return ''
  const parts: string[] = []
  if (typeof payload.commandType === 'string') parts.push(payload.commandType)
  if (typeof payload.status === 'string') parts.push(payload.status)
  if (typeof payload.detail === 'string' && payload.detail) parts.push(payload.detail)
  return parts.join(' · ')
}

function ActivityDialog({
  agent,
  starshipId,
  onClose,
}: {
  agent: AgentModel | null
  starshipId: string
  onClose: () => void
}) {
  const open = agent !== null
  const agentId = agent?.id ?? ''
  const { data: allEvents = [], isLoading } = useAgentEvents(starshipId, {
    enabled: open,
    limit: 100,
    refetchInterval: open ? 10000 : false,
  })

  const events = useMemo(() => allEvents.filter((e) => e.agentId === agentId), [allEvents, agentId])

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Activity · {agent?.name}</DialogTitle>
          <DialogDescription>
            Live audit trail for this agent: heartbeat fires, command pickups and completions, and status it reports. Updates every 10s.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading activity…</p>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-10">
            <Icon name="activity" className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No activity yet.</p>
            <p className="max-w-xs text-center text-[11px] text-muted-foreground">
              Fires show here immediately. Pickups and completions appear once a connected agent pulls and runs the dispatch.
            </p>
          </div>
        ) : (
          <ol className="flex flex-col gap-1.5">
            {events.map((e) => {
              const meta = EVENT_META[e.type]
              const summary = eventSummary(e.payload as Record<string, unknown> | undefined)
              return (
                <li key={e.id} className="flex items-start gap-2.5 rounded-md border border-border px-3 py-2">
                  <Icon name={meta?.icon ?? 'circle'} className={`mt-0.5 h-4 w-4 shrink-0 ${meta?.tone ?? 'text-muted-foreground'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm">{meta?.label ?? e.type}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(e.createdAt)}</span>
                    </div>
                    {summary ? <div className="truncate text-[11px] text-muted-foreground">{summary}</div> : null}
                  </div>
                </li>
              )
            })}
          </ol>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
