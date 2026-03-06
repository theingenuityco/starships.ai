'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { toast } from 'sonner'

import Icon from '@/components/primitives/Icon'
import { MobileNavToggleButton } from '@/components/navigation/MobileNavToggleButton'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { getCurrentToken } from '@/lib/api'
import { getSafeErrorMessage } from '@/lib/error-utils'
import { cn } from '@/lib/utils'

import { useStarshipBySlug } from '@/hooks/useStarships'
import { useCreateRoom, useDeleteRoom, useStarshipRooms, useUpdateRoom } from '@/hooks/useRooms'
import { useAuth } from '@/hooks/useAuth'
import type { RoomModel } from '@starships/protocol'

const ROOM_NAME_MAX = 100
const ROOM_SLUG_MAX = 100

function toRoomSlug(input: string): string {
  const s = String(input || '')
    .trim()
    .toLowerCase()
  if (!s) return ''

  const normalized = s
    .replace(/[\s._]+/g, '-')
    .replace(/[^a-z0-9-]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')

  if (normalized.length <= ROOM_SLUG_MAX) return normalized
  return normalized.slice(0, ROOM_SLUG_MAX).replace(/-+$/g, '')
}

function safeFilenameSegment(input: string): string {
  const raw = String(input || '').trim()
  const sanitized = raw.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '')
  return sanitized.length > 0 ? sanitized : 'export'
}

