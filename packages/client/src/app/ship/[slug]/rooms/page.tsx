'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'

import Icon from '@/components/primitives/Icon'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { WizardStepper } from '@/components/marketplace/WizardStepper'
import { BundleServiceModal } from '@/components/bundles/BundleServiceModal'
import { getCurrentToken } from '@/lib/api'
import { getSafeErrorMessage } from '@/lib/error-utils'
import { cn } from '@/lib/utils'

import { useStarshipBySlug } from '@/hooks/useStarships'
import { useCreateRoom, useDeleteRoom, useStarshipRooms, useUpdateRoom } from '@/hooks/useRooms'
import { useAuth } from '@/hooks/useAuth'
import type { RoomModel } from '@starships/protocol'

const ROOM_NAME_MAX = 100

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

export default function RoomsIndexPage(): React.JSX.Element {
  const { slug: slugParam } = useParams<{ slug: string }>()
  const slug = typeof slugParam === 'string' ? slugParam : ''

  const queryClient = useQueryClient()
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

  const [bundlesOpen, setBundlesOpen] = useState(false)

  // Import bundle (room + resources)
  const [importOpen, setImportOpen] = useState(false)
  const [importStep, setImportStep] = useState<ImportWizardStep>(1)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [isAnalyzingImport, setIsAnalyzingImport] = useState(false)
  const [isApplyingImport, setIsApplyingImport] = useState(false)
  const [importAnalysis, setImportAnalysis] = useState<any | null>(null)
  const [importDecisions, setImportDecisions] = useState<any>({
    rooms: {},
    views: {},
    datasets: {},
    taskBoards: {},
    tools: {},
    agents: {},
  })

  const analyzeImportRoomBundle = async (): Promise<boolean> => {
    if (!importFile || !starshipId) return false
    setIsAnalyzingImport(true)
    try {
      const token = await getCurrentToken()
      const fd = new FormData()
      fd.append('file', importFile)
      const res = await fetch(`/api/v1/starships/${encodeURIComponent(starshipId)}/import-room-bundle/analyze`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: fd,
      })
      if (!res.ok) throw new Error(`Analyze failed (${res.status})`)
      const json = await res.json()
      const data = json?.data ?? json
      setImportAnalysis(data)

      const nextDecisions: any = { rooms: {}, views: {}, datasets: {}, taskBoards: {}, tools: {}, agents: {} }
      for (const x of (data?.rooms ?? []) as any[]) {
        const status = x?.status
        const action: 'skip' | 'copy' | 'overwrite' = status === 'same' ? 'skip' : 'copy'
        nextDecisions.rooms[String(x.bundleHash)] = { action, targetId: x?.existing?.conversationId }
      }
      for (const x of (data?.views ?? []) as any[]) {
        const status = x?.status
        const action: 'skip' | 'copy' | 'overwrite' = status === 'same' ? 'skip' : 'copy'
        nextDecisions.views[String(x.bundleHash)] = { action, targetId: x?.existing?.id }
      }
      for (const x of (data?.datasets ?? []) as any[]) {
        const status = x?.status
        const action: 'skip' | 'copy' | 'overwrite' = status === 'same' ? 'skip' : 'copy'
        nextDecisions.datasets[String(x.bundleHash)] = { action, targetId: x?.existing?.id }
      }
      for (const x of (data?.taskBoards ?? []) as any[]) {
        const status = x?.status
        const action: 'skip' | 'copy' | 'overwrite' = status === 'same' ? 'skip' : 'copy'
        nextDecisions.taskBoards[String(x.bundleHash)] = { action, targetId: x?.existing?.id }
      }
      for (const x of (data?.tools ?? []) as any[]) {
        const status = x?.status
        const action: 'skip' | 'copy' | 'overwrite' = status === 'same' ? 'skip' : 'copy'
        nextDecisions.tools[String(x.bundleHash)] = { action, targetId: x?.existing?.id }
      }
      for (const x of (data?.agents ?? []) as any[]) {
        const status = x?.status
        const action: 'skip' | 'copy' | 'overwrite' = status === 'same' ? 'skip' : 'copy'
        nextDecisions.agents[String(x.bundleHash)] = { action, targetId: x?.existing?.id }
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

  const applyImportRoomBundle = async (): Promise<boolean> => {
    if (!importFile || !starshipId || !importAnalysis) return false
    setIsApplyingImport(true)
    try {
      const token = await getCurrentToken()
      const fd = new FormData()
      fd.append('file', importFile)
      fd.append('decisions', JSON.stringify(importDecisions))
      const res = await fetch(`/api/v1/starships/${encodeURIComponent(starshipId)}/import-room-bundle/apply`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: fd,
      })
      if (!res.ok) throw new Error(`Import failed (${res.status})`)
      const json = await res.json()
      const data = json?.data ?? json
      const importedRooms = Number(data?.imported?.rooms ?? 0)
      const importedViews = Number(data?.imported?.views ?? 0)
      const importedDatasets = Number(data?.imported?.datasets ?? 0)
      const importedBoards = Number(data?.imported?.taskBoards ?? 0)
      const importedAgents = Number(data?.imported?.agents ?? 0)
      const importedTools = Number(data?.imported?.tools ?? 0)
      const warnings = Array.isArray(data?.warnings) ? (data.warnings as unknown[]).length : 0

      // Fire-and-forget invalidation; do not await (keeps modal responsive).
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      queryClient.invalidateQueries({ queryKey: ['agents'] })
      queryClient.invalidateQueries({ queryKey: ['tools'] })
      queryClient.invalidateQueries({ queryKey: ['views'] })
      queryClient.invalidateQueries({ queryKey: ['datasets'] })
      queryClient.invalidateQueries({ queryKey: ['task-boards'] })
      toast.success('Import complete', {
        description: `${importedRooms} room(s), ${importedViews} view(s), ${importedDatasets} dataset(s), ${importedBoards} task board(s), ${importedAgents} agent(s), ${importedTools} tool(s) imported${warnings ? ` · ${warnings} warning(s)` : ''}.`,
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

  const canGoNextImport = useMemo(() => {
    if (importStep === 1) return Boolean(importFile && starshipId)
    if (importStep === 2) return Boolean(importAnalysis && !isAnalyzingImport)
    return false
  }, [importAnalysis, importFile, importStep, isAnalyzingImport, starshipId])

  const handleImportNext = async () => {
    if (importStep === 1) {
      if (!importFile || !starshipId) return
      setImportStep(2)
      const ok = await analyzeImportRoomBundle()
      if (!ok) setImportStep(1)
      return
    }
    if (importStep === 2) {
      if (!importAnalysis) return
      setImportStep(3)
      return
    }
    await applyImportRoomBundle()
  }

  const handleImportBack = () => {
    if (importStep === 2) setImportStep(1)
    if (importStep === 3) setImportStep(2)
  }

  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createPrivate, setCreatePrivate] = useState(false)
  const [createTopic, setCreateTopic] = useState('')
  const createNameLength = createName.length
  const canCreate = canManageRooms && !createRoom.isPending && createName.trim().length > 0 && createName === createName.trim() && createNameLength <= ROOM_NAME_MAX

  const [editRoomTarget, setEditRoomTarget] = useState<RoomModel | null>(null)
  const [editName, setEditName] = useState('')
  const [editPrivate, setEditPrivate] = useState(false)
  const [editTopic, setEditTopic] = useState('')
  const editNameLength = editName.length
  const canSaveEdit =
    canManageRooms && Boolean(editRoomTarget?.conversationId) && !updateRoom.isPending && editName.trim().length > 0 && editName === editName.trim() && editNameLength <= ROOM_NAME_MAX

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
      <PageHeader
        icon="hash"
        title="Rooms"
        actions={
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 px-0 text-muted-foreground hover:text-foreground"
              aria-label="New room"
              title={!canManageRooms ? 'Only the starship owner (or instance admin) can manage rooms' : 'New room'}
              onClick={() => setCreateOpen(true)}
              disabled={!canManageRooms || !starshipId || createRoom.isPending}
            >
              <Icon name="plus" className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 px-0 text-muted-foreground hover:text-foreground"
              aria-label="Browse bundles"
              title={!canManageRooms ? 'Only the starship owner (or instance admin) can install bundles' : 'Browse bundles'}
              onClick={() => setBundlesOpen(true)}
              disabled={!canManageRooms || !starshipId}
            >
              <Icon name="download" className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 px-0 text-muted-foreground hover:text-foreground"
              aria-label="Import bundle"
              title={!canManageRooms ? 'Only the starship owner (or instance admin) can import rooms' : 'Import bundle'}
              onClick={() => {
                setImportOpen(true)
                setImportStep(1)
                setImportFile(null)
                setImportAnalysis(null)
                setImportDecisions({ rooms: {}, views: {}, datasets: {}, taskBoards: {}, tools: {}, agents: {} })
              }}
              disabled={!canManageRooms || !starshipId}
            >
              <Icon name="upload" className="h-4 w-4" />
            </Button>
          </>
        }
      />

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
              {sorted.map(r => {
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

      <BundleServiceModal
        open={bundlesOpen}
        onOpenChange={setBundlesOpen}
        starshipId={starshipId}
        kindFilter={['room']}
        title="Browse room bundles"
        description="Install pre-built rooms with agents, datasets, and task boards from the bundle service."
      />

      {/* Create */}
      <Dialog
        open={createOpen}
        onOpenChange={open => {
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
            onSubmit={async e => {
              e.preventDefault()
              e.stopPropagation()
              if (!canCreate) return
              await createRoom.mutateAsync({
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
              <Input id="room-name" placeholder="Example" value={createName} onChange={e => setCreateName(String(e.target.value || ''))} />
              <div className="flex items-center justify-between gap-2">
                <p className={cn('text-xs', createNameLength > ROOM_NAME_MAX ? 'text-destructive' : 'text-muted-foreground')}>
                  {createNameLength}/{ROOM_NAME_MAX}
                </p>
                {createName !== createName.trim() ? <p className="text-xs text-destructive">Name must not have leading/trailing whitespace.</p> : null}
                {createNameLength > ROOM_NAME_MAX ? <p className="text-xs text-destructive">Name must be {ROOM_NAME_MAX} characters or fewer.</p> : null}
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="room-topic">Topic (optional)</Label>
              <Textarea id="room-topic" placeholder="What’s this room for?" value={createTopic} onChange={e => setCreateTopic(String(e.target.value || ''))} rows={3} />
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

      {/* Import bundle */}
      <Dialog
        open={importOpen}
        onOpenChange={open => {
          setImportOpen(open)
          if (!open) {
            setImportStep(1)
            setImportFile(null)
            setImportAnalysis(null)
            setImportDecisions({ rooms: {}, views: {}, datasets: {}, taskBoards: {}, tools: {}, agents: {} })
          }
        }}
      >
        <DialogContent className="flex flex-col w-[calc(100vw-2rem)] max-w-3xl h-[80vh] overflow-hidden p-0">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <DialogHeader className="shrink-0 px-6 pt-6 pb-6 space-y-6">
              <DialogTitle>Import room bundle</DialogTitle>
              <DialogDescription>Upload a bundle exported from Rooms → Export.</DialogDescription>
              <div>
                <WizardStepper currentStep={importStep} steps={IMPORT_WIZARD_STEPS} />
              </div>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              {importStep === 1 ? (
                <div className="space-y-4">
                  <div className="text-sm font-semibold">Choose a bundle to import</div>
                  <div className="space-y-2 max-w-xl">
                    <Label htmlFor="room-bundle-file">Bundle (.zip)</Label>
                    <Input
                      id="room-bundle-file"
                      type="file"
                      accept=".zip,application/zip"
                      disabled={isAnalyzingImport || isApplyingImport}
                      onChange={e => {
                        const f = e.target.files?.[0] ?? null
                        setImportFile(f)
                        setImportAnalysis(null)
                        setImportDecisions({ rooms: {}, views: {}, datasets: {}, taskBoards: {}, tools: {}, agents: {} })
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
                    <div className="space-y-6">
                      {(
                        [
                          { key: 'rooms', label: 'Rooms', allowOverwrite: false },
                          { key: 'views', label: 'Views', allowOverwrite: true },
                          { key: 'datasets', label: 'Datasets', allowOverwrite: true },
                          { key: 'taskBoards', label: 'Task boards', allowOverwrite: false },
                          { key: 'tools', label: 'Tools', allowOverwrite: true },
                          { key: 'agents', label: 'Agents', allowOverwrite: true },
                        ] as const
                      ).map(section => {
                        const items = (importAnalysis?.[section.key] ?? []) as any[]
                        return (
                          <div key={section.key}>
                            <div className="flex items-center justify-between">
                              <div className="text-sm font-semibold text-foreground">{section.label}</div>
                              <div className="text-xs text-muted-foreground">{items.length} in bundle</div>
                            </div>
                            <div className="mt-3 space-y-2">
                              {items.map(x => {
                                const decision = importDecisions?.[section.key]?.[x.bundleHash] ?? {
                                  action: x.status === 'same' ? ('skip' as const) : ('copy' as const),
                                  targetId: x.existing?.id,
                                }
                                const badge =
                                  x.status === 'same'
                                    ? { label: 'Same', className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' }
                                    : x.status === 'conflict'
                                      ? { label: 'Conflict', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' }
                                      : { label: 'New', className: 'bg-muted text-muted-foreground' }
                                return (
                                  <div key={x.bundleHash} className="rounded-lg border border-border/60 bg-card px-3 py-2 flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2 min-w-0">
                                        <span className={cn('text-[11px] px-2 py-0.5 rounded-full font-medium', badge.className)}>{badge.label}</span>
                                        <span className="text-sm font-medium text-foreground truncate">{x.name}</span>
                                      </div>
                                      {x.existing ? (
                                        <div className="mt-1 text-xs text-muted-foreground truncate">
                                          Existing: {x.existing.name} {x.existing.slug ? `(${x.existing.slug})` : null}
                                        </div>
                                      ) : null}
                                    </div>
                                    <select
                                      className="h-8 rounded-md border border-border/60 bg-background px-2 text-sm"
                                      disabled={isApplyingImport || section.key === 'rooms'}
                                      value={decision.action}
                                      onChange={e => {
                                        const action = e.target.value as 'skip' | 'copy' | 'overwrite'
                                        setImportDecisions((prev: any) => ({
                                          ...prev,
                                          [section.key]: {
                                            ...(prev?.[section.key] ?? {}),
                                            [x.bundleHash]: { action, targetId: x.existing?.id },
                                          },
                                        }))
                                      }}
                                    >
                                      <option value="skip">Skip</option>
                                      <option value="copy">Import copy</option>
                                      <option value="overwrite" disabled={!section.allowOverwrite || !x.existing}>
                                        Overwrite existing
                                      </option>
                                    </select>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
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
                  <div className="text-sm font-semibold">Ready to upload</div>
                  <div className="rounded-lg border border-border/60 bg-card/10 p-3">
                    <div className="text-sm font-semibold text-foreground">Press Upload to import using the decisions you selected.</div>
                    <div className="mt-1 text-xs text-muted-foreground">This will create any new rooms/resources and apply your selected conflict resolutions.</div>
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
                  <Button type="button" onClick={handleImportNext} disabled={isAnalyzingImport || isApplyingImport || !importFile || !starshipId || !importAnalysis} className="min-w-[140px]">
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

      {/* Edit */}
      <Dialog
        open={Boolean(editRoomTarget)}
        onOpenChange={open => {
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
              <Input id="edit-room-name" value={editName} onChange={e => setEditName(String(e.target.value || ''))} />
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
              <Textarea id="edit-room-topic" value={editTopic} onChange={e => setEditTopic(String(e.target.value || ''))} rows={3} />
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
        onOpenChange={open => {
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
