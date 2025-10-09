'use client'

import React from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { PageLayout } from '@/components/layout/PageLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import BalanceStatusIndicator from '@/components/billing/BalanceStatusIndicator'
import { UsageKpiCards } from '@/components/profile/UsageKpiCards'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { useStarshipUsageViewModel } from '@/hooks/useStarshipUsageViewModel'
import { useStarshipAgents } from '@/hooks/useAgents'
import { useEnvironmentVariables } from '@/hooks/useEnvironmentVariables'
import { useWallet } from '@/hooks/useWallet'
import { useStarshipConversations } from '@/hooks/useConversations'
import { Rocket, Activity, CreditCard, Key, Bot, MessageSquare, Info } from 'lucide-react'

export default function StarshipOverviewPage(): React.JSX.Element {
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
