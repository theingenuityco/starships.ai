'use client'

import Icon from '@/components/primitives/Icon'

import { useMemo, useState } from 'react'
import { PageLayout } from '@/components/layout/PageLayout'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { StarshipsLogo } from '@/components/ui/starships-logo'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import AgentAvatar from '@/components/animated/AgentAvatar'
import { useMessageAttachments } from '@/hooks/useFileUpload'
import { useAuth } from '@/hooks/useAuth'
import { usePendingAgents, useApproveAgentPublication, useRejectAgentPublication, usePendingAgentTools, type PendingAgentSummary } from '@/hooks/useAdminAgents'
import { AgentDocumentEditor } from '@/components/agents/AgentBuilder/components/AgentDocumentEditor'
import type { AgentFormData } from '@/components/agents/AgentBuilder/types'
import { cn } from '@/lib/utils'
import { formatAgentDisplayName } from '@/lib/agentDisplay'
import Link from 'next/link'

interface RequestedByProfileProps {
  name: string
  starshipName?: string
  starshipSlug?: string
  avatar?: string
}

function RequestedByProfile({ name, starshipName, starshipSlug, avatar }: RequestedByProfileProps) {
  const displayStarship = starshipName || starshipSlug

  const isImageUrl = (value?: string | null): boolean => {
    if (!value || typeof value !== 'string') return false
    const trimmed = value.trim()
    return /^(https?:\/\/|data:image\/[a-zA-Z]+;base64,|\/)/.test(trimmed)
  }

  return (
    <div className="flex items-center gap-2.5 rounded-md border border-border/70 bg-background/70 px-2.5 py-2">
      <div className="w-7 h-7">
        {avatar && isImageUrl(avatar) ? (
          <Avatar className="w-7 h-7 rounded-lg">
            <AvatarImage src={avatar} alt={name} referrerPolicy="no-referrer" crossOrigin="anonymous" />
            <AvatarFallback className="text-xs">{name.charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
        ) : (
          <div className="w-7 h-7 bg-gradient-to-br from-primary/20 to-primary/10 rounded-lg flex items-center justify-center">
            <Icon name="user" className="w-4 h-4 text-primary" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-foreground truncate">{name}</p>
        {displayStarship && (
          <div className="flex items-center gap-1.5">
            <StarshipsLogo width={10} height={10} className="text-muted-foreground flex-shrink-0" />
            <p className="text-[11px] text-muted-foreground truncate">{displayStarship}</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default function PendingAgentsPage(): React.JSX.Element {
  const { isAuthenticated, isInstanceAdmin } = useAuth()
  const [page, setPage] = useState(1)
  const limit = 20

  const [selectedAgent, setSelectedAgent] = useState<PendingAgentSummary | null>(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)

  const selectedAgentAvatarAttachmentId = (selectedAgent as any)?.agent?.avatarAttachmentId as string | undefined
  const selectedAgentStarshipId = (selectedAgent as any)?.agent?.starshipId as string | undefined
  const selectedAgentAvatarIds = useMemo(() => (selectedAgentAvatarAttachmentId ? [selectedAgentAvatarAttachmentId] : []), [selectedAgentAvatarAttachmentId])
  const { data: selectedAgentAvatarAttachments = [] } = useMessageAttachments(selectedAgentAvatarIds, selectedAgentStarshipId)
  const selectedAgentAvatarUrl = selectedAgentAvatarAttachments?.[0]?.previewUrl

  const selectedAgentId = selectedAgent?.agent.id
  const { data: pendingTools = [], isLoading: isLoadingTools } = usePendingAgentTools(selectedAgentId)

  const { data, isLoading, isError, error } = usePendingAgents(page, limit)
  const approveMutation = useApproveAgentPublication()
  const rejectMutation = useRejectAgentPublication()

  if (!isAuthenticated) {
    // JwtAuthGate from PageLayout will normally prevent this, but guard just in case.
    return (
      <PageLayout title="Agent Publish Approvals" description="Sign in to manage agent publication requests." showHeader>
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">You must be signed in to view this page.</p>
        </div>
      </PageLayout>
    )
  }

  if (!isInstanceAdmin) {
    return (
      <PageLayout title="Agent Publish Approvals" description="Instance admin tools for managing published agents." showHeader>
        <div className="flex items-center justify-center h-full">
          <Card className="max-w-md w-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icon name="shield-alert" className="h-5 w-5 text-amber-500" />
                Instance admin access required
              </CardTitle>
              <CardDescription>Only instance admins can review and approve agent publication requests.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </PageLayout>
    )
  }

  const agents = data?.agents || []
  const pagination = data?.pagination

  const handleApprove = (agentId: string) => {
    approveMutation.mutate(agentId)
  }

  const handleReject = (agentId: string) => {
    rejectMutation.mutate(agentId)
  }

  const openAgentDetails = (summary: PendingAgentSummary) => {
    setSelectedAgent(summary)
    setIsDetailOpen(true)
  }

  const closeAgentDetails = () => {
    setIsDetailOpen(false)
    setSelectedAgent(null)
  }

  const handleApproveSelected = () => {
    if (!selectedAgent) return
    handleApprove(selectedAgent.agent.id)
    closeAgentDetails()
  }

  const handleRejectSelected = () => {
    if (!selectedAgent) return
    handleReject(selectedAgent.agent.id)
    closeAgentDetails()
  }

  const selectedAgentFormData: AgentFormData | null = selectedAgent
    ? {
        name: selectedAgent.agent.name,
        slug: selectedAgent.agent.slug,
        description: selectedAgent.agent.description || '',
        category: (selectedAgent.agent as any).category || 'general',
        model: selectedAgent.agent.model,
        temperature: (selectedAgent.agent as any).temperature ?? 0.7,
        maxTokens: (selectedAgent.agent as any).maxTokens ?? 4000,
        reasoning: ((selectedAgent.agent as any)?.reasoning?.effort as any) || 'none',
        systemPrompt: selectedAgent.agent.systemPrompt || '',
        previewPrompts: (selectedAgent.agent as any).previewPrompts || [],
        // Use the denormalized assignedToolSlugs populated by the admin
        // pending agents API so the preview matches the agent's current
        // tool assignments. The aside "Tools in this publish" panel
        // separately shows only the subset of tools that will create or
        // update templates in this publish.
        assignedToolSlugs: (selectedAgent.agent as any).assignedToolSlugs || [],
        blueprint: selectedAgent.agent.blueprint ? JSON.stringify(selectedAgent.agent.blueprint, null, 2) : '{\n  "nodes": [],\n  "edges": []\n}',
        timeout: (selectedAgent.agent as any).timeout ?? 30000,
        icon: (selectedAgent.agent as any).icon || '',
      }
    : null

  return (
    <PageLayout>
      <div className="bg-background">
        <div className="flex flex-col items-center px-6 py-8">
          <div className="w-full max-w-6xl mx-auto space-y-8">
            {/* Page header - matches ship agents/tools pages */}
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Icon name="shield-check" className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold">Admin</h1>
              </div>
              <div className="flex items-center justify-center gap-3 mt-2">
                <Link href="/admin/connector-templates" className="text-sm font-medium underline underline-offset-4">
                  Connector templates
                </Link>
                <span className="text-muted-foreground">·</span>
                <Link href="/admin/agents/pending" className="text-sm font-medium underline underline-offset-4">
                  Agent approvals
                </Link>
                <span className="text-muted-foreground">·</span>
                <Link href="/admin/platform-secrets" className="text-sm font-medium underline underline-offset-4">
                  Platform secrets
                </Link>
              </div>
              <p className="text-muted-foreground mt-3">Review pending publishes and manage instance-level encrypted secrets.</p>
            </div>

            <section className="space-y-6">
              {/* Summary header */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Icon name="list" className="h-5 w-5 text-primary" />
                  <p className="text-sm text-muted-foreground">Manage the queue of agents awaiting instance admin approval before being published.</p>
                </div>
                <Badge variant="outline" className="flex items-center gap-2">
                  <Icon name="database" className="h-4 w-4" />
                  <span className="text-xs font-mono">
                    {agents.length} pending{pagination ? ` • page ${pagination.page}` : ''}
                  </span>
                </Badge>
              </div>

              {/* Loading / error states */}
              {isLoading && (
                <div className="flex items-center justify-center py-16">
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <Icon name="loading" className="h-5 w-5 animate-spin" />
                    <span>Loading pending agents…</span>
                  </div>
                </div>
              )}

              {isError && !isLoading && (
                <div className="flex items-center justify-center py-16">
                  <div className="max-w-md text-center space-y-2">
                    <p className="font-medium">Unable to load pending agents</p>
                    <p className="text-sm text-muted-foreground">{(error as any)?.message || 'Something went wrong while loading data.'}</p>
                  </div>
                </div>
              )}

              {!isLoading && !isError && agents.length === 0 && (
                <div className="flex items-center justify-center py-16">
                  <div className="max-w-md text-center space-y-3">
                    <Icon name="check-circle" className="h-10 w-10 text-emerald-500 mx-auto" />
                    <p className="font-semibold">No agents awaiting approval</p>
                    <p className="text-sm text-muted-foreground">When builders request publication for their agents, they will appear here for your review.</p>
                  </div>
                </div>
              )}

              {!isLoading && !isError && agents.length > 0 && (
                <div className="grid gap-3">
                  {agents.map(summary => {
                    const agent = summary.agent
                    return (
                      <Card key={agent.id} className="border border-border/60 hover:border-primary/60 transition-colors cursor-pointer" onClick={() => openAgentDetails(summary)}>
                        <CardHeader className="flex flex-row items-center justify-between gap-4">
                          <div className="space-y-1 min-w-0">
                            <CardTitle className="flex items-center gap-2 text-base">
                              <span className="truncate">{formatAgentDisplayName(agent)}</span>
                              {(agent.publicationRequestedVersion || agent.version) && (
                                <Badge variant="outline" className="text-[10px] font-mono">
                                  v{agent.publicationRequestedVersion || agent.version}
                                </Badge>
                              )}
                              <Badge variant="outline" className="text-[10px] capitalize">
                                {agent.publicationStatus.replace('_', ' ')}
                              </Badge>
                            </CardTitle>
                            <CardDescription className="line-clamp-2">{agent.description || 'No description provided.'}</CardDescription>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mt-2">
                              {agent.updatedAt && (
                                <span className="flex items-center gap-1">
                                  <Icon name="clock" className="h-3 w-3" />
                                  <span>{new Date(agent.updatedAt as string).toLocaleString()}</span>
                                </span>
                              )}
                              {summary.requestedBy && (
                                <span className="flex items-center gap-1">
                                  <Icon name="user" className="h-3 w-3" />
                                  <span className="truncate max-w-[140px]">{summary.requestedBy.name || summary.requestedBy.id}</span>
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex-shrink-0">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={approveMutation.isPending || rejectMutation.isPending}
                              onClick={e => {
                                e.stopPropagation()
                                openAgentDetails(summary)
                              }}
                            >
                              <Icon name="eye" className="h-4 w-4 mr-1.5" />
                              Review
                            </Button>
                          </div>
                        </CardHeader>
                      </Card>
                    )
                  })}
                </div>
              )}

              {/* Pagination controls */}
              {pagination && pagination.total > pagination.limit && (
                <div className="flex items-center justify-between pt-4 border-t border-border/60">
                  <div className="text-xs text-muted-foreground">
                    Showing page {pagination.page} of {Math.max(1, Math.ceil(pagination.total / pagination.limit || 1))} • {pagination.total} total pending agents
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" disabled={!pagination.has_prev || isLoading} onClick={() => setPage(prev => Math.max(1, prev - 1))}>
                      <Icon name="chevron-left" className="h-4 w-4 mr-1" />
                      Previous
                    </Button>
                    <Button size="sm" variant="outline" disabled={!pagination.has_next || isLoading} onClick={() => setPage(prev => prev + 1)}>
                      Next
                      <Icon name="chevron-right" className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </section>

            {/* Agent detail modal for approvals */}
            <Dialog open={isDetailOpen} onOpenChange={open => (open ? setIsDetailOpen(true) : closeAgentDetails())}>
              <DialogContent className="w-full max-w-[1280px] max-h-[98vh]">
                {/* Visually hidden title to satisfy accessibility requirements */}
                <DialogHeader>
                  <DialogTitle className="sr-only">Review agent for publication</DialogTitle>
                </DialogHeader>

                {selectedAgent && selectedAgentFormData && (
                  <div className="flex flex-col md:flex-row gap-4 h-[80vh] mt-2">
                    {/* Main read-only editor */}
                    <div className="flex-1 min-w-0 border border-border/60 rounded-lg bg-background/80">
                      <div className="h-full overflow-auto px-4">
                        <AgentDocumentEditor
                          value={selectedAgentFormData}
                          onChange={() => {
                            // no-op in read-only mode
                          }}
                          onFieldChange={() => {
                            // no-op in read-only mode
                          }}
                          starshipId={selectedAgent.agent.starshipId}
                          readOnly
                        />
                      </div>
                    </div>

                    {/* Right aside with meta & actions */}
                    <aside className="w-full md:w-80 shrink-0 flex flex-col h-full border border-border/60 rounded-lg bg-muted/40 p-3">
                      {/* Scrollable meta content */}
                      <div className="flex-1 overflow-y-auto pr-1">
                        {/* Status block */}
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</p>
                          <div className="rounded-md border border-border/70 bg-background/70 p-2 space-y-2 text-[11px] font-mono">
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">Status</span>
                              <span className="flex items-center gap-1">
                                <Icon
                                  name={selectedAgent.agent.publicationStatus === 'published' ? 'check-circle' : selectedAgent.agent.publicationStatus === 'rejected' ? 'x-circle' : 'clock'}
                                  className={cn(
                                    'h-3 w-3',
                                    selectedAgent.agent.publicationStatus === 'published'
                                      ? 'text-emerald-600'
                                      : selectedAgent.agent.publicationStatus === 'rejected'
                                        ? 'text-red-600'
                                        : 'text-amber-600'
                                  )}
                                />
                                <span
                                  className={cn(
                                    'capitalize',
                                    selectedAgent.agent.publicationStatus === 'published'
                                      ? 'text-emerald-700'
                                      : selectedAgent.agent.publicationStatus === 'rejected'
                                        ? 'text-red-700'
                                        : 'text-amber-700'
                                  )}
                                >
                                  {selectedAgent.agent.publicationStatus.replace('_', ' ')}
                                </span>
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">Current version</span>
                              <span>v{selectedAgent.agent.version || '1.0.0'}</span>
                            </div>
                            {selectedAgent.agent.publicationRequestedVersion && (
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Requested version</span>
                                <span className="flex items-center gap-1">
                                  {selectedAgent.agent.publicationVersionBump && (
                                    <Badge
                                      variant="outline"
                                      className={cn(
                                        'text-[10px] capitalize px-1.5 py-0 border-[0.5px]',
                                        selectedAgent.agent.publicationVersionBump === 'patch'
                                          ? 'border-slate-400 text-slate-700'
                                          : selectedAgent.agent.publicationVersionBump === 'minor'
                                            ? 'border-yellow-400 text-yellow-700'
                                            : 'border-red-500 text-red-700'
                                      )}
                                    >
                                      {selectedAgent.agent.publicationVersionBump}
                                    </Badge>
                                  )}
                                  <span>v{selectedAgent.agent.publicationRequestedVersion}</span>
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="mt-4 space-y-2 text-xs">
                          <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[11px]">Request info</p>
                          <div className="space-y-2">
                            <RequestedByProfile
                              name={selectedAgent.requestedBy?.name || selectedAgent.requestedBy?.id || selectedAgent.agent.publicationRequestedBy || 'Unknown'}
                              avatar={selectedAgent.requestedBy?.avatar}
                              starshipName={selectedAgent.requestedByStarship?.name}
                              starshipSlug={selectedAgent.requestedByStarship?.slug}
                            />
                            <div className="flex items-center gap-2">
                              <div className="rounded-md border border-border/70 bg-background/70 px-2 py-0.5 flex items-center gap-1 text-[11px] font-mono">
                                <Icon name="clock" className="h-3 w-3" />
                                <span>Last updated</span>
                                <span>{selectedAgent.agent.updatedAt ? new Date(selectedAgent.agent.updatedAt as string).toLocaleString() : 'Unknown'}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 space-y-2 text-xs">
                          <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[11px]">Agent</p>
                          <div className="space-y-2">
                            {/* Identity row */}
                            <div className="flex items-center gap-2.5">
                              <div className="relative">
                                <AgentAvatar
                                  seed={selectedAgent.agent.name}
                                  imageUrl={selectedAgentAvatarUrl}
                                  size={32}
                                  rounded
                                  className="h-8 w-8 rounded-md overflow-hidden ring-1 ring-border/40 shadow-sm bg-background/80"
                                />
                              </div>
                              <div className="flex flex-col min-w-0">
                                <span className="text-xs font-semibold truncate">{formatAgentDisplayName(selectedAgent.agent)}</span>
                                <span className="text-[11px] text-muted-foreground font-mono truncate">{selectedAgent.agent.slug || selectedAgent.agent.id}</span>
                              </div>
                            </div>

                            {/* Meta container styled like versions block */}
                            <div className="rounded-md border border-border/70 bg-background/70 p-2 space-y-2 text-[11px] font-mono">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Agent ID</span>
                                <span className="break-all text-right">{selectedAgent.agent.id}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Model</span>
                                <span className="truncate">{selectedAgent.agent.model}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 space-y-2 text-xs">
                          <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[11px]">Changelog</p>
                          <div className="rounded-md border border-border/70 bg-background/60 p-2 max-h-40 overflow-y-auto whitespace-pre-wrap">
                            {selectedAgent.agent.publicationChangelog || 'No changelog was provided for this request.'}
                          </div>
                        </div>

                        <div className="mt-4 space-y-2 text-xs">
                          <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[11px]">Tools in this publish</p>
                          <div className="rounded-md border border-border/70 bg-background/60 p-2 max-h-40 overflow-y-auto">
                            {isLoadingTools && <p className="text-[11px] text-muted-foreground">Loading tools…</p>}
                            {!isLoadingTools && pendingTools.length === 0 && <p className="text-[11px] text-muted-foreground">No tool changes are included in this publish.</p>}
                            {!isLoadingTools && pendingTools.length > 0 && (
                              <ul className="space-y-1.5">
                                {pendingTools.map(tool => (
                                  <li key={tool.id} className="flex flex-col gap-0.5">
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="min-w-0">
                                        <p className="text-xs font-semibold truncate">{tool.name || tool.slug || 'Untitled tool'}</p>
                                        <p className="text-[11px] text-muted-foreground font-mono truncate">{tool.slug}</p>
                                      </div>
                                      <div className="text-right text-[11px] font-mono">
                                        <div className="uppercase text-[10px] text-muted-foreground mb-0.5">Version</div>
                                        <div>v{tool.version || '1.0.0'}</div>
                                      </div>
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Fixed actions at the bottom */}
                      <div className="pt-2 space-y-2 mt-3">
                        <Button variant="outline" className="w-full" onClick={closeAgentDetails} disabled={approveMutation.isPending || rejectMutation.isPending}>
                          Close
                        </Button>
                        <Button
                          variant="outline"
                          className="w-full border-destructive text-destructive hover:bg-destructive/10"
                          onClick={handleRejectSelected}
                          disabled={approveMutation.isPending || rejectMutation.isPending || !selectedAgent}
                        >
                          <Icon name="x-circle" className="h-4 w-4 mr-1.5" />
                          Reject
                        </Button>
                        <Button className="w-full" onClick={handleApproveSelected} disabled={approveMutation.isPending || rejectMutation.isPending || !selectedAgent}>
                          <Icon name="check-circle" className="h-4 w-4 mr-1.5" />
                          Approve & publish
                        </Button>
                      </div>
                    </aside>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    </PageLayout>
  )
}
