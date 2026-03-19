'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'

import { PageLayout } from '@/components/layout/PageLayout'
import Icon from '@/components/primitives/Icon'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { WizardStepper } from '@/components/marketplace/WizardStepper'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

import { useAuth } from '@/hooks/useAuth'
import { useUserStarships, orderStarshipsOwnedFirst } from '@/hooks/useStarships'
import { getCurrentToken } from '@/lib/api'
import { getSafeErrorMessage } from '@/lib/error-utils'
import { cn } from '@/lib/utils'

type RegistryBundleKind = 'agent_bundle' | 'room_bundle'
type RegistryVisibility = 'private' | 'public'

type RegistryBundle = {
  id: string
  slug: string
  displayName: string
  description: string
  kind: RegistryBundleKind
  visibility: RegistryVisibility
  createdAt: string
  createdByUserId: string | null
}

type RegistryBundleVersion = {
  id: string
  bundleId: string
  version: string
  createdAt: string
  bundleHash: string
  artifactSize: number
  agentsCount: number
  toolsCount: number
  roomsCount: number
  viewsCount: number
  datasetsCount: number
  taskBoardsCount: number
}

type InstallWizardStep = 1 | 2 | 3
type InstallWizardStepMeta = { id: InstallWizardStep; label: string; subtitle: string }
const INSTALL_WIZARD_STEPS: InstallWizardStepMeta[] = [
  { id: 1, label: 'Choose target', subtitle: 'Select a destination starship' },
  { id: 2, label: 'Analyze', subtitle: 'Review changes & resolve conflicts' },
  { id: 3, label: 'Install', subtitle: 'Confirm & apply' },
]

function safeFilenameSegment(input: string): string {
  const raw = String(input || '').trim()
  const sanitized = raw.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '')
  return sanitized.length > 0 ? sanitized : 'bundle'
}

async function authedFetch(input: string, init?: RequestInit): Promise<Response> {
  const token = await getCurrentToken()
  const headers: Record<string, string> = { ...(init?.headers as any) }
  if (token) headers.Authorization = `Bearer ${token}`
  return fetch(input, { ...init, headers })
}

