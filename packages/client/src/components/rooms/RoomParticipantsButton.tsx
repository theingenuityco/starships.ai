'use client'

import AgentAvatar from '@/components/animated/AgentAvatar'
import Icon from '@/components/primitives/Icon'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useStarshipMembersAndInvites, type StarshipMemberListItem } from '@/hooks/useStarshipMembers'
import { useStarshipAgents } from '@/hooks/useAgents'
import { useAuth } from '@/hooks/useAuth'
import api from '@/lib/api'
import { getSafeErrorMessage } from '@/lib/error-utils'
import { ROOM_QUERY_KEYS, useRoomParticipants } from '@/hooks/useRooms'
import { cn } from '@/lib/utils'
import { formatAgentDisplayName } from '@/lib/agentDisplay'
import type { AgentModel } from '@starships/protocol'
import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

function getHumanLabel(m: StarshipMemberListItem): { primary: string; secondary?: string } {
  const displayName = typeof m.displayName === 'string' ? m.displayName.trim() : ''
  const email = typeof m.email === 'string' ? m.email.trim() : ''
  const primary = displayName || email || 'Unknown member'
  const role = typeof m.role === 'string' ? m.role.trim() : ''
  const secondaryParts = [role ? role[0]?.toUpperCase() + role.slice(1) : null, displayName && email ? email : null].filter(Boolean) as string[]
  return { primary, secondary: secondaryParts.length ? secondaryParts.join(' · ') : undefined }
}

export function RoomParticipantsButton(props: {
  starshipId: string
  roomConversationId: string
  roomIsPrivate: boolean
  starshipOwnerId?: string | null
  className?: string
  /** Optional ref to the underlying trigger button (for programmatic open). */
  buttonRef?: React.Ref<HTMLButtonElement>
}) {
  const { user, isInstanceAdmin } = useAuth()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'humans' | 'agents'>('humans')
  const [search, setSearch] = useState('')

  const roomParticipants = useRoomParticipants(props.roomConversationId, open)
  const membersAndInvites = useStarshipMembersAndInvites(props.starshipId, open)
  const starshipAgents = useStarshipAgents(props.starshipId, open, { order: 'ASC' })

  const qc = useQueryClient()
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

  const canManagePrivateRoom = useMemo(() => {
    const uid = typeof user?.id === 'string' ? user.id : ''
    const ownerId = typeof props.starshipOwnerId === 'string' ? props.starshipOwnerId.trim() : ''
    return Boolean(isInstanceAdmin === true || (uid && ownerId && uid === ownerId))
  }, [isInstanceAdmin, props.starshipOwnerId, user?.id])

  const canAddHumans = props.roomIsPrivate ? canManagePrivateRoom : true
  const canRemoveHumans = props.roomIsPrivate ? canManagePrivateRoom : false
  const canAddAgents = props.roomIsPrivate ? canManagePrivateRoom : true
  const canRemoveAgents = props.roomIsPrivate ? canManagePrivateRoom : true

  const roomUserIdSet = useMemo(() => new Set((roomParticipants.data?.userIds ?? []).map(x => String(x))), [roomParticipants.data?.userIds])
  const roomAgentIdSet = useMemo(() => new Set((roomParticipants.data?.agentIds ?? []).map(x => String(x))), [roomParticipants.data?.agentIds])

  const q = search.trim().toLowerCase()

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

  const isBusy = addMember.isPending || removeMember.isPending || addAgent.isPending || removeAgent.isPending

  return (
    <>
      <Button ref={props.buttonRef as any} type="button" size="sm" variant="outline" onClick={() => setOpen(true)} className={props.className}>
        <Icon name="users" className="h-4 w-4 mr-1" />
        Participants
      </Button>

      <Dialog
        open={open}
        onOpenChange={next => {
          setOpen(next)
          if (!next) {
            setSearch('')
            setTab('humans')
          }
        }}
      >
        <DialogContent className="sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>Room participants</DialogTitle>
            <DialogDescription>
              {props.roomIsPrivate ? (
                <span className="text-muted-foreground">
                  This is a private room. Only the starship owner (or instance admin) can add/remove humans.
                </span>
              ) : (
                <span className="text-muted-foreground">Anyone in the room can add participants.</span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <Tabs value={tab} onValueChange={v => (v === 'humans' || v === 'agents' ? setTab(v) : null)}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <TabsList className="w-full sm:w-auto">
                  <TabsTrigger value="humans">Humans ({humanCountInRoom})</TabsTrigger>
                  <TabsTrigger value="agents">Agents ({agentCountInRoom})</TabsTrigger>
                </TabsList>
                <div className="w-full sm:w-64">
                  <div className="relative">
                    <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4 z-10 pointer-events-none" />
                    <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search" className="pl-9 h-9 py-1.5 text-[13px] rounded-2xl border-border/60 bg-card shadow-sm" />
                  </div>
                </div>
              </div>

              <TabsContent value="humans" className="mt-3">
                <div className="max-h-[50vh] overflow-y-auto pr-1 space-y-1">
                  {membersAndInvites.isLoading || roomParticipants.isLoading ? (
                    <div className="py-10 text-sm text-muted-foreground text-center">Loading…</div>
                  ) : humans.length === 0 ? (
                    <div className="py-10 text-sm text-muted-foreground text-center">{q ? `No matches for “${search.trim()}”.` : 'No members found.'}</div>
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
                        <div
                          key={`human:${userId}`}
                          className={cn('rounded-lg border border-border/60 bg-card px-3 py-2 flex items-center justify-between gap-3')}
                        >
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
                              <Button type="button" size="sm" disabled={!canAddThis || isBusy} onClick={() => addMember.mutate({ userId, role: 'member' })} title={!canAddThis ? 'No permission' : undefined}>
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

              <TabsContent value="agents" className="mt-3">
                <div className="max-h-[50vh] overflow-y-auto pr-1 space-y-1">
                  {starshipAgents.isLoading || roomParticipants.isLoading ? (
                    <div className="py-10 text-sm text-muted-foreground text-center">Loading…</div>
                  ) : agents.length === 0 ? (
                    <div className="py-10 text-sm text-muted-foreground text-center">{q ? `No matches for “${search.trim()}”.` : 'No agents found.'}</div>
                  ) : (
                    agents.map(a => {
                      const agentId = String(a.id || '').trim()
                      if (!agentId) return null
                      const label = formatAgentDisplayName(a) || 'Agent'
                      const inRoom = roomAgentIdSet.has(agentId)
                      const canRemoveThis = canRemoveAgents && inRoom
                      const canAddThis = canAddAgents && !inRoom
                      // AgentAvatar can use a seed; we don't have resolved attachment URLs here.
                      // Keep it stable and lightweight for this dialog.
                      return (
                        <div key={`agent:${agentId}`} className={cn('rounded-lg border border-border/60 bg-card px-3 py-2 flex items-center justify-between gap-3')}>
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
                              <Button type="button" size="sm" variant="outline" disabled={!canRemoveThis || isBusy} onClick={() => removeAgent.mutate(agentId)} title={!canRemoveThis ? 'No permission' : undefined}>
                                Remove
                              </Button>
                            ) : (
                              <Button type="button" size="sm" disabled={!canAddThis || isBusy} onClick={() => addAgent.mutate({ agentId })} title={!canAddThis ? 'No permission' : undefined}>
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
            </Tabs>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

