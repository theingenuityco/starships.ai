'use client'

import Icon from '@/components/primitives/Icon'

import { useState } from 'react'
import { PageLayout } from '@/components/layout/PageLayout'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { StarshipsLogo } from '@/components/ui/starships-logo'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useAuth } from '@/hooks/useAuth'
import { usePendingTools, useApproveToolPublication, useRejectToolPublication, type PendingToolSummary } from '@/hooks/useAdminTools'
import type { ToolModel } from '@starships/protocol'
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

function ToolMeta({ tool }: { tool: ToolModel }) {
  return (
    <div className="mt-4 space-y-2 text-xs">
      <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[11px]">Tool</p>
      <div className="space-y-2">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div className="h-8 w-8 rounded-md overflow-hidden ring-1 ring-border/40 shadow-sm bg-background/80 flex items-center justify-center">
              <Icon name="wrench" className="h-4 w-4 text-primary" />
            </div>
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-semibold truncate">{tool.name}</span>
            <span className="text-[11px] text-muted-foreground font-mono truncate">{tool.slug || tool.id}</span>
          </div>
        </div>

        <div className="rounded-md border border-border/70 bg-background/70 p-2 space-y-2 text-[11px] font-mono">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Tool ID</span>
            <span className="break-all text-right">{tool.id}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PendingToolsPage(): React.JSX.Element {
  const { isAuthenticated, isInstanceAdmin } = useAuth()
  const [page, setPage] = useState(1)
  const limit = 20

  const [selectedTool, setSelectedTool] = useState<PendingToolSummary | null>(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)

  const { data, isLoading, isError, error } = usePendingTools(page, limit)
  const approveMutation = useApproveToolPublication()
  const rejectMutation = useRejectToolPublication()

  if (!isAuthenticated) {
    return (
      <PageLayout title="Tool Publish Approvals" description="Sign in to manage tool publication requests." showHeader>
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">You must be signed in to view this page.</p>
        </div>
      </PageLayout>
    )
  }

  if (!isInstanceAdmin) {
    return (
      <PageLayout title="Tool Publish Approvals" description="Instance admin tools for managing published tools." showHeader>
        <div className="flex items-center justify-center h-full">
          <Card className="max-w-md w-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icon name="shield-alert" className="h-5 w-5 text-amber-500" />
                Instance admin access required
              </CardTitle>
              <CardDescription>Only instance admins can review and approve tool publication requests.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </PageLayout>
    )
  }

  const tools = data?.tools || []
  const pagination = data?.pagination

  const handleApprove = (toolId: string) => {
    approveMutation.mutate(toolId)
  }

  const handleReject = (toolId: string) => {
    rejectMutation.mutate(toolId)
  }

  const openToolDetails = (summary: PendingToolSummary) => {
    setSelectedTool(summary)
    setIsDetailOpen(true)
  }

  const closeToolDetails = () => {
    setIsDetailOpen(false)
    setSelectedTool(null)
  }

  const handleApproveSelected = () => {
    if (!selectedTool) return
    handleApprove(selectedTool.tool.id)
    closeToolDetails()
  }

  const handleRejectSelected = () => {
    if (!selectedTool) return
    handleReject(selectedTool.tool.id)
    closeToolDetails()
  }

  return (
    <PageLayout>
      <div className="bg-background">
        <div className="flex flex-col items-center px-6 py-8">
          <div className="w-full max-w-6xl mx-auto space-y-8">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Icon name="shield-check" className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold">Tool publish approvals</h1>
              </div>
              <p className="text-muted-foreground mt-2">Review and approve or reject tools that owners have requested to publish as templates.</p>
            </div>

            <section className="space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Icon name="list" className="h-5 w-5 text-primary" />
                  <p className="text-sm text-muted-foreground">Manage the queue of tools awaiting instance admin approval before being published.</p>
                </div>
                <Badge variant="outline" className="flex items-center gap-2">
                  <Icon name="database" className="h-4 w-4" />
                  <span className="text-xs font-mono">
                    {tools.length} pending{pagination ? ` • page ${pagination.page}` : ''}
                  </span>
                </Badge>
              </div>

              {isLoading && (
                <div className="flex items-center justify-center py-16">
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <Icon name="loading" className="h-5 w-5 animate-spin" />
                    <span>Loading pending tools…</span>
                  </div>
                </div>
              )}

              {isError && !isLoading && (
                <div className="flex items-center justify-center py-16">
                  <div className="max-w-md text-center space-y-2">
                    <p className="font-medium">Unable to load pending tools</p>
                    <p className="text-sm text-muted-foreground">{(error as any)?.message || 'Something went wrong while loading data.'}</p>
                  </div>
                </div>
              )}

              {!isLoading && !isError && tools.length === 0 && (
                <div className="flex items-center justify-center py-16">
                  <div className="max-w-md text-center space-y-3">
                    <Icon name="check-circle" className="h-10 w-10 text-emerald-500 mx-auto" />
                    <p className="font-semibold">No tools awaiting approval</p>
                    <p className="text-sm text-muted-foreground">When builders request publication for their tools, they will appear here for your review.</p>
                  </div>
                </div>
              )}

              {!isLoading && !isError && tools.length > 0 && (
                <div className="grid gap-3">
                  {tools.map(summary => {
                    const tool = summary.tool
                    return (
                      <Card
                        key={tool.id}
                        className="border border-border/60 hover:border-primary/60 transition-colors cursor-pointer"
                        onClick={() => openToolDetails(summary)}
                      >
                        <CardHeader className="flex flex-row items-center justify-between gap-4">
                          <div className="space-y-1 min-w-0">
                            <CardTitle className="flex items-center gap-2 text-base">
                              <span className="truncate">{tool.name}</span>
                              {(tool.publicationRequestedVersion || tool.version) && (
                                <Badge variant="outline" className="text-[10px] font-mono">
                                  v{tool.publicationRequestedVersion || tool.version}
                                </Badge>
                              )}
                              <Badge variant="outline" className="text-[10px] capitalize">
                                {tool.publicationStatus.replace('_', ' ')}
                              </Badge>
                            </CardTitle>
                            <CardDescription className="line-clamp-2">{tool.description || 'No description provided.'}</CardDescription>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mt-2">
                              {tool.updatedAt && (
                                <span className="flex items-center gap-1">
                                  <Icon name="clock" className="h-3 w-3" />
                                  <span>{new Date(tool.updatedAt as string).toLocaleString()}</span>
                                </span>
                              )}
                              {summary.requestedBy && (
                                <span className="flex items-center gap-1">
                                  <Icon name="user" className="h-3 w-3" />
                                  <span className="truncate max-w-[140px]">{(summary as any).requestedBy?.name || (summary as any).requestedBy?.id}</span>
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
                                openToolDetails(summary)
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

              {pagination && pagination.total > pagination.limit && (
                <div className="flex items-center justify-between pt-4 border-t border-border/60">
                  <div className="text-xs text-muted-foreground">
                    Showing page {pagination.page} of {Math.max(1, Math.ceil(pagination.total / pagination.limit || 1))} • {pagination.total} total pending tools
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

            <Dialog open={isDetailOpen} onOpenChange={open => (open ? setIsDetailOpen(true) : closeToolDetails())}>
              <DialogContent className="w-full max-w-[960px] max-h-[98vh]">
                <DialogHeader>
                  <DialogTitle className="sr-only">Review tool for publication</DialogTitle>
                  <DialogDescription className="sr-only">Review the details of this tool before approving or rejecting its publication.</DialogDescription>
                </DialogHeader>

                {selectedTool && (
                  <div className="flex flex-col md:flex-row gap-4 h-[70vh] mt-2">
                    <div className="flex-1 min-w-0 border border-border/60 rounded-lg bg-background/80 p-3 space-y-3 overflow-auto">
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tool identity</p>
                        <ToolMeta tool={selectedTool.tool as ToolModel} />
                      </div>

                      <div className="mt-4 space-y-2 text-xs">
                        <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[11px]">Description</p>
                        <div className="rounded-md border border-border/70 bg-background/60 p-2 max-h-32 overflow-y-auto whitespace-pre-wrap text-xs">
                          {selectedTool.tool.description || 'No description was provided for this tool.'}
                        </div>
                      </div>

                      <div className="mt-4 space-y-2 text-xs">
                        <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[11px]">Parameters (schema)</p>
                        <div className="rounded-md border border-border/70 bg-background/60 p-2 max-h-40 overflow-y-auto whitespace-pre-wrap text-[11px] font-mono">
                          {selectedTool.tool.parameters ? JSON.stringify(selectedTool.tool.parameters, null, 2) : 'No parameters defined.'}
                        </div>
                      </div>

                      <div className="mt-4 space-y-2 text-xs">
                        <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[11px]">Blueprint</p>
                        <div className="rounded-md border border-border/70 bg-background/60 p-2 max-h-40 overflow-y-auto whitespace-pre-wrap text-[11px] font-mono">
                          {selectedTool.tool.blueprint ? JSON.stringify(selectedTool.tool.blueprint, null, 2) : 'No blueprint defined.'}
                        </div>
                      </div>
                    </div>

                    <aside className="w-full md:w-80 shrink-0 flex flex-col h-full border border-border/60 rounded-lg bg-muted/40 p-3">
                      <div className="flex-1 overflow-y-auto pr-1">
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</p>
                          <div className="rounded-md border border-border/70 bg-background/70 p-2 space-y-2 text-[11px] font-mono">
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">Status</span>
                              <span className="flex items-center gap-1">
                                <Icon
                                  name={
                                    selectedTool.tool.publicationStatus === 'published'
                                      ? 'check-circle'
                                      : selectedTool.tool.publicationStatus === 'rejected'
                                        ? 'x-circle'
                                        : 'clock'
                                  }
                                  className={cn(
                                    'h-3 w-3',
                                    selectedTool.tool.publicationStatus === 'published'
                                      ? 'text-emerald-600'
                                      : selectedTool.tool.publicationStatus === 'rejected'
                                        ? 'text-red-600'
                                        : 'text-amber-600'
                                  )}
                                />
                                <span
                                  className={cn(
                                    'capitalize',
                                    selectedTool.tool.publicationStatus === 'published'
                                      ? 'text-emerald-700'
                                      : selectedTool.tool.publicationStatus === 'rejected'
                                        ? 'text-red-700'
                                        : 'text-amber-700'
                                  )}
                                >
                                  {selectedTool.tool.publicationStatus.replace('_', ' ')}
                                </span>
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">Current version</span>
                              <span>v{selectedTool.tool.version || '1.0.0'}</span>
                            </div>
                            {selectedTool.tool.publicationRequestedVersion && (
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Requested version</span>
                                <span className="flex items-center gap-1">
                                  {selectedTool.tool.publicationVersionBump && (
                                    <Badge
                                      variant="outline"
                                      className={cn(
                                        'text-[10px] capitalize px-1.5 py-0 border-[0.5px]',
                                        selectedTool.tool.publicationVersionBump === 'patch'
                                          ? 'border-slate-400 text-slate-700'
                                          : selectedTool.tool.publicationVersionBump === 'minor'
                                            ? 'border-yellow-400 text-yellow-700'
                                            : 'border-red-500 text-red-700'
                                      )}
                                    >
                                      {selectedTool.tool.publicationVersionBump}
                                    </Badge>
                                  )}
                                  <span>v{selectedTool.tool.publicationRequestedVersion}</span>
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="mt-4 space-y-2 text-xs">
                          <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[11px]">Request info</p>
                          <div className="space-y-2">
                            <RequestedByProfile
                              name={
                                (selectedTool as any).requestedBy?.name ||
                                (selectedTool as any).requestedBy?.id ||
                                selectedTool.tool.publicationRequestedBy ||
                                'Unknown'
                              }
                              avatar={(selectedTool as any).requestedBy?.avatar}
                              starshipName={(selectedTool as any).requestedByStarship?.name}
                              starshipSlug={(selectedTool as any).requestedByStarship?.slug}
                            />
                            <div className="flex items-center gap-2">
                              <div className="rounded-md border border-border/70 bg-background/70 px-2 py-0.5 flex items-center gap-1 text-[11px] font-mono">
                                <Icon name="clock" className="h-3 w-3" />
                                <span>Last updated</span>
                                <span>{selectedTool.tool.updatedAt ? new Date(selectedTool.tool.updatedAt as string).toLocaleString() : 'Unknown'}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 space-y-2 text-xs">
                          <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[11px]">Changelog</p>
                          <div className="rounded-md border border-border/70 bg-background/60 p-2 max-h-40 overflow-y-auto whitespace-pre-wrap">
                            {selectedTool.tool.publicationChangelog || 'No changelog was provided for this request.'}
                          </div>
                        </div>
                      </div>

                      <div className="pt-2 space-y-2 mt-3">
                        <Button variant="outline" className="w-full" onClick={closeToolDetails} disabled={approveMutation.isPending || rejectMutation.isPending}>
                          Close
                        </Button>
                        <Button
                          variant="outline"
                          className="w-full border-destructive text-destructive hover:bg-destructive/10"
                          onClick={handleRejectSelected}
                          disabled={approveMutation.isPending || rejectMutation.isPending || !selectedTool}
                        >
                          <Icon name="x-circle" className="h-4 w-4 mr-1.5" />
                          Reject
                        </Button>
                        <Button className="w-full" onClick={handleApproveSelected} disabled={approveMutation.isPending || rejectMutation.isPending || !selectedTool}>
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