export default function AdminBundlesPage(): React.JSX.Element {
  const { isAuthenticated, isInstanceAdmin, user } = useAuth()

  // Starships for install target (owner list; instance admins may have more, but this is a safe first cut)
  const { data: userStarships = [] } = useUserStarships(user?.id ? String(user.id) : '', Boolean(user?.id))
  const orderedStarships = useMemo(() => orderStarshipsOwnedFirst(userStarships, user?.id ? String(user.id) : null), [user?.id, userStarships])

  const [bundles, setBundles] = useState<RegistryBundle[]>([])
  const [selectedBundleId, setSelectedBundleId] = useState<string | null>(null)
  const selectedBundle = useMemo(() => bundles.find(b => b.id === selectedBundleId) ?? null, [bundles, selectedBundleId])

  const [versions, setVersions] = useState<RegistryBundleVersion[]>([])
  const [loadingBundles, setLoadingBundles] = useState(false)
  const [loadingVersions, setLoadingVersions] = useState(false)

  // Create bundle dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [createSlug, setCreateSlug] = useState('')
  const [createName, setCreateName] = useState('')
  const [createDesc, setCreateDesc] = useState('')
  const [createKind, setCreateKind] = useState<RegistryBundleKind>('agent_bundle')
  const [createVisibility, setCreateVisibility] = useState<RegistryVisibility>('private')
  const [creating, setCreating] = useState(false)

  // Publish version dialog (upload from file)
  const [publishOpen, setPublishOpen] = useState(false)
  const [publishVersion, setPublishVersion] = useState('1.0.0')
  const [publishFile, setPublishFile] = useState<File | null>(null)
  const [publishing, setPublishing] = useState(false)

  // Install wizard dialog
  const [installOpen, setInstallOpen] = useState(false)
  const [installStep, setInstallStep] = useState<InstallWizardStep>(1)
  const [installTargetStarshipId, setInstallTargetStarshipId] = useState<string>('')
  const [installTargetVersion, setInstallTargetVersion] = useState<RegistryBundleVersion | null>(null)
  const [installAnalyzing, setInstallAnalyzing] = useState(false)
  const [installApplying, setInstallApplying] = useState(false)
  const [installAnalysis, setInstallAnalysis] = useState<any | null>(null)
  const [installDecisions, setInstallDecisions] = useState<any>(null)

  const setInstallDecision = (section: string, bundleHash: string, nextAction: 'skip' | 'copy' | 'overwrite', targetId?: string) => {
    setInstallDecisions((prev: any) => {
      const base = prev && typeof prev === 'object' ? prev : {}
      const sectionBase = base[section] && typeof base[section] === 'object' ? base[section] : {}
      return {
        ...base,
        [section]: {
          ...sectionBase,
          [bundleHash]: { action: nextAction, ...(targetId ? { targetId } : {}) },
        },
      }
    })
  }

  const getInstallDecision = (section: string, bundleHash: string): { action?: string; targetId?: string } => {
    const base = installDecisions && typeof installDecisions === 'object' ? installDecisions : {}
    const sectionBase = base?.[section] && typeof base?.[section] === 'object' ? base[section] : {}
    const v = sectionBase?.[bundleHash]
    return v && typeof v === 'object' ? (v as any) : {}
  }

  const refreshBundles = async (): Promise<void> => {
    setLoadingBundles(true)
    try {
      const res = await authedFetch('/api/v1/registry/bundles')
      if (!res.ok) throw new Error(`Failed (${res.status})`)
      const json = await res.json()
      setBundles((json?.data?.bundles ?? []) as RegistryBundle[])
    } catch (e) {
      toast.error('Failed to load bundles', { description: getSafeErrorMessage(e) })
    } finally {
      setLoadingBundles(false)
    }
  }

  const refreshVersions = async (bundleId: string): Promise<void> => {
    setLoadingVersions(true)
    try {
      const res = await authedFetch(`/api/v1/registry/bundles/${encodeURIComponent(bundleId)}/versions`)
      if (!res.ok) throw new Error(`Failed (${res.status})`)
      const json = await res.json()
      setVersions((json?.data?.versions ?? []) as RegistryBundleVersion[])
    } catch (e) {
      toast.error('Failed to load versions', { description: getSafeErrorMessage(e) })
    } finally {
      setLoadingVersions(false)
    }
  }

  useEffect(() => {
    if (!isAuthenticated || !isInstanceAdmin) return
    refreshBundles()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, isInstanceAdmin])

  useEffect(() => {
    if (!selectedBundleId) {
      setVersions([])
      return
    }
    refreshVersions(selectedBundleId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBundleId])

  const handleCreateBundle = async (): Promise<void> => {
    if (!createSlug.trim() || !createName.trim()) return
    setCreating(true)
    try {
      const res = await authedFetch('/api/v1/registry/bundles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: createSlug.trim(),
          displayName: createName.trim(),
          description: createDesc.trim(),
          kind: createKind,
          visibility: createVisibility,
        }),
      })
      if (!res.ok) throw new Error(`Create failed (${res.status})`)
      const json = await res.json()
      const created = json?.data?.bundle as RegistryBundle | undefined
      toast.success('Bundle created', { description: created?.slug ? `Created “${created.slug}”.` : undefined })
      setCreateOpen(false)
      setCreateSlug('')
      setCreateName('')
      setCreateDesc('')
      await refreshBundles()
      if (created?.id) setSelectedBundleId(created.id)
    } catch (e) {
      toast.error('Create failed', { description: getSafeErrorMessage(e) })
    } finally {
      setCreating(false)
    }
  }

  const handlePublishVersion = async (): Promise<void> => {
    if (!selectedBundleId || !publishFile || !publishVersion.trim()) return
    setPublishing(true)
    try {
      const initRes = await authedFetch(
        `/api/v1/registry/bundles/${encodeURIComponent(selectedBundleId)}/versions/upload/init?version=${encodeURIComponent(publishVersion.trim())}&contentType=${encodeURIComponent('application/zip')}`,
        { method: 'POST' }
      )
      if (!initRes.ok) throw new Error(`Init failed (${initRes.status})`)
      const initJson = await initRes.json()
      const upload = initJson?.data?.upload
      const uploadUrl = String(upload?.uploadUrl || '')
      const s3Key = String(upload?.s3Key || '')
      const requiredContentType = String(upload?.requiredHeaders?.['Content-Type'] || 'application/zip')
      if (!uploadUrl || !s3Key) throw new Error('Upload init returned no URL/key')

      const putRes = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': requiredContentType }, body: publishFile })
      if (!putRes.ok) throw new Error(`S3 upload failed (${putRes.status})`)

      const completeRes = await authedFetch(`/api/v1/registry/bundles/${encodeURIComponent(selectedBundleId)}/versions/upload/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: publishVersion.trim(), s3Key, artifactSizeBytes: publishFile.size }),
      })
      if (!completeRes.ok) throw new Error(`Complete failed (${completeRes.status})`)
      toast.success('Version published', { description: `Published ${publishVersion.trim()}.` })
      setPublishOpen(false)
      setPublishFile(null)
      await refreshVersions(selectedBundleId)
    } catch (e) {
      toast.error('Publish failed', { description: getSafeErrorMessage(e) })
    } finally {
      setPublishing(false)
    }
  }

  const startInstallWizard = (v: RegistryBundleVersion) => {
    setInstallTargetVersion(v)
    setInstallOpen(true)
    setInstallStep(1)
    setInstallAnalysis(null)
    setInstallDecisions(null)
    setInstallApplying(false)
    setInstallAnalyzing(false)
    // pick a reasonable default
    const first = orderedStarships?.[0]
    setInstallTargetStarshipId(first?.id ? String(first.id) : '')
  }

  const analyzeInstall = async (): Promise<boolean> => {
    if (!installTargetVersion || !installTargetStarshipId || !selectedBundle) return false
    setInstallAnalyzing(true)
    try {
      const route = selectedBundle.kind === 'room_bundle' ? '/api/v1/registry/install/room-bundle/analyze' : '/api/v1/registry/install/agent-bundle/analyze'
      const res = await authedFetch(route, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ starshipId: installTargetStarshipId, bundleVersionId: installTargetVersion.id }),
      })
      if (!res.ok) throw new Error(`Analyze failed (${res.status})`)
      const json = await res.json()
      const data = json?.data ?? json
      setInstallAnalysis(data)

      // Build default decisions: same->skip, else copy
      const next: any = { rooms: {}, views: {}, datasets: {}, taskBoards: {}, tools: {}, agents: {} }
      const setDefaults = (arr: any[], key: string) => {
        for (const x of arr ?? []) {
          const status = x?.status
          const action: 'skip' | 'copy' | 'overwrite' = status === 'same' ? 'skip' : 'copy'
          next[key][String(x.bundleHash)] = { action, targetId: x?.existing?.id ?? x?.existing?.conversationId }
        }
      }
      if (selectedBundle.kind === 'room_bundle') {
        setDefaults(data?.rooms ?? [], 'rooms')
        setDefaults(data?.views ?? [], 'views')
        setDefaults(data?.datasets ?? [], 'datasets')
        setDefaults(data?.taskBoards ?? [], 'taskBoards')
        setDefaults(data?.tools ?? [], 'tools')
        setDefaults(data?.agents ?? [], 'agents')
      } else {
        setDefaults(data?.tools ?? [], 'tools')
        setDefaults(data?.agents ?? [], 'agents')
      }
      setInstallDecisions(next)
      return true
    } catch (e) {
      toast.error('Analyze failed', { description: getSafeErrorMessage(e) })
      return false
    } finally {
      setInstallAnalyzing(false)
    }
  }

  const applyInstall = async (): Promise<boolean> => {
    if (!installTargetVersion || !installTargetStarshipId || !selectedBundle || !installDecisions) return false
    setInstallApplying(true)
    try {
      const route = selectedBundle.kind === 'room_bundle' ? '/api/v1/registry/install/room-bundle/apply' : '/api/v1/registry/install/agent-bundle/apply'
      const res = await authedFetch(route, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ starshipId: installTargetStarshipId, bundleVersionId: installTargetVersion.id, decisions: installDecisions }),
      })
      if (!res.ok) throw new Error(`Install failed (${res.status})`)
      toast.success('Install complete')
      setInstallOpen(false)
      return true
    } catch (e) {
      toast.error('Install failed', { description: getSafeErrorMessage(e) })
      return false
    } finally {
      setInstallApplying(false)
    }
  }

  const canGoNextInstall = useMemo(() => {
    if (installStep === 1) return Boolean(installTargetStarshipId && installTargetVersion)
    if (installStep === 2) return Boolean(installAnalysis && !installAnalyzing)
    return false
  }, [installAnalysis, installAnalyzing, installStep, installTargetStarshipId, installTargetVersion])

  const handleInstallNext = async () => {
    if (installAnalyzing || installApplying) return
    if (installStep === 1) {
      setInstallStep(2)
      const ok = await analyzeInstall()
      if (!ok) setInstallStep(1)
      return
    }
    if (installStep === 2) {
      setInstallStep(3)
      return
    }
    await applyInstall()
  }

  const handleInstallBack = () => {
    if (installAnalyzing || installApplying) return
    if (installStep === 1) {
      setInstallOpen(false)
      return
    }
    if (installStep === 2) {
      setInstallStep(1)
      setInstallAnalysis(null)
      setInstallDecisions(null)
      return
    }
    setInstallStep(2)
  }

  if (!isAuthenticated) {
    return (
      <PageLayout title="Bundle Registry" description="Sign in to manage registry bundles." showHeader>
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">You must be signed in to view this page.</p>
        </div>
      </PageLayout>
    )
  }

  if (!isInstanceAdmin) {
    return (
      <PageLayout title="Bundle Registry" description="Instance admin tools for registry bundles." showHeader>
        <div className="flex items-center justify-center h-full">
          <Card className="max-w-md w-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icon name="shield-alert" className="h-5 w-5 text-amber-500" />
                Instance admin access required
              </CardTitle>
              <CardDescription>Only instance admins can manage the bundle registry.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </PageLayout>
    )
  }

  return (
    <PageLayout>
      <div className="bg-background">
        <div className="flex flex-col items-center px-6 py-8">
          <div className="w-full max-w-6xl mx-auto space-y-6">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Icon name="box" className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold">Admin · Bundle Registry</h1>
              </div>
              <div className="flex items-center justify-center gap-3 mt-2 text-sm">
                <Link href="/admin/connector-templates" className="font-medium underline underline-offset-4">
                  Connector templates
                </Link>
                <span className="text-muted-foreground">·</span>
                <Link href="/admin/agents/pending" className="font-medium underline underline-offset-4">
                  Agent approvals
                </Link>
                <span className="text-muted-foreground">·</span>
                <Link href="/admin/platform-secrets" className="font-medium underline underline-offset-4">
                  Platform secrets
                </Link>
                <span className="text-muted-foreground">·</span>
                <Link href="/admin/llm-models" className="font-medium underline underline-offset-4">
                  LLM models
                </Link>
                <span className="text-muted-foreground">·</span>
                <Link href="/admin/bundles" className="font-medium underline underline-offset-4">
                  Bundle registry
                </Link>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => refreshBundles()} disabled={loadingBundles}>
                  <Icon name="refresh-cw" className={cn('h-4 w-4 mr-1.5', loadingBundles ? 'animate-spin' : '')} />
                  Refresh
                </Button>
                <Button variant="default" size="sm" onClick={() => setCreateOpen(true)}>
                  <Icon name="plus" className="h-4 w-4 mr-1.5" />
                  New bundle
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Select value={selectedBundleId ?? ''} onValueChange={v => setSelectedBundleId(v || null)}>
                  <SelectTrigger className="w-[360px]" aria-label="Select bundle">
                    <SelectValue placeholder={loadingBundles ? 'Loading…' : 'Select a bundle'} />
                  </SelectTrigger>
                  <SelectContent>
                    {bundles.map(b => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.displayName} · {b.slug} · {b.kind === 'room_bundle' ? 'Room' : 'Agent'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={() => setPublishOpen(true)} disabled={!selectedBundleId}>
                  <Icon name="upload" className="h-4 w-4 mr-1.5" />
                  Publish version
                </Button>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Bundles</CardTitle>
                <CardDescription>Create, publish, download, and install versioned bundles.</CardDescription>
              </CardHeader>
              <CardContent>
                {!selectedBundle ? (
                  <div className="text-sm text-muted-foreground">Select a bundle to see versions.</div>
                ) : (
                  <div className="space-y-3">
                    <div className="text-sm">
                      <span className="font-medium">{selectedBundle.displayName}</span>{' '}
                      <span className="text-muted-foreground">({selectedBundle.slug} · {selectedBundle.kind} · {selectedBundle.visibility})</span>
                    </div>

                    {loadingVersions ? (
                      <div className="text-sm text-muted-foreground">Loading versions…</div>
                    ) : versions.length === 0 ? (
                      <div className="text-sm text-muted-foreground">No versions yet. Publish one.</div>
                    ) : (
                      <div className="divide-y divide-border rounded-md border border-border/60">
                        {versions.map(v => (
                          <div key={v.id} className="flex items-center justify-between gap-3 p-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium truncate">{v.version}</span>
                                <span className="text-xs text-muted-foreground truncate">{new Date(v.createdAt).toLocaleString()}</span>
                              </div>
                              <div className="text-xs text-muted-foreground truncate">
                                {selectedBundle.kind === 'room_bundle'
                                  ? `${v.roomsCount} rooms · ${v.viewsCount} views · ${v.datasetsCount} datasets · ${v.taskBoardsCount} boards · ${v.agentsCount} agents · ${v.toolsCount} tools`
                                  : `${v.agentsCount} agents · ${v.toolsCount} tools`}
                                {typeof v.artifactSize === 'number' ? ` · ${(v.artifactSize / 1024 / 1024).toFixed(1)}MB` : ''}
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => window.open(`/api/v1/registry/bundle-versions/${encodeURIComponent(v.id)}/download`, '_blank')}
                              >
                                <Icon name="download" className="h-4 w-4 mr-1.5" />
                                Download
                              </Button>
                              <Button variant="default" size="sm" onClick={() => startInstallWizard(v)}>
                                <Icon name="sparkles" className="h-4 w-4 mr-1.5" />
                                Install
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Create bundle */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create bundle</DialogTitle>
            <DialogDescription>Create a new registry bundle (immutable versions).</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3">
            <div className="grid gap-1.5">
              <Label>Slug</Label>
              <Input value={createSlug} onChange={e => setCreateSlug(e.target.value)} placeholder="my-bundle" />
            </div>
            <div className="grid gap-1.5">
              <Label>Display name</Label>
              <Input value={createName} onChange={e => setCreateName(e.target.value)} placeholder="My bundle" />
            </div>
            <div className="grid gap-1.5">
              <Label>Description</Label>
              <Textarea value={createDesc} onChange={e => setCreateDesc(e.target.value)} placeholder="What is this bundle for?" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Kind</Label>
                <Select value={createKind} onValueChange={v => setCreateKind(v as RegistryBundleKind)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agent_bundle">Agent bundle</SelectItem>
                    <SelectItem value="room_bundle">Room bundle</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Visibility</Label>
                <Select value={createVisibility} onValueChange={v => setCreateVisibility(v as RegistryVisibility)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private">Private</SelectItem>
                    <SelectItem value="public">Public</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={handleCreateBundle} disabled={creating || !createSlug.trim() || !createName.trim()}>
              {creating ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Publish version */}
      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Publish version</DialogTitle>
            <DialogDescription>Upload a zip bundle artifact and publish an immutable version.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3">
            <div className="grid gap-1.5">
              <Label>Version</Label>
              <Input value={publishVersion} onChange={e => setPublishVersion(e.target.value)} placeholder="1.0.0" />
            </div>
            <div className="grid gap-1.5">
              <Label>Zip file</Label>
              <Input
                type="file"
                accept=".zip,application/zip"
                onChange={e => setPublishFile(e.target.files?.[0] ?? null)}
              />
              {publishFile ? <p className="text-xs text-muted-foreground">{safeFilenameSegment(publishFile.name)} · {(publishFile.size / 1024 / 1024).toFixed(1)}MB</p> : null}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPublishOpen(false)} disabled={publishing}>
              Cancel
            </Button>
            <Button onClick={handlePublishVersion} disabled={publishing || !selectedBundleId || !publishFile || !publishVersion.trim()}>
              {publishing ? 'Publishing…' : 'Publish'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Install wizard */}
      <Dialog open={installOpen} onOpenChange={setInstallOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Install bundle</DialogTitle>
            <DialogDescription>Analyze conflicts, choose actions, then apply to a target starship.</DialogDescription>
          </DialogHeader>

          <WizardStepper steps={INSTALL_WIZARD_STEPS as any} activeStep={installStep as any} className="mt-2" />

          <div className="mt-4 space-y-4">
            {installStep === 1 ? (
              <div className="grid grid-cols-1 gap-3">
                <div className="grid gap-1.5">
                  <Label>Target starship</Label>
                  <Select value={installTargetStarshipId} onValueChange={v => setInstallTargetStarshipId(v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select starship" />
                    </SelectTrigger>
                    <SelectContent>
                      {orderedStarships.map(s => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          {s.name} · {s.slug}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!orderedStarships.length ? <p className="text-xs text-muted-foreground">No starships found.</p> : null}
                </div>
              </div>
            ) : installStep === 2 ? (
              <div className="space-y-3">
                {installAnalyzing ? (
                  <p className="text-sm text-muted-foreground">Analyzing…</p>
                ) : !installAnalysis ? (
                  <p className="text-sm text-muted-foreground">No analysis available.</p>
                ) : (
                  <div className="space-y-4">
                    {(() => {
                      const sections: Array<{ key: string; title: string; items: any[] }> = selectedBundle?.kind === 'room_bundle'
                        ? [
                            { key: 'rooms', title: 'Rooms', items: installAnalysis?.rooms ?? [] },
                            { key: 'views', title: 'Views', items: installAnalysis?.views ?? [] },
                            { key: 'datasets', title: 'Datasets', items: installAnalysis?.datasets ?? [] },
                            { key: 'taskBoards', title: 'Task boards', items: installAnalysis?.taskBoards ?? [] },
                            { key: 'tools', title: 'Tools', items: installAnalysis?.tools ?? [] },
                            { key: 'agents', title: 'Agents', items: installAnalysis?.agents ?? [] },
                          ]
                        : [
                            { key: 'tools', title: 'Tools', items: installAnalysis?.tools ?? [] },
                            { key: 'agents', title: 'Agents', items: installAnalysis?.agents ?? [] },
                          ]

                      const renderStatus = (status?: string) => {
                        if (status === 'same') return <span className="text-xs text-muted-foreground">Same</span>
                        if (status === 'conflict') return <span className="text-xs text-amber-600">Conflict</span>
                        if (status === 'new') return <span className="text-xs text-emerald-600">New</span>
                        return <span className="text-xs text-muted-foreground">—</span>
                      }

                      return sections.map(s => {
                        const items = Array.isArray(s.items) ? s.items : []
                        if (items.length === 0) return null
                        return (
                          <div key={s.key} className="rounded-md border border-border/60 p-3">
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <p className="text-sm font-medium">{s.title}</p>
                              <p className="text-xs text-muted-foreground">{items.length}</p>
                            </div>
                            <div className="space-y-2">
                              {items.map((x, idx) => {
                                const bundleHash = String(x?.bundleHash ?? '')
                                const status = String(x?.status ?? '')
                                const name = String(x?.name ?? x?.file ?? `item-${idx + 1}`)
                                const existingId = String(x?.existing?.id ?? x?.existing?.conversationId ?? '')
                                const d = getInstallDecision(s.key, bundleHash)
                                const fallbackAction: 'skip' | 'copy' = status === 'same' ? 'skip' : 'copy'
                                const action = (d?.action as any) || fallbackAction
                                const canOverwrite = Boolean(existingId)

                                return (
                                  <div key={bundleHash || idx} className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2 min-w-0">
                                        <p className="text-sm font-medium truncate">{name}</p>
                                        {renderStatus(status)}
                                      </div>
                                      {existingId ? (
                                        <p className="text-xs text-muted-foreground truncate">
                                          Existing: {String(x?.existing?.name ?? x?.existing?.slug ?? existingId)}
                                        </p>
                                      ) : (
                                        <p className="text-xs text-muted-foreground truncate">No existing match</p>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <select
                                        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                                        value={action}
                                        onChange={e => {
                                          const next = e.target.value as 'skip' | 'copy' | 'overwrite'
                                          setInstallDecision(s.key, bundleHash, next, next === 'overwrite' ? existingId : undefined)
                                        }}
                                      >
                                        <option value="skip">Skip</option>
                                        <option value="copy">Import copy</option>
                                        <option value="overwrite" disabled={!canOverwrite}>
                                          Overwrite existing
                                        </option>
                                      </select>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })
                    })()}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-md border border-border/60 p-3 text-sm">
                  <p className="font-medium mb-2">Ready to install</p>
                  <p className="text-muted-foreground">
                    Target starship: <span className="text-foreground">{installTargetStarshipId || '—'}</span>
                  </p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={handleInstallBack} disabled={installAnalyzing || installApplying}>
              Back
            </Button>
            <Button onClick={handleInstallNext} disabled={installAnalyzing || installApplying || !canGoNextInstall}>
              {installStep === 3 ? (installApplying ? 'Installing…' : 'Install') : 'Next'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  )
}

