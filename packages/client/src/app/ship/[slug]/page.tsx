'use client'

import Icon from '@/components/primitives/Icon'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { PageLayout } from '@/components/layout/PageLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import DailyUsageCalendarHeatmap from '@/components/billing/DailyUsageCalendarHeatmap'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { useStarshipUsageViewModel } from '@/hooks/useStarshipUsageViewModel'
import { useAgentTools } from '@/hooks/useAgents'
import { useWallet } from '@/hooks/useWallet'
import { useStarshipConversations } from '@/hooks/useConversations'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbPage } from '@/components/ui/breadcrumb'

import type { AgentModel } from '@starships/protocol'
import { BlueprintVisualization } from '@/components/marketplace/BlueprintVisualization'
import { ConversationActivityCard } from '@/components/starship/ConversationActivityCard'
import { TopAgentCard } from '@/components/starship/TopAgentCard'
import { ShipHero } from '@/components/starship/ShipHero'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import AgentAvatar from '@/components/animated/AgentAvatar'
import { useMessageAttachments } from '@/hooks/useFileUpload'

export default function StarshipOverviewPage(): React.JSX.Element {
  const router = useRouter()
  const { slug } = useParams<{ slug: string }>()
  const { data: starship, isLoading: starshipLoading } = useStarshipBySlug(slug, true)
  const [selectedAgent, setSelectedAgent] = useState<AgentModel | null>(null)
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false)

  const starshipId = starship?.id || ''

  const selectedAgentAvatarAttachmentId = (selectedAgent as any)?.avatarAttachmentId as string | undefined
  const selectedAgentAvatarIds = useMemo(() => (selectedAgentAvatarAttachmentId ? [selectedAgentAvatarAttachmentId] : []), [selectedAgentAvatarAttachmentId])
  const { data: selectedAgentAvatarAttachments = [] } = useMessageAttachments(selectedAgentAvatarIds, starshipId)
  const selectedAgentAvatarUrl = selectedAgentAvatarAttachments?.[0]?.previewUrl

  const { data: wallet, isLoading: walletLoading } = useWallet(starshipId || '', !!starshipId)
  const { data: convData, isLoading: convLoading } = useStarshipConversations(starshipId || '', !!starshipId)
  const conversations = convData?.conversations || []

  // Fetch tools for the selected agent
  const { data: agentTools = [], isLoading: toolsLoading } = useAgentTools(selectedAgent?.id || '', starshipId || '', !!selectedAgent?.id && !!starshipId && isDetailsModalOpen)

  // Route-based tabs: no local tools list here; handled in /tools route

  const {
    isLoading: usageLoading,
    totalCost,
    totalTokens,
    promptTokens,
    completionTokens,
    totalRequests,
    avgTokensPerRequest,
    avgCostPerRequest,
    numberCompact,
    numberGroup,
    usd,
  } = useStarshipUsageViewModel(starshipId || null)

  return (
    <PageLayout>
      <div className="bg-background">
        <div className="flex flex-col items-center px-6 py-8">
          <div className="w-full max-w-6xl mx-auto space-y-8">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Icon name="rocket" className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold">{starship?.name || 'Starship'}</h1>
              </div>
              <div className="flex items-center justify-center gap-2">
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem>
                      <BreadcrumbPage className="font-mono">
                        <Badge variant="outline" className="font-mono">
                          {slug}
                        </Badge>
                      </BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
              </div>
              <p className="text-muted-foreground mt-2">Overview and quick controls for your starship</p>
            </div>

            {/* Tabs: Ship - Agents - Tools (route-based) */}
            <Tabs
              value="ship"
              onValueChange={value => {
                if (value === 'ship') router.push(`/ship/${slug}`)
                else if (value === 'agents') router.push(`/ship/${slug}/agents`)
                else if (value === 'tools') router.push(`/ship/${slug}/tools`)
                else if (value === 'schedules') router.push(`/ship/${slug}/schedules`)
              }}
              className="space-y-6"
            >
              <div className="flex justify-center">
                <TabsList className="mx-auto w-full sm:w-auto flex-wrap justify-center gap-1 rounded-2xl border border-border/40 bg-background/70 p-1 shadow-sm">
                  <TabsTrigger value="ship" className="gap-2 rounded-xl px-3 py-1">
                    <Icon name="rocket" className="h-4 w-4" />
                    <span>Ship</span>
                  </TabsTrigger>
                  <TabsTrigger value="agents" className="gap-2 rounded-xl px-3 py-1">
                    <Icon name="head-circuit" className="h-4 w-4" />
                    <span>Agents</span>
                  </TabsTrigger>
                  <TabsTrigger value="tools" className="gap-2 rounded-xl px-3 py-1">
                    <Icon name="wrench" className="h-4 w-4" />
                    <span>Tools</span>
                  </TabsTrigger>
                  <TabsTrigger value="schedules" className="gap-2 rounded-xl px-3 py-1">
                    <Icon name="clock" className="h-4 w-4" />
                    <span>Schedules</span>
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* Ship Tab - existing overview content */}
              <TabsContent value="ship">
                {/* Hero Section */}
                <ShipHero slug={slug} starshipId={starshipId} className="mb-6" />
                {/* Top Row - 4 Column Layout */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {/* Conversation Activity Card */}
                  <ConversationActivityCard
                    starshipSlug={slug}
                    recentConversation={conversations.length > 0 ? conversations[0] : null}
                    conversationCount={conversations.length}
                    className="lg:col-span-1"
                  />

                  {/* Top Agent Card */}
                  <TopAgentCard starshipSlug={slug} recentConversationId={conversations.length > 0 ? conversations[0].id : null} className="lg:col-span-1" />

                  <Card className="frosted-glass-card shadow-frosted-lg lg:col-span-2">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex flex-col gap-2">
                          <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                            <Icon name="credit-card" className="h-4 w-4" />
                            Wallet
                          </CardTitle>
                          {walletLoading || !starshipId ? (
                            <Skeleton className="h-[32px] w-24" />
                          ) : (
                            <div className="flex items-center gap-2">
                              <div className="text-2xl font-bold leading-8">${Number(wallet?.balance ?? 0).toFixed(2)}</div>
                              <div
                                className={cn(
                                  'w-2 h-2 rounded-full animate-pulse',
                                  Number(wallet?.balance ?? 0) >= 1.0 ? 'bg-green-400' : Number(wallet?.balance ?? 0) < 0.05 ? 'bg-red-400' : 'bg-orange-400'
                                )}
                              ></div>
                            </div>
                          )}
                        </div>
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/ship/${slug}/settings/billing`}>Billing</Link>
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <DailyUsageCalendarHeatmap starshipId={starshipId} weeks={52} cellSize={7} />
                    </CardContent>
                  </Card>
                </div>

                {/* Deployed Agents section removed */}

                {!starshipLoading && !starship && (
                  <Card className="shadow-sm border-destructive/50 bg-background/80">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-sm font-medium text-destructive">
                        <Icon name="info" className="h-4 w-4" />
                        Starship not found
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">Please check the URL and try again.</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Agents and Tools moved to their own routes */}
            </Tabs>
          </div>
        </div>
      </div>

      {/* Agent Details Modal */}
      <Dialog open={isDetailsModalOpen} onOpenChange={setIsDetailsModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedAgent ? (
                <Avatar className="h-6 w-6 ring-1 ring-border/40">
                  <AgentAvatar seed={selectedAgent.name} imageUrl={selectedAgentAvatarUrl} size={24} />
                </Avatar>
              ) : (
                <Icon name="user-cog" className="h-5 w-5 text-primary" />
              )}
              {selectedAgent?.name}
            </DialogTitle>
            <DialogDescription>{selectedAgent?.description || 'No description provided'}</DialogDescription>
          </DialogHeader>

          {selectedAgent && (
            <div className="space-y-4 mt-4 overflow-y-auto pr-2 flex-1">
              {/* System Prompt */}
              {selectedAgent.systemPrompt && (
                <div>
                  <h3 className="text-base font-semibold mb-3">System Prompt</h3>
                  <div className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg max-h-40 overflow-y-auto font-mono whitespace-pre-wrap">{selectedAgent.systemPrompt}</div>
                </div>
              )}

              {/* Blueprint Visualization */}
              {selectedAgent.blueprint && selectedAgent.blueprint.nodes && selectedAgent.blueprint.nodes.length > 0 && (
                <div>
                  <h3 className="text-base font-semibold mb-3">Blueprint</h3>
                  <BlueprintVisualization blueprint={selectedAgent.blueprint} className="h-[400px]" transparent={true} nodesDraggable={false} />
                </div>
              )}

              {/* Model Details */}
              <div>
                <h3 className="text-base font-semibold mb-3">Model Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Model</h4>
                    <Badge variant="secondary">{selectedAgent.model}</Badge>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Temperature</h4>
                    <p className="text-sm text-muted-foreground">{selectedAgent.temperature ?? 'Default'}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-4">
                  {selectedAgent.maxTokens && (
                    <div>
                      <h4 className="text-sm font-semibold mb-2">Max Tokens</h4>
                      <p className="text-sm text-muted-foreground">{selectedAgent.maxTokens}</p>
                    </div>
                  )}
                  {selectedAgent.timeout && (
                    <div>
                      <h4 className="text-sm font-semibold mb-2">Timeout</h4>
                      <p className="text-sm text-muted-foreground">{selectedAgent.timeout}ms</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Tools */}
              <div>
                <h3 className="text-base font-semibold mb-3">Allocated Tools {toolsLoading ? '...' : `(${agentTools.length})`}</h3>
                {toolsLoading ? (
                  <div className="space-y-2">
                    {[1, 2].map(i => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : agentTools.length > 0 ? (
                  <div className="space-y-2">
                    {agentTools.map(tool => (
                      <div key={tool.id} className="bg-muted/30 p-3 rounded-lg">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-xs">
                            {tool.slug}
                          </Badge>
                          <span className="text-sm font-medium">{tool.name}</span>
                        </div>
                        {tool.description && <p className="text-xs text-muted-foreground mt-1">{tool.description}</p>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No tools assigned to this agent</p>
                )}
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  className="flex-1"
                  onClick={() => {
                    setIsDetailsModalOpen(false)
                    router.push(`/ship/${slug}/conversations?agent=${selectedAgent.slug}`)
                  }}
                >
                  <Icon name="message-square" className="h-4 w-4 mr-2" />
                  Start Conversation
                </Button>
                <Button variant="outline" onClick={() => setIsDetailsModalOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PageLayout>
  )
}
