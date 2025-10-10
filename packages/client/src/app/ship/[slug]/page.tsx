'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { PageLayout } from '@/components/layout/PageLayout'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel'
import BalanceStatusIndicator from '@/components/billing/BalanceStatusIndicator'
import { DailyUsageCostSparkline } from '@/components/billing/DailyUsageCostSparkline'
import { UsageKpiCards } from '@/components/profile/UsageKpiCards'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { useStarshipUsageViewModel } from '@/hooks/useStarshipUsageViewModel'
import { useStarshipAgents, useAgentTools } from '@/hooks/useAgents'
import { useEnvironmentVariables } from '@/hooks/useEnvironmentVariables'
import { useWallet } from '@/hooks/useWallet'
import { useStarshipConversations } from '@/hooks/useConversations'
import { Rocket, Activity, CreditCard, Key, Bot, MessageSquare, Info, Sparkles, ChevronRight } from 'lucide-react'
import type { AgentModel } from '@starships/protocol'
import { BlueprintVisualization } from '@/components/marketplace/BlueprintVisualization'
import { ConversationActivityCard } from '@/components/starship/ConversationActivityCard'
import { cn } from '@/lib/utils'

export default function StarshipOverviewPage(): React.JSX.Element {
  const router = useRouter()
  const { slug } = useParams<{ slug: string }>()
  const { data: starship, isLoading: starshipLoading } = useStarshipBySlug(slug, true)
  const [selectedAgent, setSelectedAgent] = useState<AgentModel | null>(null)
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false)

  const starshipId = starship?.id || ''

  const { data: agents = [], isLoading: agentsLoading } = useStarshipAgents(starshipId || '', !!starshipId)
  const { data: envVars = [], isLoading: envLoading } = useEnvironmentVariables(starshipId || '', !!starshipId)
  const { data: wallet, isLoading: walletLoading } = useWallet(starshipId || '', !!starshipId)
  const { data: convData, isLoading: convLoading } = useStarshipConversations(starshipId || '', !!starshipId)
  const conversations = convData?.conversations || []

  // Fetch tools for the selected agent
  const { data: agentTools = [], isLoading: toolsLoading } = useAgentTools(selectedAgent?.id || '', starshipId || '', !!selectedAgent?.id && !!starshipId && isDetailsModalOpen)

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

  const topAgents = agents.slice(0, 3).map(a => a.name)
  const topConversations = conversations.slice(0, 3).map(c => c.title || 'Untitled')

  return (
    <PageLayout>
      <div className="bg-background">
        <div className="flex flex-col items-center px-6 py-8">
          <div className="w-full max-w-6xl mx-auto space-y-8">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Rocket className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold">{starship?.name || 'Starship'}</h1>
              </div>
              <div className="flex items-center justify-center gap-2">
                <Badge variant="outline">/{slug}</Badge>
                {starshipId && <Badge variant="secondary">ID: {starshipId.slice(0, 8)}…</Badge>}
              </div>
              <p className="text-muted-foreground mt-2">Overview and quick controls for your starship</p>
            </div>

            {/* Top Row - 4 Column Layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card className="frosted-glass-card shadow-frosted-lg">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex flex-col gap-2">
                      <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <CreditCard className="h-4 w-4" />
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
                      <Link href={`/ship/${slug}/management?tab=billing`}>Billing</Link>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  <DailyUsageCostSparkline starshipId={starshipId} inline />
                </CardContent>
              </Card>

              {/* Conversation Activity Card */}
              <ConversationActivityCard starshipSlug={slug} recentConversation={conversations.length > 0 ? conversations[0] : null} conversationCount={conversations.length} />
            </div>

            <section aria-labelledby="deployed-agents">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 id="deployed-agents" className="text-lg font-semibold flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    Deployed Agents
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">Active agents available in this starship</p>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/ship/${slug}/conversations`}>
                    View All
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Link>
                </Button>
              </div>

              {agentsLoading || agents.length === 0 ? (
                <div className="w-full px-1 py-2">
                  <div className="-ml-2 md:-ml-4 py-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="pl-2 md:pl-4 md:basis-1/2 lg:basis-1/3 pb-2">
                        <Card className="frosted-glass-card shadow-frosted-lg">
                          <CardHeader className="pb-3">
                            <div className="flex items-center gap-2 mb-1">
                              <Skeleton className="h-4 w-4" />
                              <Skeleton className="h-4 w-32" />
                            </div>
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-3/4" />
                          </CardHeader>
                          <CardContent className="pt-0">
                            <div className="flex items-center justify-between">
                              <Skeleton className="h-5 w-16" />
                              <Skeleton className="h-8 w-14" />
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    ))}
                  </div>
                </div>
              ) : agents.length > 3 ? (
                <Carousel
                  opts={{
                    align: 'start',
                    loop: true,
                  }}
                  className="w-full px-1 py-2"
                >
                  <CarouselContent className="-ml-2 md:-ml-4 py-2">
                    {agents.map(agent => (
                      <CarouselItem key={agent.id} className="pl-2 md:pl-4 md:basis-1/2 lg:basis-1/3 pb-2">
                        <Card
                          className="frosted-glass-card shadow-frosted-lg hover:shadow-frosted-lg group relative overflow-hidden transition-shadow duration-300 h-full cursor-pointer"
                          onClick={() => {
                            setSelectedAgent(agent)
                            setIsDetailsModalOpen(true)
                          }}
                        >
                          <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                          <CardHeader className="pb-3 relative z-10">
                            <div className="flex items-center gap-2 mb-1">
                              <Bot className="h-4 w-4 text-primary flex-shrink-0" />
                              <CardTitle className="text-base font-semibold truncate">{agent.name}</CardTitle>
                            </div>
                            <CardDescription className="text-xs line-clamp-2">{agent.description || 'No description provided'}</CardDescription>
                          </CardHeader>
                          <CardContent className="pt-0 relative z-10">
                            <div className="flex items-center justify-between">
                              <Badge variant="secondary" className="text-xs">
                                {agent.model || 'N/A'}
                              </Badge>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8"
                                onClick={e => {
                                  e.stopPropagation()
                                  router.push(`/ship/${slug}/conversations?agent=${agent.id}`)
                                }}
                              >
                                <MessageSquare className="h-3.5 w-3.5 mr-1" />
                                Chat
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                  <CarouselPrevious className="hidden md:flex" />
                  <CarouselNext className="hidden md:flex" />
                </Carousel>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {agents.map(agent => (
                    <Card
                      key={agent.id}
                      className="frosted-glass-card shadow-frosted-lg hover:shadow-frosted-lg group relative overflow-hidden transition-shadow duration-300 cursor-pointer"
                      onClick={() => {
                        setSelectedAgent(agent)
                        setIsDetailsModalOpen(true)
                      }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                      <CardHeader className="pb-3 relative z-10">
                        <div className="flex items-center gap-2 mb-1">
                          <Bot className="h-4 w-4 text-primary flex-shrink-0" />
                          <CardTitle className="text-base font-semibold truncate">{agent.name}</CardTitle>
                        </div>
                        <CardDescription className="text-xs line-clamp-2">{agent.description || 'No description provided'}</CardDescription>
                      </CardHeader>
                      <CardContent className="pt-0 relative z-10">
                        <div className="flex items-center justify-between">
                          <Badge variant="secondary" className="text-xs">
                            {agent.model || 'N/A'}
                          </Badge>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8"
                            onClick={e => {
                              e.stopPropagation()
                              router.push(`/ship/${slug}/conversations?agent=${agent.id}`)
                            }}
                          >
                            <MessageSquare className="h-3.5 w-3.5 mr-1" />
                            Chat
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </section>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Agents */}
              <Card className="shadow-sm border-border/50 bg-background/80">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Bot className="h-4 w-4" />
                    Agents
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{agentsLoading ? '—' : agents.length}</div>
                  <div className="text-xs text-muted-foreground mt-1">{agentsLoading ? 'Loading…' : agents.length > 0 ? topAgents.join(', ') : 'No agents deployed'}</div>
                  <div className="mt-4 flex justify-end">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/ship/${slug}/conversations`}>View</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Environment */}
              <Card className="shadow-sm border-border/50 bg-background/80">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Key className="h-4 w-4" />
                    Environment
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{envLoading ? '—' : envVars.length}</div>
                  <div className="text-xs text-muted-foreground mt-1">{envLoading ? 'Loading…' : envVars.length > 0 ? 'Configured variables' : 'No variables set'}</div>
                  <div className="mt-4 flex justify-end">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/ship/${slug}/settings/environment`}>Manage</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Conversations */}
              <Card className="shadow-sm border-border/50 bg-background/80">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <MessageSquare className="h-4 w-4" />
                    Conversations
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{convLoading ? '—' : conversations.length}</div>
                  <div className="text-xs text-muted-foreground mt-1">{convLoading ? 'Loading…' : conversations.length > 0 ? topConversations.join(', ') : 'No conversations yet'}</div>
                  <div className="mt-4 flex justify-end">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/ship/${slug}/conversations`}>Open</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            <section aria-labelledby="quick-actions" className="rounded-xl border border-border/80 bg-background p-6">
              <div className="flex flex-wrap gap-3 justify-center sm:justify-start">
                <Button asChild>
                  <Link href={`/ship/${slug}/conversations`}>
                    <MessageSquare className="w-4 h-4 mr-2" />
                    Open Conversations
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href={`/ship/${slug}/management?tab=usage`}>
                    <Activity className="w-4 h-4 mr-2" />
                    View Analytics
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href={`/ship/${slug}/management?tab=billing`}>
                    <CreditCard className="w-4 h-4 mr-2" />
                    Manage Billing
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href={`/ship/${slug}/settings/environment`}>
                    <Key className="w-4 h-4 mr-2" />
                    Environment
                  </Link>
                </Button>
              </div>
            </section>

            {!starshipLoading && !starship && (
              <Card className="shadow-sm border-destructive/50 bg-background/80">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm font-medium text-destructive">
                    <Info className="h-4 w-4" />
                    Starship not found
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Please check the URL and try again.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Agent Details Modal */}
      <Dialog open={isDetailsModalOpen} onOpenChange={setIsDetailsModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
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
                  <div className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg max-h-40 overflow-y-auto font-mono text-xs whitespace-pre-wrap">{selectedAgent.systemPrompt}</div>
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
                    router.push(`/ship/${slug}/conversations?agent=${selectedAgent.id}`)
                  }}
                >
                  <MessageSquare className="h-4 w-4 mr-2" />
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
