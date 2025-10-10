'use client'

import React from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { PageLayout } from '@/components/layout/PageLayout'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel'
import BalanceStatusIndicator from '@/components/billing/BalanceStatusIndicator'
import { UsageKpiCards } from '@/components/profile/UsageKpiCards'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { useStarshipUsageViewModel } from '@/hooks/useStarshipUsageViewModel'
import { useStarshipAgents } from '@/hooks/useAgents'
import { useEnvironmentVariables } from '@/hooks/useEnvironmentVariables'
import { useWallet } from '@/hooks/useWallet'
import { useStarshipConversations } from '@/hooks/useConversations'
import { Rocket, Activity, CreditCard, Key, Bot, MessageSquare, Info, Sparkles, ChevronRight } from 'lucide-react'

export default function StarshipOverviewPage(): React.JSX.Element {
  const router = useRouter()
  const { slug } = useParams<{ slug: string }>()
  const { data: starship, isLoading: starshipLoading } = useStarshipBySlug(slug, true)

  const starshipId = starship?.id || ''

  const { data: agents = [], isLoading: agentsLoading } = useStarshipAgents(starshipId || '', !!starshipId)
  const { data: envVars = [], isLoading: envLoading } = useEnvironmentVariables(starshipId || '', !!starshipId)
  const { data: wallet, isLoading: walletLoading } = useWallet(starshipId || '', !!starshipId)
  const { data: convData, isLoading: convLoading } = useStarshipConversations(starshipId || '', !!starshipId)
  const conversations = convData?.conversations || []

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

            <section aria-labelledby="usage-kpis" className="rounded-xl border border-border/80 bg-background p-6">
              <UsageKpiCards
                isLoading={usageLoading}
                totalCost={totalCost}
                totalTokens={totalTokens}
                promptTokens={promptTokens}
                completionTokens={completionTokens}
                totalRequests={totalRequests}
                avgTokensPerRequest={avgTokensPerRequest}
                avgCostPerRequest={avgCostPerRequest}
                numberCompact={numberCompact}
                numberGroup={numberGroup}
                usd={usd}
              />
            </section>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Wallet */}
              <Card className="shadow-sm border-border/50 bg-background/80">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <CreditCard className="h-4 w-4" />
                    Wallet
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-2xl font-bold">{walletLoading ? '—' : `$${Number(wallet?.balance ?? 0).toFixed(2)}`}</div>
                      <div className="text-xs text-muted-foreground">Active balance</div>
                    </div>
                    <BalanceStatusIndicator wallet={wallet} isLoading={walletLoading} variant="minimal" />
                  </div>
                  <div className="mt-4 flex justify-end">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/ship/${slug}/management?tab=billing`}>Billing</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>

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

            <section aria-labelledby="deployed-agents" className="rounded-xl border border-border/80 bg-background p-6">
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

              {agentsLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[1, 2, 3].map(i => (
                    <Card key={i} className="frosted-glass-card shadow-frosted-lg">
                      <CardHeader>
                        <Skeleton className="h-5 w-3/4 mb-2" />
                        <Skeleton className="h-4 w-full" />
                      </CardHeader>
                      <CardContent>
                        <Skeleton className="h-4 w-1/2" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : agents.length > 0 ? (
                agents.length > 3 ? (
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
                            onClick={() => router.push(`/ship/${slug}/conversations?agent=${agent.id}`)}
                          >
                            <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                            <CardHeader className="pb-3 relative z-10">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <CardTitle className="text-base font-semibold truncate">{agent.name}</CardTitle>
                                  <CardDescription className="text-xs mt-1 line-clamp-2">{agent.description || 'No description provided'}</CardDescription>
                                </div>
                                <Bot className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                              </div>
                            </CardHeader>
                            <CardContent className="pt-0 relative z-10">
                              <div className="flex items-center justify-between">
                                <Badge variant="secondary" className="text-xs">
                                  {agent.model || 'N/A'}
                                </Badge>
                                <Button asChild size="sm" variant="ghost" className="h-8 px-2">
                                  <Link href={`/ship/${slug}/conversations?agent=${agent.id}`}>
                                    <MessageSquare className="h-3.5 w-3.5" />
                                  </Link>
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
                        onClick={() => router.push(`/ship/${slug}/conversations?agent=${agent.id}`)}
                      >
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                        <CardHeader className="pb-3 relative z-10">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <CardTitle className="text-base font-semibold truncate">{agent.name}</CardTitle>
                              <CardDescription className="text-xs mt-1 line-clamp-2">{agent.description || 'No description provided'}</CardDescription>
                            </div>
                            <Bot className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0 relative z-10">
                          <div className="flex items-center justify-between">
                            <Badge variant="secondary" className="text-xs">
                              {agent.model || 'N/A'}
                            </Badge>
                            <Button asChild size="sm" variant="ghost" className="h-8 px-2">
                              <Link href={`/ship/${slug}/conversations?agent=${agent.id}`}>
                                <MessageSquare className="h-3.5 w-3.5" />
                              </Link>
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )
              ) : (
                <div className="text-center py-12">
                  <Bot className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Agents Deployed</h3>
                  <p className="text-sm text-muted-foreground mb-6">Deploy your first agent to start using AI capabilities</p>
                  <Button asChild>
                    <Link href={`/ship/${slug}/conversations`}>
                      <Bot className="w-4 h-4 mr-2" />
                      Deploy Agent
                    </Link>
                  </Button>
                </div>
              )}
            </section>

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
    </PageLayout>
  )
}
