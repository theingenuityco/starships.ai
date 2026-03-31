'use client'

import AgentAvatar from '@/components/animated/AgentAvatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import Icon from '@/components/primitives/Icon'
import { useStarshipMembersAndInvites, type StarshipMemberListItem } from '@/hooks/useStarshipMembers'
import { useStarshipAgents } from '@/hooks/useAgents'
import { useAuth } from '@/hooks/useAuth'
import api, { heartbeatAPI } from '@/lib/api'
import { getSafeErrorMessage } from '@/lib/error-utils'
import { ROOM_QUERY_KEYS, useRoomParticipants } from '@/hooks/useRooms'
import { cn } from '@/lib/utils'
import { formatAgentDisplayName } from '@/lib/agentDisplay'
import type { AgentModel, HeartbeatConfigModel } from '@starships/protocol'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

function getHumanLabel(m: StarshipMemberListItem): { primary: string; secondary?: string } {
  const displayName = typeof m.displayName === 'string' ? m.displayName.trim() : ''
  const email = typeof m.email === 'string' ? m.email.trim() : ''
  const primary = displayName || email || 'Unknown member'
  const role = typeof m.role === 'string' ? m.role.trim() : ''
  const secondaryParts = [role ? role[0]?.toUpperCase() + role.slice(1) : null, displayName && email ? email : null].filter(Boolean) as string[]
  return { primary, secondary: secondaryParts.length ? secondaryParts.join(' · ') : undefined }
}

function formatRelativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Never'
  const ms = Date.now() - new Date(dateStr).getTime()
  if (ms < 0) return 'Soon'
  if (ms < 60_000) return 'Just now'
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`
  return `${Math.floor(ms / 86_400_000)}d ago`
}

const HEARTBEAT_QUERY_KEY = 'room-heartbeat-configs'

function AgentHeartbeatControls({ roomConversationId, agentId }: { roomConversationId: string; agentId: string }) {
  const qc = useQueryClient()
  const queryKey = [HEARTBEAT_QUERY_KEY, roomConversationId, agentId]

  const { data: config } = useQuery<HeartbeatConfigModel | null>({
    queryKey,
    queryFn: () => heartbeatAPI.getByRoomAndAgent(roomConversationId, agentId),
    enabled: !!roomConversationId && !!agentId,
    refetchInterval: 30_000,
  })

  const [isEditing, setIsEditing] = useState(false)
  const [intervalMinutes, setIntervalMinutes] = useState(30)
  const [prompt, setPrompt] = useState('')
  const [activeStart, setActiveStart] = useState('')
  const [activeEnd, setActiveEnd] = useState('')
  const [activeTz, setActiveTz] = useState('')

  useEffect(() => {
    if (config) {
      setIntervalMinutes(config.intervalMinutes)
      setPrompt(config.prompt)
      setActiveStart(config.activeHoursStart ?? '')
      setActiveEnd(config.activeHoursEnd ?? '')
      setActiveTz(config.activeHoursTimezone ?? '')
    }
  }, [config])

  const invalidate = useCallback(() => {
    void qc.invalidateQueries({ queryKey })
  }, [qc, queryKey])

  const enableMutation = useMutation({
    mutationFn: async () => {
      if (config) {
        return heartbeatAPI.update(roomConversationId, agentId, { isEnabled: true })
      }
      return heartbeatAPI.create(roomConversationId, { agentId, isEnabled: true, intervalMinutes: 30 })
    },
    onSuccess: () => { invalidate(); toast.success('Heartbeat enabled') },
    onError: () => toast.error('Failed to enable heartbeat'),
  })

  const disableMutation = useMutation({
    mutationFn: () => heartbeatAPI.update(roomConversationId, agentId, { isEnabled: false }),
    onSuccess: () => { invalidate(); toast.success('Heartbeat paused') },
    onError: () => toast.error('Failed to pause heartbeat'),
  })

  const updateMutation = useMutation({
    mutationFn: () =>
      heartbeatAPI.update(roomConversationId, agentId, {
        intervalMinutes,
        prompt,
        activeHoursStart: activeStart || null,
        activeHoursEnd: activeEnd || null,
        activeHoursTimezone: activeTz || null,
      }),
    onSuccess: () => { invalidate(); setIsEditing(false); toast.success('Heartbeat updated') },
    onError: () => toast.error('Failed to update'),
  })

  const wakeMutation = useMutation({
    mutationFn: () => heartbeatAPI.wake(roomConversationId, agentId),
    onSuccess: () => { toast.success('Heartbeat triggered'); setTimeout(invalidate, 3000) },
    onError: () => toast.error('Failed to trigger heartbeat'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => heartbeatAPI.delete(roomConversationId, agentId),
    onSuccess: () => { invalidate(); toast.success('Heartbeat removed') },
    onError: () => toast.error('Failed to remove heartbeat'),
  })

  const isEnabled = config?.isEnabled ?? false
  const hasConfig = !!config
  const statusMap: Record<string, { label: string; variant: 'default' | 'destructive' | 'secondary' | 'outline' }> = {
    ok: { label: 'OK', variant: 'default' },
    alert: { label: 'Alert', variant: 'destructive' },
    failed: { label: 'Failed', variant: 'destructive' },
    duplicate: { label: 'Dup', variant: 'secondary' },
  }

  return (
    <div className="mt-2 border-t border-border/30 pt-2 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon name="heart-pulse" className={cn('w-3 h-3', isEnabled ? 'text-green-500' : 'text-muted-foreground')} />
          <span className="text-[11px] font-medium text-muted-foreground">Heartbeat</span>
          {hasConfig && config?.lastRunStatus && statusMap[config.lastRunStatus] && (
            <Badge variant={statusMap[config.lastRunStatus].variant} className="text-[9px] px-1 py-0 h-4">
              {statusMap[config.lastRunStatus].label}
            </Badge>
          )}
          {hasConfig && <span className="text-[10px] text-muted-foreground">{formatRelativeTime(config?.lastRunAt)}</span>}
        </div>
        <Switch
          checked={isEnabled}
          disabled={enableMutation.isPending || disableMutation.isPending}
          onCheckedChange={checked => (checked ? enableMutation.mutate() : disableMutation.mutate())}
          className="scale-75 origin-right"
        />
      </div>

      {hasConfig && isEnabled && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            disabled={wakeMutation.isPending}
            onClick={() => wakeMutation.mutate()}
            className="text-[10px] h-6 px-2 gap-1"
          >
            <Icon name="play" className="w-2.5 h-2.5" />
            {wakeMutation.isPending ? 'Running…' : 'Run Now'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsEditing(!isEditing)}
            className="text-[10px] h-6 px-2 gap-1"
          >
            <Icon name="settings2" className="w-2.5 h-2.5" />
            {isEditing ? 'Cancel' : 'Configure'}
          </Button>
          <span className="text-[10px] text-muted-foreground">Every {config!.intervalMinutes}m</span>
        </div>
      )}

      {isEditing && hasConfig && (
        <div className="space-y-2 rounded-md border border-border/40 bg-muted/20 p-2">
          <div className="space-y-1">
            <Label className="text-[10px] font-medium">Interval (minutes)</Label>
            <Input
              type="number"
              min={1}
              max={1440}
              value={intervalMinutes}
              onChange={e => setIntervalMinutes(Math.max(1, parseInt(e.target.value, 10) || 30))}
              className="text-xs h-7 w-24"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] font-medium">Prompt</Label>
            <Textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="What should the agent check?"
              className="text-xs min-h-[60px] resize-none"
            />
            <p className="text-[9px] text-muted-foreground">Agent replies HEARTBEAT_OK if all is well; otherwise the response is treated as an alert.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="space-y-1">
              <Label className="text-[10px] font-medium">Start</Label>
              <Input type="time" value={activeStart} onChange={e => setActiveStart(e.target.value)} className="text-xs h-7 w-24" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-medium">End</Label>
              <Input type="time" value={activeEnd} onChange={e => setActiveEnd(e.target.value)} className="text-xs h-7 w-24" />
            </div>
            <div className="space-y-1 flex-1">
              <Label className="text-[10px] font-medium">Timezone</Label>
              <Input value={activeTz} onChange={e => setActiveTz(e.target.value)} placeholder="UTC" className="text-xs h-7" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" disabled={updateMutation.isPending} onClick={() => updateMutation.mutate()} className="text-[10px] h-6 px-2">
              {updateMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={deleteMutation.isPending}
              onClick={() => { if (window.confirm('Remove heartbeat for this agent in this room?')) deleteMutation.mutate() }}
              className="text-[10px] h-6 px-2 text-destructive hover:text-destructive"
            >
              Remove heartbeat
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export function RoomParticipantsPane(props: {
  starshipId: string
  roomConversationId: string
  roomIsPrivate: boolean
  roomManagerAgentId?: string | null
  starshipOwnerId?: string | null
}) {
  const { user, isInstanceAdmin } = useAuth()
  const [tab, setTab] = useState<'humans' | 'agents'>('humans')
  const [search, setSearch] = useState('')

  const roomParticipants = useRoomParticipants(props.roomConversationId, true)
  const membersAndInvites = useStarshipMembersAndInvites(props.starshipId, true)
  const starshipAgents = useStarshipAgents(props.starshipId, true, { order: 'ASC' })

  const qc = useQueryClient()

  const canManagePrivateRoom = useMemo(() => {
    const uid = typeof user?.id === 'string' ? user.id : ''
    const ownerId = typeof props.starshipOwnerId === 'string' ? props.starshipOwnerId.trim() : ''
    return Boolean(isInstanceAdmin === true || (uid && ownerId && uid === ownerId))
  }, [isInstanceAdmin, props.starshipOwnerId, user?.id])

  const canAddHumans = props.roomIsPrivate ? canManagePrivateRoom : true
  const canRemoveHumans = props.roomIsPrivate ? canManagePrivateRoom : false
  const canAddAgents = props.roomIsPrivate ? canManagePrivateRoom : true
  const canRemoveAgents = props.roomIsPrivate ? canManagePrivateRoom : true

  const addMember = useMutation({
    mutationFn: async (args: { userId: string; role?: 'member' | 'admin' }) => {
      const userId = String(args.userId || '').trim()
      if (!userId) throw new Error('Missing userId')
      const res = await api.post(`/api/v1/rooms/${encodeURIComponent(props.roomConversationId)}/members`, {
        userId,
        ...(args.role ? { role: args.role } : {}),
      })
      return (res as any)?.data?.data ?? null
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ROOM_QUERY_KEYS.participants(props.roomConversationId) })
      toast.success('Participant added')
    },
    onError: (error: unknown) => {
      toast.error('Failed to add participant', { description: getSafeErrorMessage(error) })
    },
  })

  const removeMember = useMutation({
    mutationFn: async (userId: string) => {
      const uid = String(userId || '').trim()
      if (!uid) throw new Error('Missing userId')
      const res = await api.delete(`/api/v1/rooms/${encodeURIComponent(props.roomConversationId)}/members/${encodeURIComponent(uid)}`)
      return (res as any)?.data?.data ?? null
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ROOM_QUERY_KEYS.participants(props.roomConversationId) })
      toast.success('Participant removed')
    },
    onError: (error: unknown) => {
      toast.error('Failed to remove participant', { description: getSafeErrorMessage(error) })
    },
  })

  const addAgent = useMutation({
    mutationFn: async (args: { agentId: string }) => {
      const agentId = String(args.agentId || '').trim()
      if (!agentId) throw new Error('Missing agentId')
      const res = await api.post(`/api/v1/rooms/${encodeURIComponent(props.roomConversationId)}/agents`, { agentId })
      return (res as any)?.data?.data ?? null
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ROOM_QUERY_KEYS.participants(props.roomConversationId) })
      toast.success('Agent added')
    },
    onError: (error: unknown) => {
      toast.error('Failed to add agent', { description: getSafeErrorMessage(error) })
    },
  })

  const removeAgent = useMutation({
    mutationFn: async (agentId: string) => {
      const aid = String(agentId || '').trim()
      if (!aid) throw new Error('Missing agentId')
      const res = await api.delete(`/api/v1/rooms/${encodeURIComponent(props.roomConversationId)}/agents/${encodeURIComponent(aid)}`)
      return (res as any)?.data?.data ?? null
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ROOM_QUERY_KEYS.participants(props.roomConversationId) })
      toast.success('Agent removed')
    },
    onError: (error: unknown) => {
      toast.error('Failed to remove agent', { description: getSafeErrorMessage(error) })
    },
  })

  const setManagerAgent = useMutation({
    mutationFn: async (managerAgentId: string | null) => {
      const payload = { managerAgentId: managerAgentId ? String(managerAgentId).trim() : null }
      const res = await api.patch(`/api/v1/rooms/${encodeURIComponent(props.roomConversationId)}`, payload)
      return (res as any)?.data?.data ?? null
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ROOM_QUERY_KEYS.byStarship(props.starshipId) })
      toast.success('Manager agent updated')
    },
    onError: (error: unknown) => {
      toast.error('Failed to update manager agent', { description: getSafeErrorMessage(error) })
    },
  })

  const roomUserIdSet = useMemo(() => new Set((roomParticipants.data?.userIds ?? []).map(x => String(x))), [roomParticipants.data?.userIds])
  const roomAgentIdSet = useMemo(() => new Set((roomParticipants.data?.agentIds ?? []).map(x => String(x))), [roomParticipants.data?.agentIds])

  const q = String(search || '').trim().toLowerCase()

  const humans = useMemo(() => {
    const list = (membersAndInvites.data?.members ?? []) as StarshipMemberListItem[]
    const filtered = q
      ? list.filter(m => {
          const label = getHumanLabel(m)
          const hay = `${label.primary} ${label.secondary || ''}`.toLowerCase()
          return hay.includes(q)
        })
      : list
    return filtered.slice().sort((a, b) => {
      const la = getHumanLabel(a).primary.toLowerCase()
      const lb = getHumanLabel(b).primary.toLowerCase()
      return la.localeCompare(lb)
    })
  }, [membersAndInvites.data?.members, q])

  const agents = useMemo(() => {
    const list = (starshipAgents.data ?? []) as AgentModel[]
    const filtered = q
      ? list.filter(a => {
          const label = formatAgentDisplayName(a)
          const slug = typeof a.slug === 'string' ? a.slug : ''
          const hay = `${label} ${slug}`.toLowerCase()
          return hay.includes(q)
        })
      : list
    return filtered.slice().sort((a, b) => formatAgentDisplayName(a).localeCompare(formatAgentDisplayName(b)))
  }, [q, starshipAgents.data])

  const humanCountInRoom = roomParticipants.data?.userIds?.length ?? 0
  const agentCountInRoom = roomParticipants.data?.agentIds?.length ?? 0

  const isBusy = addMember.isPending || removeMember.isPending || addAgent.isPending || removeAgent.isPending || setManagerAgent.isPending

  return (
    <div className="flex-1 min-h-0 overflow-auto px-0 sm:px-4 md:px-6 py-4">
      <div className="mb-4">
        <div className="relative">
          <Icon
            name="search"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4 z-10 pointer-events-none"
          />
          <Input
            value={search}
            onChange={e => setSearch(String(e.target.value || ''))}
            placeholder="Search people or agents"
            className="pl-9 h-9 py-1.5 text-[13px] rounded-2xl border-border/60 bg-card shadow-sm"
          />
        </div>
      </div>

        <Tabs value={tab} onValueChange={v => (v === 'humans' || v === 'agents' ? setTab(v) : null)}>
          <TabsList className="w-full">
            <TabsTrigger value="humans" className="flex-1">
              Humans ({humanCountInRoom})
            </TabsTrigger>
            <TabsTrigger value="agents" className="flex-1">
              Agents ({agentCountInRoom})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="humans" className="mt-4">
            <div className="space-y-1">
              {membersAndInvites.isLoading || roomParticipants.isLoading ? (
                <div className="py-10 text-sm text-muted-foreground text-center">Loading…</div>
              ) : humans.length === 0 ? (
                <div className="py-10 text-sm text-muted-foreground text-center">{q ? `No matches for "${String(search || '').trim()}".` : 'No members found.'}</div>
              ) : (
                humans.map(m => {
                  const userId = String(m.userId || '').trim()
                  if (!userId) return null
                  const label = getHumanLabel(m)
                  const avatarUrl = typeof m.avatar === 'string' ? m.avatar.trim() : ''
                  const inRoom = roomUserIdSet.has(userId)
                  const isMe = Boolean(user?.id && String(user.id) === userId)
                  const canRemoveThis = canRemoveHumans && inRoom && !isMe
                  const canAddThis = canAddHumans && !inRoom
                  return (
                    <div key={`human:${userId}`} className={cn('rounded-lg border border-border/60 bg-card px-3 py-2 flex items-center justify-between gap-3')}>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-9 w-9 rounded-full ring-1 ring-border/50 bg-muted/10 overflow-hidden flex items-center justify-center flex-shrink-0">
                          <AgentAvatar seed={label.primary} imageUrl={avatarUrl || null} size={36} rounded />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-foreground truncate">
                            {label.primary}
                            {isMe ? <span className="text-muted-foreground font-normal"> (you)</span> : null}
                          </div>
                          {label.secondary ? <div className="text-xs text-muted-foreground truncate">{label.secondary}</div> : null}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {inRoom ? (
                          canRemoveHumans ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={!canRemoveThis || isBusy}
                              onClick={() => removeMember.mutate(userId)}
                              title={!canRemoveThis ? (isMe ? 'You cannot remove yourself' : 'No permission') : undefined}
                            >
                              Remove
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">In room</span>
                          )
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            disabled={!canAddThis || isBusy}
                            onClick={() => addMember.mutate({ userId, role: 'member' })}
                            title={!canAddThis ? 'No permission' : undefined}
                          >
                            Add
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </TabsContent>

          <TabsContent value="agents" className="mt-4">
            {canManagePrivateRoom ? (
              <div className="mb-4 rounded-lg border border-border/60 bg-card px-3 py-2">
                <div className="text-xs font-medium text-muted-foreground mb-2">Manager agent (default)</div>
                <Select
                  value={props.roomManagerAgentId ? String(props.roomManagerAgentId) : '__none__'}
                  onValueChange={v => {
                    if (isBusy) return
                    const next = v === '__none__' ? null : String(v)
                    setManagerAgent.mutate(next)
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a manager agent" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {agents
                      .filter(a => roomAgentIdSet.has(String(a.id)))
                      .map(a => {
                        const id = String(a.id || '').trim()
                        if (!id) return null
                        return (
                          <SelectItem key={`mgr:${id}`} value={id}>
                            {formatAgentDisplayName(a)}
                          </SelectItem>
                        )
                      })}
                  </SelectContent>
                </Select>
                <div className="mt-2 text-xs text-muted-foreground">Used as the default agent for new conversations in this room.</div>
              </div>
            ) : null}

            <div className="space-y-1">
              {starshipAgents.isLoading || roomParticipants.isLoading ? (
                <div className="py-10 text-sm text-muted-foreground text-center">Loading…</div>
              ) : agents.length === 0 ? (
                <div className="py-10 text-sm text-muted-foreground text-center">{q ? `No matches for "${String(search || '').trim()}".` : 'No agents found.'}</div>
              ) : (
                agents.map(a => {
                  const agentId = String(a.id || '').trim()
                  if (!agentId) return null
                  const label = formatAgentDisplayName(a) || 'Agent'
                  const inRoom = roomAgentIdSet.has(agentId)
                  const canRemoveThis = canRemoveAgents && inRoom
                  const canAddThis = canAddAgents && !inRoom
                  return (
                    <div key={`agent:${agentId}`} className={cn('rounded-lg border border-border/60 bg-card px-3 py-2')}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-9 w-9 rounded-full ring-1 ring-border/50 bg-muted/10 overflow-hidden flex items-center justify-center flex-shrink-0">
                            <AgentAvatar seed={label} imageUrl={null} size={36} rounded instanceId={agentId} />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-foreground truncate">{label}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {typeof a.slug === 'string' && a.slug.trim() ? `@${a.slug.trim()}` : agentId.slice(0, 8)}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          {inRoom ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={!canRemoveThis || isBusy}
                              onClick={() => removeAgent.mutate(agentId)}
                              title={!canRemoveThis ? 'No permission' : undefined}
                            >
                              Remove
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              disabled={!canAddThis || isBusy}
                              onClick={() => addAgent.mutate({ agentId })}
                              title={!canAddThis ? 'No permission' : undefined}
                            >
                              Add
                            </Button>
                          )}
                        </div>
                      </div>

                      {inRoom && (
                        <AgentHeartbeatControls roomConversationId={props.roomConversationId} agentId={agentId} />
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </TabsContent>
        </Tabs>
    </div>
  )
}
