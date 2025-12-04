'use client'

import Icon from '@/components/primitives/Icon'

import { useState } from 'react'
import { PageLayout } from '@/components/layout/PageLayout'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAuth } from '@/hooks/useAuth'
import { usePendingAgents, useApproveAgentPublication, useRejectAgentPublication } from '@/hooks/useAdminAgents'
import type { AgentModel } from '@starships/protocol'
import { AgentDocumentEditor } from '@/components/agents/AgentBuilder/components/AgentDocumentEditor'
import type { AgentFormData } from '@/components/agents/AgentBuilder/types'
import { cn } from '@/lib/utils'

export default function PendingAgentsPage(): React.JSX.Element {
  const { isAuthenticated, isInstanceAdmin } = useAuth()
  const [page, setPage] = useState(1)
  const limit = 20

  const [selectedAgent, setSelectedAgent] = useState<AgentModel | null>(null)
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

  const openAgentDetails = (agent: AgentModel) => {
    setSelectedAgent(agent)
    setIsDetailOpen(true)
  }

  const closeAgentDetails = () => {
    setIsDetailOpen(false)
    setSelectedAgent(null)
  }

  const handleApproveSelected = () => {
    if (!selectedAgent) return
    handleApprove(selectedAgent.id)
    closeAgentDetails()
  }

  const handleRejectSelected = () => {
    if (!selectedAgent) return
    handleReject(selectedAgent.id)
    closeAgentDetails()
  }

  const selectedAgentFormData: AgentFormData | null = selectedAgent
    ? {
        name: selectedAgent.name,
        slug: selectedAgent.slug,
        description: selectedAgent.description || '',
        category: (selectedAgent as any).category || 'general',
        model: selectedAgent.model,
        temperature: (selectedAgent as any).temperature ?? 0.7,
        maxTokens: (selectedAgent as any).maxTokens ?? 4000,
        systemPrompt: selectedAgent.systemPrompt || '',
        previewPrompts: (selectedAgent as any).previewPrompts || [],
        assignedToolSlugs: (selectedAgent as any).assignedToolSlugs || [],
        blueprint: selectedAgent.blueprint ? JSON.stringify(selectedAgent.blueprint, null, 2) : '{\n  "nodes": [],\n  "edges": []\n}',
        timeout: (selectedAgent as any).timeout ?? 30000,
        icon: (selectedAgent as any).icon || '',
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
            {agents.map(agent => (
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
                      {agent.publicationRequestedBy && (
                        <Badge variant="outline" className="text-xs">
                          requested by: <span className="font-mono ml-1">{agent.publicationRequestedBy}</span>
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 min-w-[140px]">
                    <Button size="sm" variant="outline" className="w-full" disabled={approveMutation.isPending || rejectMutation.isPending} onClick={() => openAgentDetails(agent)}>
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
            ))}
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
          <DialogContent className="w-full max-w-[1200px] max-h-[90vh]">
            {/* Visually hidden title to satisfy accessibility requirements */}
            <DialogHeader>
              <DialogTitle className="sr-only">Review agent for publication</DialogTitle>
            </DialogHeader>

            {selectedAgent && selectedAgentFormData && (
              <div className="flex flex-col md:flex-row gap-4 h-[75vh] mt-2">
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
                      starshipId={selectedAgent.starshipId}
                      readOnly
                    />
                  </div>
                </div>

                {/* Right aside with meta & actions */}
                <aside className="w-full md:w-80 shrink-0 flex flex-col h-full border border-border/60 rounded-lg bg-muted/40 p-3">
                  {/* Scrollable meta content */}
                  <div className="flex-1 space-y-4 overflow-y-auto pr-1">
                    {/* Status block */}
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</p>
                      <div className="rounded-md border border-border/70 bg-background/70 p-2 space-y-2 text-[11px] font-mono">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Status</span>
                          <span className="flex items-center gap-1">
                            <Icon
                              name={selectedAgent.publicationStatus === 'published' ? 'check-circle' : selectedAgent.publicationStatus === 'rejected' ? 'x-circle' : 'clock'}
                              className={cn(
                                'h-3 w-3',
                                selectedAgent.publicationStatus === 'published' ? 'text-emerald-600' : selectedAgent.publicationStatus === 'rejected' ? 'text-red-600' : 'text-amber-600'
                              )}
                            />
                            <span
                              className={cn(
                                'capitalize',
                                selectedAgent.publicationStatus === 'published' ? 'text-emerald-700' : selectedAgent.publicationStatus === 'rejected' ? 'text-red-700' : 'text-amber-700'
                              )}
                            >
                              {selectedAgent.publicationStatus.replace('_', ' ')}
                            </span>
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Current version</span>
                          <span>v{selectedAgent.version || '1.0.0'}</span>
                        </div>
                        {selectedAgent.publicationRequestedVersion && (
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Requested version</span>
                            <span className="flex items-center gap-1">
                              {selectedAgent.publicationVersionBump && (
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    'text-[10px] capitalize px-1.5 py-0 border-[0.5px]',
                                    selectedAgent.publicationVersionBump === 'patch'
                                      ? 'border-slate-400 text-slate-700'
                                      : selectedAgent.publicationVersionBump === 'minor'
                                        ? 'border-yellow-400 text-yellow-700'
                                        : 'border-red-500 text-red-700'
                                  )}
                                >
                                  {selectedAgent.publicationVersionBump}
                                </Badge>
                              )}
                              <span>v{selectedAgent.publicationRequestedVersion}</span>
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2 text-xs">
                      <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[11px]">Request info</p>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Icon name="user" className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-muted-foreground">Requested by</span>
                        </div>
                        <p className="font-mono break-all ml-5">{selectedAgent.publicationRequestedBy || 'Unknown'}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <Icon name="clock" className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-muted-foreground">Last updated</span>
                        </div>
                        <p className="font-mono ml-5">{selectedAgent.updatedAt ? new Date(selectedAgent.updatedAt as string).toLocaleString() : 'Unknown'}</p>
                      </div>
                    </div>

                    <div className="space-y-2 text-xs">
                      <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[11px]">Changelog</p>
                      <div className="rounded-md border border-border/70 bg-background/60 p-2 max-h-40 overflow-y-auto whitespace-pre-wrap">
                        {selectedAgent.publicationChangelog || 'No changelog was provided for this request.'}
                      </div>
                    </div>

                    <div className="space-y-2 text-xs">
                      <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[11px]">Agent ID</p>
                      <div className="flex items-center gap-2">
                        <Icon name="file-code" className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-mono break-all">{selectedAgent.id}</span>
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