export default function RoomsIndexPage(): React.JSX.Element {
  const { slug: slugParam } = useParams<{ slug: string }>()
  const slug = typeof slugParam === 'string' ? slugParam : ''

  const { user, isInstanceAdmin } = useAuth()
  const { data: starship, isLoading: starshipLoading } = useStarshipBySlug(slug, Boolean(slug))
  const starshipId = starship?.id ? String(starship.id) : ''

  const canManageRooms = useMemo(() => {
    if (!starshipId) return false
    if (!user?.id) return false
    const ownerId = starship?.ownerId ? String(starship.ownerId) : ''
    return Boolean(isInstanceAdmin === true || (ownerId && String(ownerId) === String(user.id)))
  }, [isInstanceAdmin, starship?.ownerId, starshipId, user?.id])

  const { data: roomsData, isLoading: roomsLoading } = useStarshipRooms(starshipId, Boolean(starshipId))
  const rooms = (roomsData?.rooms || []) as RoomModel[]

  const sorted = useMemo(() => {
    const list = Array.isArray(rooms) ? rooms.slice() : []
    list.sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))
    return list
  }, [rooms])

  const createRoom = useCreateRoom(starshipId)
  const updateRoom = useUpdateRoom(starshipId)
  const deleteRoom = useDeleteRoom(starshipId)

  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createPrivate, setCreatePrivate] = useState(false)
  const [createTopic, setCreateTopic] = useState('')

  const createSlug = useMemo(() => toRoomSlug(createName), [createName])
  const createNameLength = createName.length
  const canCreate =
    canManageRooms &&
    !createRoom.isPending &&
    createName.trim().length > 0 &&
    createName === createName.trim() &&
    createNameLength <= ROOM_NAME_MAX &&
    createSlug.length > 0

  const [editRoomTarget, setEditRoomTarget] = useState<RoomModel | null>(null)
  const [editName, setEditName] = useState('')
  const [editPrivate, setEditPrivate] = useState(false)
  const [editTopic, setEditTopic] = useState('')
  const editNameLength = editName.length
  const canSaveEdit =
    canManageRooms &&
    Boolean(editRoomTarget?.conversationId) &&
    !updateRoom.isPending &&
    editName.trim().length > 0 &&
    editName === editName.trim() &&
    editNameLength <= ROOM_NAME_MAX

  const [deleteRoomTarget, setDeleteRoomTarget] = useState<RoomModel | null>(null)
  const [exportingRoomId, setExportingRoomId] = useState<string | null>(null)

  const openEdit = (r: RoomModel) => {
    setEditRoomTarget(r)
    setEditName(String(r.name || ''))
    setEditPrivate(Boolean(r.isPrivate))
    setEditTopic(typeof r.topic === 'string' ? String(r.topic) : '')
  }

  const closeEdit = () => {
    setEditRoomTarget(null)
    setEditName('')
    setEditPrivate(false)
    setEditTopic('')
  }

  return (
    <div className="relative flex flex-col min-h-full min-w-0">
      <div className="sticky top-0 z-10 border-b border-border/60 bg-card">
        <div className="px-4 pt-3.5 pb-2 md:py-2">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
              <div className="flex min-w-0 w-full gap-2 items-center">
                <span className="flex-shrink-0 self-center md:hidden">
                  <MobileNavToggleButton className="mx-2" />
                </span>
                <div className="min-w-0 flex-1 flex flex-col justify-center gap-1">
                  <div className="flex items-baseline gap-2 min-w-0 w-full">
                    <span aria-hidden="true" className="flex-shrink-0 self-center text-foreground leading-none">
                      <Icon name="hash" weight="bold" className="h-4 w-4" />
                    </span>
                    <h3 className="flex-1 text-base font-medium text-foreground truncate leading-tight min-w-0">Rooms</h3>
                  </div>
                  <div className="min-w-0 text-xs leading-snug text-muted-foreground min-h-6">
                    <span className="block min-w-0 truncate font-medium leading-snug text-muted-foreground">Forum-style spaces for threads and pins.</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCreateOpen(true)}
                disabled={!canManageRooms || !starshipId || createRoom.isPending}
                title={!canManageRooms ? 'Only the starship owner (or instance admin) can manage rooms' : undefined}
              >
                <Icon name="plus" className="h-4 w-4 mr-1.5" />
                New room
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-visible md:overflow-y-auto px-4 pt-6 pb-8 md:pb-8">
        <div className="w-full bg-transparent max-w-4xl mx-auto min-h-full flex flex-col gap-4">
          {starshipLoading ? (
            <div className="flex items-center justify-center py-10">
              <p className="text-sm text-muted-foreground">Loading…</p>
            </div>
          ) : !starshipId ? (
            <div className="flex items-center justify-center py-10">
              <p className="text-sm text-muted-foreground">No starship selected.</p>
            </div>
          ) : roomsLoading ? (
            <div className="grid grid-cols-1 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-28 rounded-xl border border-border/60 bg-card animate-pulse" />
              ))}
            </div>
          ) : sorted.length === 0 ? (
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="text-base">No rooms yet</CardTitle>
                <CardDescription>Create a room to organize threads and pin resources.</CardDescription>
              </CardHeader>
              <CardContent className="pt-0 flex flex-col sm:flex-row gap-2">
                <Button onClick={() => setCreateOpen(true)} disabled={!canManageRooms || createRoom.isPending} variant="outline">
                  <Icon name="plus" className="h-4 w-4 mr-1.5" />
                  New room
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {sorted.map((r) => {
                const roomSlug = String(r.slug || '').trim()
                const href = roomSlug ? `/ship/${encodeURIComponent(slug)}/rooms/${encodeURIComponent(roomSlug)}` : null
                const isExporting = exportingRoomId === String(r.conversationId)
                return (
                  <Card key={String(r.conversationId)} className={cn('border-border/60 hover:shadow-sm transition-shadow')}>
                    <CardHeader className="pb-4">
                      <CardTitle className="text-base flex items-center justify-between gap-2">
                        {href ? (
                          <Link href={href} className="truncate hover:underline underline-offset-2">
                            {r.name || r.slug}
                          </Link>
                        ) : (
                          <span className="truncate">{r.name || r.slug}</span>
                        )}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {r.isPrivate ? <Icon name="lock" weight="fill" className="h-3.5 w-3.5 text-muted-foreground" /> : null}
                          <code className="text-[11px] font-mono text-muted-foreground">{r.slug}</code>
                        </div>
                      </CardTitle>
                      <CardDescription className="text-sm">{r.topic ? String(r.topic) : '—'}</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0 flex items-center justify-between gap-2">
                      <div className="text-xs text-muted-foreground truncate">
                        Backed by conversation <code className="font-mono">{String(r.conversationId).slice(0, 8)}</code>
                      </div>
                      <div className="flex items-center gap-2">
                        {canManageRooms ? (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={isExporting}
                              onClick={async () => {
                                const roomId = String(r.conversationId || '').trim()
                                if (!roomId) return
                                setExportingRoomId(roomId)
                                try {
                                  const token = await getCurrentToken()
                                  const res = await fetch(`/api/v1/rooms/${encodeURIComponent(roomId)}/export-bundle`, {
                                    method: 'GET',
                                    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
                                  })

                                  if (!res.ok) {
                                    throw new Error(`Export failed (${res.status})`)
                                  }

                                  const blob = await res.blob()
                                  const contentDisposition = res.headers.get('content-disposition') || ''
                                  const filenameMatch = /filename\*?=(?:UTF-8''|")?([^\";]+)"?/i.exec(contentDisposition)
                                  const fallbackName = `${safeFilenameSegment(`room-bundle-${roomSlug || roomId}`)}.zip`
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
                                  setExportingRoomId(prev => (prev === roomId ? null : prev))
                                }
                              }}
                            >
                              <Icon name="download" className="h-4 w-4 mr-1.5" />
                              {isExporting ? 'Exporting…' : 'Export'}
                            </Button>
                            <Button type="button" variant="outline" size="sm" onClick={() => openEdit(r)}>
                              <Icon name="edit" className="h-4 w-4 mr-1.5" />
                              Edit
                            </Button>
                            <Button type="button" variant="destructive" size="sm" onClick={() => setDeleteRoomTarget(r)} disabled={deleteRoom.isPending}>
                              <Icon name="trash" className="h-4 w-4 mr-1.5" />
                              Delete
                            </Button>
                          </>
                        ) : null}
                        <Button asChild variant="outline" size="sm" disabled={!href}>
                          <Link href={href || '#'}>
                            Open
                            <Icon name="chevron-right" className="h-4 w-4 ml-1.5" />
                          </Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Create */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open)
          if (!open) {
            setCreateName('')
            setCreatePrivate(false)
            setCreateTopic('')
          }
        }}
      >
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Create room</DialogTitle>
            <DialogDescription>Create a room (forum-style container) for threads and pins.</DialogDescription>
          </DialogHeader>

          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault()
              e.stopPropagation()
              if (!canCreate) return
              await createRoom.mutateAsync({
                slug: createSlug,
                name: createName,
                isPrivate: createPrivate,
                topic: createTopic.trim().length > 0 ? createTopic.trim() : null,
              })
              setCreateOpen(false)
              setCreateName('')
              setCreatePrivate(false)
              setCreateTopic('')
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="room-name">Name</Label>
              <Input
                id="room-name"
                placeholder="Example"
                value={createName}
                onChange={(e) => setCreateName(String(e.target.value || ''))}
              />
              <div className="flex items-center justify-between gap-2">
                <p className={cn('text-xs', createNameLength > ROOM_NAME_MAX ? 'text-destructive' : 'text-muted-foreground')}>
                  {createNameLength}/{ROOM_NAME_MAX}
                </p>
                {createName !== createName.trim() ? <p className="text-xs text-destructive">Name must not have leading/trailing whitespace.</p> : null}
                {createNameLength > ROOM_NAME_MAX ? <p className="text-xs text-destructive">Name must be {ROOM_NAME_MAX} characters or fewer.</p> : null}
                {createName.trim().length > 0 && createSlug.length === 0 ? <p className="text-xs text-destructive">Name must include at least one letter or number.</p> : null}
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="room-slug">Slug</Label>
              <Input id="room-slug" value={createSlug || '-'} readOnly disabled />
            </div>

            <div className="space-y-1">
              <Label htmlFor="room-topic">Topic (optional)</Label>
              <Textarea
                id="room-topic"
                placeholder="What’s this room for?"
                value={createTopic}
                onChange={(e) => setCreateTopic(String(e.target.value || ''))}
                rows={3}
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <Label htmlFor="room-private">Private</Label>
                <p className="text-xs text-muted-foreground">Only explicitly added members can read/write.</p>
              </div>
              <Switch id="room-private" checked={createPrivate} onCheckedChange={setCreatePrivate} />
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)} disabled={createRoom.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={!canCreate}>
                {createRoom.isPending ? 'Creating…' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit */}
      <Dialog
        open={Boolean(editRoomTarget)}
        onOpenChange={(open) => {
          if (!open) closeEdit()
        }}
      >
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Edit room</DialogTitle>
            <DialogDescription>Update this room’s settings.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="edit-room-name">Name</Label>
              <Input id="edit-room-name" value={editName} onChange={(e) => setEditName(String(e.target.value || ''))} />
              <div className="flex items-center justify-between gap-2">
                <p className={cn('text-xs', editNameLength > ROOM_NAME_MAX ? 'text-destructive' : 'text-muted-foreground')}>
                  {editNameLength}/{ROOM_NAME_MAX}
                </p>
                {editName !== editName.trim() ? <p className="text-xs text-destructive">Name must not have leading/trailing whitespace.</p> : null}
                {editNameLength > ROOM_NAME_MAX ? <p className="text-xs text-destructive">Name must be {ROOM_NAME_MAX} characters or fewer.</p> : null}
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="edit-room-slug">Slug</Label>
              <Input id="edit-room-slug" value={String(editRoomTarget?.slug || '')} readOnly disabled />
            </div>

            <div className="space-y-1">
              <Label htmlFor="edit-room-topic">Topic (optional)</Label>
              <Textarea id="edit-room-topic" value={editTopic} onChange={(e) => setEditTopic(String(e.target.value || ''))} rows={3} />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <Label htmlFor="edit-room-private">Private</Label>
                <p className="text-xs text-muted-foreground">Only explicitly added members can read/write.</p>
              </div>
              <Switch id="edit-room-private" checked={editPrivate} onCheckedChange={setEditPrivate} />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={closeEdit} disabled={updateRoom.isPending}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!canSaveEdit}
              onClick={async () => {
                const target = editRoomTarget
                if (!target?.conversationId) return
                await updateRoom.mutateAsync({
                  roomId: String(target.conversationId),
                  name: editName,
                  isPrivate: editPrivate,
                  topic: editTopic.trim().length > 0 ? editTopic.trim() : null,
                })
                closeEdit()
              }}
            >
              {updateRoom.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <Dialog
        open={Boolean(deleteRoomTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteRoomTarget(null)
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete room</DialogTitle>
            <DialogDescription>This will permanently delete the room and its conversation history.</DialogDescription>
          </DialogHeader>

          <div className="text-sm">
            <p className="text-foreground">
              Delete <span className="font-semibold">#{String(deleteRoomTarget?.slug || '').trim() || 'room'}</span>?
            </p>
            <p className="text-xs text-muted-foreground mt-2">This can’t be undone.</p>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => setDeleteRoomTarget(null)} disabled={deleteRoom.isPending}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!deleteRoomTarget?.conversationId || deleteRoom.isPending}
              onClick={async () => {
                const target = deleteRoomTarget
                if (!target?.conversationId) return
                await deleteRoom.mutateAsync(String(target.conversationId))
                setDeleteRoomTarget(null)
              }}
            >
              {deleteRoom.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

