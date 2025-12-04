'use client'

import Icon from '@/components/primitives/Icon'

import { useState } from 'react'
import { PageLayout } from '@/components/layout/PageLayout'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
import { usePendingAgents, useApproveAgentPublication, useRejectAgentPublication } from '@/hooks/useAdminAgents'

export default function PendingAgentsPage(): React.JSX.Element {
  const { isAuthenticated, isInstanceAdmin } = useAuth()
  const [page, setPage] = useState(1)
  const limit = 20

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
                    <Button size="sm" className="w-full" disabled={approveMutation.isPending || rejectMutation.isPending} onClick={() => handleApprove(agent.id)}>
                      <Icon name="check-circle" className="h-4 w-4 mr-1.5" />
                      Approve
                    </Button>
                    <Button size="sm" variant="outline" className="w-full" disabled={approveMutation.isPending || rejectMutation.isPending} onClick={() => handleReject(agent.id)}>
                      <Icon name="x-circle" className="h-4 w-4 mr-1.5" />
                      Reject
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
      </div>
    </PageLayout>
  )
}
