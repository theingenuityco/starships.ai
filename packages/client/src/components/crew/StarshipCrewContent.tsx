'use client'

import { useEffect, useState } from 'react'
// import { motion, AnimatePresence } from 'motion/react'
import { AgentSelector } from '@/components/agents/AgentSelector'
import { ConversationInterface } from '@/components/conversation/ConversationInterface'
import { NativeToolApiKeys } from '@/components/crew/NativeToolApiKeys'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useStarshipBySlug, useStarships } from '@/hooks/useStarships'
import { useToast } from '@/hooks/useToast'
import { MCPServerConnector, mcpServerAPI } from '@/lib/api'
import type { AgentModel } from '@starships/protocol'
import { Activity, ArrowLeft, Bot, Info, Loader2, MessageSquare, Plug, Shield, Users, Zap } from 'lucide-react'
import Link from 'next/link'

interface StarshipCrewContentProps {
  slug: string
}

export function StarshipCrewContent({ slug }: StarshipCrewContentProps) {
  const [selectedAgent, setSelectedAgent] = useState<AgentModel | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [agentsCount, setAgentsCount] = useState(0)
  const { toast } = useToast()
  const { data: starshipsResponse } = useStarships()
  const { data: starshipData, isLoading: starshipLoading, error: starshipError } = useStarshipBySlug(slug)
  const starships = starshipsResponse?.starships || []
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
    setConversationId(null) // Reset conversation when agent changes
  }

  const handleConversationCreated = (newConversationId: string | null) => {
    setConversationId(newConversationId)
  }

  // Function to manually show the info modal
  const handleShowInfo = () => {
    setIsManualOpen(true)
    setShowFloatingMessage(true)
  }

  // State for info button animation
  const [animateInfoButton, setAnimateInfoButton] = useState(false)

  // State for tools count
  const [configuredToolsCount, setConfiguredToolsCount] = useState(0)

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
        title: 'Error',
        description: 'Failed to load starship data',
        variant: 'destructive',
      })
    }
  }, [starshipError, toast])

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
                  <p className="text-sm text-muted-foreground">Manage your AI agents and connectors</p>
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
                      <Zap className="h-3.5 w-3.5 text-yellow-500" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">Tools</p>
                        <p className="text-sm font-bold">{configuredToolsCount}</p>
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
              <TabsList className="grid w-full grid-cols-2 mb-6 flex-shrink-0 bg-muted/50 p-1 rounded-lg">
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
                <TabsTrigger
                  value="api-keys"
                  className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm transition-all"
                >
                  <Zap className="h-4 w-4" />
                  Tools
                </TabsTrigger>
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
                  ) : (
                    <AgentSelector
                      selectedAgent={selectedAgent}
                      onAgentSelect={handleAgentSelect}
                      showCreateButton={true}
                      showFilters={true}
                      starshipId={starship?.id}
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

              <TabsContent value="api-keys" className="flex-1 mt-0 data-[state=active]:flex data-[state=active]:flex-col min-h-0">
                <div key="api-keys-content" className="flex-1 overflow-y-auto px-6 pb-6 -mx-6 min-h-0 custom-scrollbar">
                  {starship?.id ? (
                    <NativeToolApiKeys starshipId={starship.id} onConfiguredCountChange={setConfiguredToolsCount} />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
                        <p className="text-sm text-muted-foreground">Loading starship data...</p>
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Enhanced Right Content Area */}
        <div className="bg-gradient-to-br from-background via-background to-muted/5 overflow-hidden h-full">
          {selectedAgent ? (
            <ConversationInterface starshipId={slug} conversationId={conversationId} onConversationChange={handleConversationCreated} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="bg-gradient-to-br from-card via-card/95 to-primary/5 p-10 rounded-2xl text-center max-w-lg shadow-xl border border-primary/20">
                <div className="mb-8">
                  <MessageSquare className="h-16 w-16 text-primary mx-auto" />
                </div>

                <h3 className="text-2xl font-bold mb-4 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">Ready to Chat</h3>

                <p className="text-muted-foreground mb-8 leading-relaxed">Select an AI agent from the sidebar to begin your conversation. Each agent has unique capabilities and specializations.</p>

                <div className="space-y-4">
                  <div className="bg-gradient-to-r from-primary/10 to-cyan-500/10 rounded-lg p-4 text-sm text-muted-foreground flex items-center justify-center gap-2 border border-border/40">
                    <Shield className="h-4 w-4 text-primary flex-shrink-0" />
                    <span>Your conversations are secure and private</span>
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
