'use client'

import Icon from '@/components/primitives/Icon'

import { useState } from 'react'
import { PageLayout } from '@/components/layout/PageLayout'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { StarshipsLogo } from '@/components/ui/starships-logo'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import AgentAvatar from '@/components/animated/AgentAvatar'
import { useAuth } from '@/hooks/useAuth'
import { usePendingAgents, useApproveAgentPublication, useRejectAgentPublication, type PendingAgentSummary } from '@/hooks/useAdminAgents'
import { AgentDocumentEditor } from '@/components/agents/AgentBuilder/components/AgentDocumentEditor'
import type { AgentFormData } from '@/components/agents/AgentBuilder/types'
import { cn } from '@/lib/utils'

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
        systemPrompt: selectedAgent.agent.systemPrompt || '',
        previewPrompts: (selectedAgent.agent as any).previewPrompts || [],
        assignedToolSlugs: (selectedAgent.agent as any).assignedToolSlugs || [],
        blueprint: selectedAgent.agent.blueprint ? JSON.stringify(selectedAgent.agent.blueprint, null, 2) : '{\n  "nodes": [],\n  "edges": []\n}',
        timeout: (selectedAgent.agent as any).timeout ?? 30000,
        icon: (selectedAgent.agent as any).icon || '',
      }
    : null

  return (
    <PageLayout title="Agent Publish Approvals" description="Review and approve or reject agents that owners have requested to publish." showHeader className="min-h-screen">
      <div className="space-y-6">
        {/* Summary header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Icon name="shield-check" className="h-6 w-6 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">Manage the queue of agents awaiting instance admin approval before being published.</p>
            </div>
          </div>
          <Badge variant="outline" className="flex items-center gap-2">
            <Icon name="list" className="h-4 w-4" />
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
          <div className="grid gap-4">
            {agents.map(summary => {
              const agent = summary.agent
              return (
                <Card key={agent.id} className="border border-border/60 hover:border-primary/60 transition-colors">
                  <CardHeader className="flex flex-row items-start justify-between gap-4">
                    <div className="space-y-1">
                      <CardTitle className="flex items-center gap-2">
                        <span>{agent.name}</span>
                        {agent.version && (
                          <Badge variant="outline" className="text-xs font-mono">
                            v{agent.version}
                          </Badge>
                        )}
                      </CardTitle>
                      <CardDescription>{agent.description || 'No description provided.'}</CardDescription>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <Badge variant="secondary" className="flex items-center gap-1">
                          <Icon name="brain" className="h-3 w-3" />
                          <span className="text-xs font-mono">{agent.model}</span>
                        </Badge>
                        <Badge variant="outline" className="flex items-center gap-1 text-xs">
                          <Icon name="clock" className="h-3 w-3" />
                          <span>Requested</span>
                          <span className="font-mono">{agent.updatedAt ? new Date(agent.updatedAt as string).toLocaleString() : 'Unknown'}</span>
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          status: {agent.publicationStatus}
                        </Badge>
                        {summary.requestedBy && (
                          <RequestedByProfile
                            name={summary.requestedBy.name || summary.requestedBy.id}
                            avatar={summary.requestedBy.avatar}
                            starshipName={summary.requestedByStarship?.name}
                            starshipSlug={summary.requestedByStarship?.slug}
                          />
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 min-w-[140px]">
                      <Button size="sm" variant="outline" className="w-full" disabled={approveMutation.isPending || rejectMutation.isPending} onClick={() => openAgentDetails(summary)}>
                        <Icon name="eye" className="h-4 w-4 mr-1.5" />
                        Review details
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Icon name="file-code" className="h-3.5 w-3.5" />
                        <span className="font-mono break-all">{agent.id}</span>
                      </div>
                      {pagination && (
                        <div className="flex items-center gap-2">
                          <span>
                            Page {pagination.page} of {Math.max(1, Math.ceil(pagination.total / pagination.limit || 1))}
                          </span>
                        </div>
                      )}
                    </div>
                  </CardContent>
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
                                selectedAgent.agent.publicationStatus === 'published' ? 'text-emerald-600' : selectedAgent.agent.publicationStatus === 'rejected' ? 'text-red-600' : 'text-amber-600'
                              )}
                            />
                            <span
                              className={cn(
                                'capitalize',
                                selectedAgent.agent.publicationStatus === 'published' ? 'text-emerald-700' : selectedAgent.agent.publicationStatus === 'rejected' ? 'text-red-700' : 'text-amber-700'
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
                            <AgentAvatar seed={selectedAgent.agent.name} size={32} rounded className="h-8 w-8 rounded-md overflow-hidden ring-1 ring-border/40 shadow-sm bg-background/80" />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-xs font-semibold truncate">{selectedAgent.agent.name}</span>
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
    </PageLayout>
  )
}
