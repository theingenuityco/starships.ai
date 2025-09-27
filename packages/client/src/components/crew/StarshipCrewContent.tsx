'use client'

import { useEffect, useState } from 'react'
// import { motion, AnimatePresence } from 'motion/react'
import { AgentSelector } from '@/components/agents/AgentSelector'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useStarshipBySlug, useUserStarships } from '@/hooks/useStarships'
import { useToast } from '@/hooks/useToast'
import { useAuth } from '@/hooks/useAuth'
import { MCPServerConnector, mcpServerAPI } from '@/lib/api'
import type { AgentModel } from '@starships/protocol'
import { Activity, ArrowLeft, Bot, Info, Loader2, Plug, Settings, Users, Zap } from 'lucide-react'
import Link from 'next/link'

interface StarshipCrewContentProps {
  slug: string
}

export function StarshipCrewContent({ slug }: StarshipCrewContentProps) {
  const [selectedAgent, setSelectedAgent] = useState<AgentModel | null>(null)
  const [agentsCount, setAgentsCount] = useState(0)
  const { toast } = useToast()
  const { userId } = useAuth()
  const { data: starships = [] } = useUserStarships(userId || '', !!userId)
  const { data: starshipData, isLoading: starshipLoading, error: starshipError } = useStarshipBySlug(slug)
  const starship = starshipData || null

  // Connector instance state management
  const [connectorInstances, setConnectorInstances] = useState<MCPServerConnector[]>([])
  const [autoRefresh] = useState(true)

  // Floating message state
  const [showFloatingMessage, setShowFloatingMessage] = useState(false)
  const [isManualOpen, setIsManualOpen] = useState(false)
  const [currentTab, setCurrentTab] = useState('agents')

  const handleAgentSelect = (agent: AgentModel) => {
    setSelectedAgent(agent)
  }

  // Function to manually show the info modal
  const handleShowInfo = () => {
    setIsManualOpen(true)
    setShowFloatingMessage(true)
  }

  // State for info button animation
  const [animateInfoButton, setAnimateInfoButton] = useState(false)

  // Native tool functionality removed - keeping for future extensibility
  const configuredToolsCount = 0

  // Handle dismissing the floating message
  const handleDismissMessage = () => {
    setShowFloatingMessage(false)
    setIsManualOpen(false)
    // Animate the info button to show where the information is stored
    setAnimateInfoButton(true)
    setTimeout(() => setAnimateInfoButton(false), 2000)
  }

  // Handle tab change
  const handleTabChange = (value: string) => {
    // Skip connectors tab since it's hidden
    if (value === 'connectors') {
      return
    }
    setCurrentTab(value)
  }

  // Handle starship loading error with toast
  useEffect(() => {
    if (starshipError) {
      toast({
        title: 'Starship Not Found',
        description: `Could not find starship "${slug}". It may not exist or you may not have access to it.`,
        variant: 'destructive',
      })
    }
  }, [starshipError, slug, toast])

  // Check if this is the user's first starship and show onboarding
  useEffect(() => {
    if (starship && starships && starships.length === 1) {
      const dismissed = localStorage.getItem('crew-console-message-dismissed')
      if (!dismissed) {
        setShowFloatingMessage(true)
      }
    }
  }, [starship, starships])

  // Fetch connector instances when starship is loaded
  useEffect(() => {
    const fetchConnectorInstances = async () => {
      try {
        const instances = await mcpServerAPI.getConnectorInstances(slug)
        setConnectorInstances(instances)
      } catch (error) {
        console.error('Failed to fetch connector instances:', error)
      }
    }

    if (starship) {
      fetchConnectorInstances()
    }
  }, [starship, slug])

  // Auto-refresh connector instances every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return

    const fetchConnectorInstances = async () => {
      try {
        const instances = await mcpServerAPI.getConnectorInstances(slug)
        setConnectorInstances(instances)
      } catch (error) {
        console.error('Failed to fetch connector instances:', error)
      }
    }

    const interval = setInterval(() => {
      fetchConnectorInstances()
    }, 30000) // 30 seconds

    return () => clearInterval(interval)
  }, [autoRefresh, slug])

  return (
    <div className="h-full flex flex-col overflow-hidden bg-gradient-to-br from-background to-muted/5">
      {/* Enhanced Professional Header */}
      <div className="relative overflow-hidden">
        {/* Background gradient effect - reduced opacity */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-primary/2 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-primary/5" />

        <div className="relative flex items-center justify-between px-8 py-6 backdrop-blur-sm border-b border-border/40">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground hover:bg-primary/10 transition-all -ml-2 px-2" asChild>
              <Link href="/">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="absolute inset-0 bg-cyan-500/5 blur-sm" />
                  <div className="relative bg-gradient-to-br from-cyan-500/15 to-cyan-500/10 p-3 rounded-xl shadow-sm border border-cyan-500/15">
                    <Users className="h-6 w-6 text-cyan-500" />
                  </div>
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">Crew Console</h1>
                    <button onClick={handleShowInfo} className="rounded-full p-0 hover:opacity-80 transition-all relative" title="Crew Console Guide">
                      <Info className={`h-6 w-6 text-emerald-500 transition-all ${animateInfoButton ? 'scale-110' : ''}`} />
                      {animateInfoButton && <span className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping-slow" />}
                    </button>
                  </div>
                  <p className="text-sm text-muted-foreground">Manage your AI agents and tools</p>
                </div>
              </div>

              <div className="h-10 w-px bg-gradient-to-b from-transparent via-border/60 to-transparent" />

              {/* Stats Cards moved here */}
              <div className="flex items-center gap-3">
                <Card className="bg-card/60 backdrop-blur-sm border-border/40 shadow-sm">
                  <CardContent className="p-2">
                    <div className="flex items-center gap-2">
                      <Bot className="h-3.5 w-3.5 text-primary" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">Agents</p>
                        <p className="text-sm font-bold">{agentsCount}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-card/60 backdrop-blur-sm border-border/40 shadow-sm">
                  <CardContent className="p-2">
                    <div className="flex items-center gap-2">
                      <Plug className="h-3.5 w-3.5 text-cyan-500" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">Connectors</p>
                        <p className="text-sm font-bold">{connectorInstances.length}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-card/60 backdrop-blur-sm border-border/40 shadow-sm">
                  <CardContent className="p-2">
                    <div className="flex items-center gap-2">
                      <Settings className="h-3.5 w-3.5 text-yellow-500" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">Config</p>
                        <p className="text-sm font-bold">Ready</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Starship info moved here */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="absolute inset-0 bg-green-500/5" />
                <div className="relative bg-gradient-to-br from-green-500/15 to-green-500/10 p-2 rounded-lg">
                  <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-base font-semibold text-foreground">
                  {starshipLoading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Loading...
                    </span>
                  ) : (
                    starship?.name || 'Unknown Starship'
                  )}
                </span>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Activity className="h-3 w-3" />
                  Active Starship
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced Main Content Layout */}
      <div className="grid grid-cols-[380px_1fr] flex-1 min-h-0">
        {/* Enhanced Left Sidebar */}
        <div className="border-r border-border/40 bg-gradient-to-br from-card/60 to-card/40 backdrop-blur-sm shadow-lg flex flex-col min-h-0">
          <div className="p-6 pb-0 flex flex-col h-full min-h-0">
            <Tabs value={currentTab} onValueChange={handleTabChange} className="flex flex-col h-full">
              <TabsList className="grid w-full grid-cols-1 mb-6 flex-shrink-0 bg-muted/50 p-1 rounded-lg">
                <TabsTrigger value="agents" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm transition-all">
                  <Bot className="h-4 w-4" />
                  Agents
                </TabsTrigger>
                {/* <TabsTrigger
                  value="connectors"
                  className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm transition-all"
                >
                  <Plug className="h-4 w-4" />
                  Connectors
                </TabsTrigger> */}
              </TabsList>

              <TabsContent value="agents" className="flex-1 mt-0 data-[state=active]:flex data-[state=active]:flex-col min-h-0">
                {/* <AnimatePresence mode="wait"> */}
                <div key="agents-content" className="flex-1 overflow-y-auto px-6 pb-6 -mx-6 min-h-0 custom-scrollbar">
                  {starshipLoading ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <div className="relative">
                          <div className="absolute inset-0 bg-primary/5 blur-sm" />
                          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4 relative" />
                        </div>
                        <p className="text-sm text-muted-foreground font-medium">Discovering available agents...</p>
                      </div>
                    </div>
                  ) : !starship ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <div className="relative">
                          <div className="absolute inset-0 bg-destructive/5 blur-sm" />
                          <div className="relative bg-gradient-to-br from-destructive/15 to-destructive/10 p-12 rounded-xl shadow-sm border border-destructive/15">
                            <svg className="h-16 w-16 text-destructive mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5l-6.928-12c-.77-.833-2.694-.833-3.464 0l-6.928 12c-.77.833.192 2.5 1.732 2.5z"
                              />
                            </svg>
                            <h3 className="text-xl font-bold mb-2">Starship Not Found</h3>
                            <p className="text-sm text-muted-foreground mb-4">The starship &quot;{slug}&quot; could not be found or you don&apos;t have access to it.</p>
                            <Button asChild variant="outline">
                              <Link href="/">Return Home</Link>
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <AgentSelector
                      selectedAgent={selectedAgent}
                      onAgentSelect={handleAgentSelect}
                      showCreateButton={true}
                      showFilters={true}
                      starshipId={starship.id}
                      onAgentsCountChange={setAgentsCount}
                    />
                  )}
                </div>
                {/* </AnimatePresence> */}
              </TabsContent>

              {/* <TabsContent
                value="connectors"
                className="flex-1 mt-0 data-[state=active]:flex data-[state=active]:flex-col min-h-0"
              >
                <AnimatePresence mode="wait">
                  <div
                    key="connectors-content"
                    className="flex-1 overflow-y-auto px-6 pb-6 -mx-6 space-y-4 min-h-0 custom-scrollbar"
                  >
                    <ConnectorSelector
                      starshipId={slug}
                      selectedConnectors={connectorInstances
                        .filter(instance => instance.template)
                        .map(instance => instance.template!)}
                      onConnectorsChange={handleConnectorsChange}
                      disabled={connectorsLoading}
                      className="mb-0"
                      connectorInstances={connectorInstances}
                    />
                    
                    {connectorsError && (
                      <div
                        className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-600 dark:text-red-400"
                      >
                        {connectorsError}
                      </div>
                    )}

                    {connectorInstances.length > 0 && (
                      <div
                        className="mt-3"
                      >
                        <ConnectorStatusDashboard
                          starshipId={slug}
                          connectorInstances={connectorInstances}
                          compact={true}
                        />
                      </div>
                    )}

                  </div>
                </AnimatePresence>
              </TabsContent> */}
            </Tabs>
          </div>
        </div>

        {/* Enhanced Right Content Area */}
        <div className="bg-gradient-to-br from-background via-background to-muted/5 overflow-hidden h-full">
          {selectedAgent ? (
            <div className="flex flex-col h-full">
              {/* Agent Details Header */}
              <div className="border-b border-border/40 bg-gradient-to-r from-card/60 to-card/40 backdrop-blur-sm">
                <div className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <div className="absolute inset-0 bg-primary/5 blur-sm" />
                      <div className="relative bg-gradient-to-br from-primary/15 to-primary/10 p-3 rounded-xl shadow-sm border border-primary/15">
                        <Bot className="h-6 w-6 text-primary" />
                      </div>
                    </div>
                    <div className="flex flex-col">
                      <h2 className="text-xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">{selectedAgent.name}</h2>
                      <p className="text-sm text-muted-foreground">{selectedAgent.description || 'AI Agent Configuration'}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Agent Management Content */}
              <div className="flex-1 overflow-y-auto p-6">
                <div className="max-w-4xl mx-auto space-y-6">
                  {/* Agent Configuration Card */}
                  <Card className="bg-card/60 backdrop-blur-sm border-border/40 shadow-sm">
                    <CardContent className="p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <Settings className="h-5 w-5 text-primary" />
                        <h3 className="text-lg font-semibold">Agent Configuration</h3>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-muted-foreground">Agent Name</label>
                          <p className="text-sm bg-muted/50 rounded p-2">{selectedAgent.name}</p>
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-muted-foreground">Model</label>
                          <p className="text-sm bg-muted/50 rounded p-2">{selectedAgent.model || 'Default Model'}</p>
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <label className="text-sm font-medium text-muted-foreground">Description</label>
                          <p className="text-sm bg-muted/50 rounded p-3">{selectedAgent.description || 'No description available'}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Agent Actions Card */}
                  <Card className="bg-card/60 backdrop-blur-sm border-border/40 shadow-sm">
                    <CardContent className="p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <Zap className="h-5 w-5 text-yellow-500" />
                        <h3 className="text-lg font-semibold">Agent Management</h3>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <Button variant="outline" className="flex items-center gap-2">
                          <Settings className="h-4 w-4" />
                          Edit Configuration
                        </Button>
                        <Button variant="outline" className="flex items-center gap-2">
                          <Activity className="h-4 w-4" />
                          View Analytics
                        </Button>
                        <Button variant="outline" className="flex items-center gap-2">
                          <Plug className="h-4 w-4" />
                          Manage Tools
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="bg-gradient-to-br from-card via-card/95 to-primary/5 p-10 rounded-2xl text-center max-w-lg shadow-xl border border-primary/20">
                <div className="mb-8">
                  <Settings className="h-16 w-16 text-primary mx-auto" />
                </div>

                <h3 className="text-2xl font-bold mb-4 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">Agent Management</h3>

                <p className="text-muted-foreground mb-8 leading-relaxed">Select an AI agent from the sidebar to view and manage its configuration, settings, and connected tools.</p>

                <div className="space-y-4">
                  <div className="bg-gradient-to-r from-primary/10 to-cyan-500/10 rounded-lg p-4 text-sm text-muted-foreground flex items-center justify-center gap-2 border border-border/40">
                    <Bot className="h-4 w-4 text-primary flex-shrink-0" />
                    <span>Manage agents and tools from one central location</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
