'use client'

import { useState, useEffect } from 'react'
// import { motion, AnimatePresence } from 'motion/react'
import {
  Agent,
  MCPServerOption,
  MCPServerConnector,
  mcpServerAPI,
  starshipAPI,
  Starship,
} from '@/lib/api'
import { AgentSelector } from '@/components/agents/AgentSelector'
import { ConnectorSelector } from '@/components/crew/ConnectorSelector'
import { ConnectorStatusDashboard } from '@/components/crew/ConnectorStatusDashboard'
import { ChatInterface } from '@/components/chat/ChatInterface'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  ArrowLeft, Users, Plug, Bot, Loader2, Activity,
  Shield, Zap, Brain, MessageSquare, Sparkles,
  Star, UserCheck, Settings, Network
} from 'lucide-react'
import Link from 'next/link'
import { useToast } from '@/hooks/useToast'

interface StarshipCrewContentProps {
  slug: string
}

export function StarshipCrewContent({ slug }: StarshipCrewContentProps) {
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [starship, setStarship] = useState<Starship | null>(null)
  const [starshipLoading, setStarshipLoading] = useState(true)
  const { toast } = useToast()

  // Connector instance state management
  const [connectorInstances, setConnectorInstances] = useState<MCPServerConnector[]>([])
  const [connectorsLoading, setConnectorsLoading] = useState(false)
  const [connectorsError, setConnectorsError] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)

  const handleAgentSelect = (agent: Agent) => {
    setSelectedAgent(agent)
    setSessionId(null) // Reset session when agent changes
  }

  const handleSessionCreated = (newSessionId: string) => {
    setSessionId(newSessionId)
  }

  // Fetch starship data on component mount
  useEffect(() => {
    fetchStarship()
  }, [slug])

  // Fetch connector instances when starship is loaded
  useEffect(() => {
    if (starship) {
      fetchConnectorInstances()
    }
  }, [starship])

  // Auto-refresh connector instances every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      fetchConnectorInstances()
    }, 30000) // 30 seconds

    return () => clearInterval(interval)
  }, [autoRefresh, slug])

  const fetchStarship = async () => {
    try {
      setStarshipLoading(true)
      const data = await starshipAPI.getStarshipBySlug(slug)
      setStarship(data.starship)
    } catch (error) {
      console.error('Failed to fetch starship:', error)
      toast({
        title: 'Error',
        description: 'Failed to load starship data',
        variant: 'destructive',
      })
    } finally {
      setStarshipLoading(false)
    }
  }

  const fetchConnectorInstances = async () => {
    try {
      setConnectorsLoading(true)
      setConnectorsError(null)
      const instances = await mcpServerAPI.getConnectorInstances(slug)
      setConnectorInstances(instances)
    } catch (error) {
      console.error('Failed to fetch connector instances:', error)
      setConnectorsError('Failed to load connectors. Please try again.')
    } finally {
      setConnectorsLoading(false)
    }
  }

  // Handle connector changes with proper error handling and loading states
  const handleConnectorsChange = async (newConnectors: MCPServerOption[]) => {
    try {
      setConnectorsLoading(true)
      setConnectorsError(null)

      console.log('[StarshipCrewContent] Handling connector changes:', newConnectors.length)

      // Compare with current connector instances to determine what changed
      const currentTemplateIds = new Set(connectorInstances.map(instance => instance.templateId))
      const newTemplateIds = new Set(newConnectors.map(template => template.id))

      // Find templates to create instances for (in new but not in current)
      const toCreate = newConnectors.filter(template => !currentTemplateIds.has(template.id))

      // Find instances to remove (in current but not in new)
      const toRemove = connectorInstances.filter(
        instance => !newTemplateIds.has(instance.templateId)
      )

      console.log(
        '[StarshipCrewContent] To create:',
        toCreate.length,
        'To remove:',
        toRemove.length
      )

      // Show notification for connector creation
      if (toCreate.length > 0) {
        const connectorNames = toCreate.map(t => t.name).join(', ')
        toast({
          title: 'Setting up connection',
          description: `We are setting up your connection with ${connectorNames} and will notify you once done.`,
          duration: 5000,
        })
      }

      // Execute connector instance operations
      const operations = [
        ...toCreate.map(template => {
          console.log(
            '[StarshipCrewContent] Creating connector instance for template:',
            template.name
          )

          // Check if template has API keys configured
          let env: string | undefined = undefined
          if (template.env) {
            console.log('[StarshipCrewContent] Template has environment variables:', template.env)
            // Store the API keys directly in the env field
            env = template.env
            console.log('[StarshipCrewContent] Creating connector with env:', env)
          }

          return mcpServerAPI.createConnectorInstance(slug, template.id, env)
        }),
        ...toRemove.map(instance => {
          console.log('[StarshipCrewContent] Removing connector instance:', instance.id)
          return mcpServerAPI.removeConnectorInstance(slug, instance.id)
        }),
      ]

      if (operations.length > 0) {
        await Promise.all(operations)

        // Show success notification
        if (toCreate.length > 0) {
          const connectorNames = toCreate.map(t => t.name).join(', ')
          toast({
            title: 'Connection established',
            description: `Successfully connected to ${connectorNames}`,
            variant: 'success',
            duration: 5000,
          })
        }

        if (toRemove.length > 0) {
          toast({
            title: 'Disconnected',
            description: `Connectors removed successfully`,
            variant: 'default',
            duration: 3000,
          })
        }
      }

      // Refresh connector instances to get current state
      await fetchConnectorInstances()
    } catch (error) {
      console.error('Failed to update connector instances:', error)
      setConnectorsError('Failed to update connectors. Please try again.')

      // Show error notification
      toast({
        title: 'Connection failed',
        description: 'Failed to set up connector. Please try again or check the logs for details.',
        variant: 'destructive',
        duration: 5000,
      })

      // Refresh connector instances to get current state
      await fetchConnectorInstances()
    } finally {
      setConnectorsLoading(false)
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-gradient-to-br from-background to-muted/5">
      {/* Enhanced Professional Header */}
      <div className="relative overflow-hidden">
        {/* Background gradient effect - reduced opacity */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-primary/2 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-primary/5" />
        
        <div className="relative flex items-center justify-between px-8 py-6 backdrop-blur-sm border-b border-border/40">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground hover:bg-primary/10 transition-all -ml-2 px-2"
              asChild
            >
              <Link href="/fleet">
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
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                    Crew Console
                  </h1>
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
                        <p className="text-[10px] text-muted-foreground">Active Agents</p>
                        <p className="text-sm font-bold">{selectedAgent ? 1 : 0}</p>
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
        <div
          className="border-r border-border/40 bg-gradient-to-br from-card/60 to-card/40 backdrop-blur-sm shadow-lg flex flex-col min-h-0"
        >
          <div className="p-6 pb-0 flex flex-col h-full min-h-0">
            <Tabs defaultValue="agents" className="flex flex-col h-full">
              <TabsList className="grid w-full grid-cols-2 mb-6 flex-shrink-0 bg-muted/50 p-1 rounded-lg">
                <TabsTrigger 
                  value="agents" 
                  className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm transition-all"
                >
                  <Bot className="h-4 w-4" />
                  AI Agents
                </TabsTrigger>
                <TabsTrigger 
                  value="connectors" 
                  className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm transition-all"
                >
                  <Plug className="h-4 w-4" />
                  Connectors
                </TabsTrigger>
              </TabsList>

              <TabsContent
                value="agents"
                className="flex-1 mt-0 data-[state=active]:flex data-[state=active]:flex-col min-h-0"
              >
                {/* <AnimatePresence mode="wait"> */}
                  <div
                    key="agents-content"
                    className="flex-1 overflow-y-auto px-6 pb-6 -mx-6 min-h-0 custom-scrollbar"
                  >
                    {starshipLoading ? (
                      <div className="flex items-center justify-center h-full">
                        <div
                          className="text-center"
                        >
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
                      />
                    )}
                  </div>
                {/* </AnimatePresence> */}
              </TabsContent>

              <TabsContent
                value="connectors"
                className="flex-1 mt-0 data-[state=active]:flex data-[state=active]:flex-col min-h-0"
              >
                {/* <AnimatePresence mode="wait"> */}
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

                    {/* Enhanced Status Dashboard */}
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
                {/* </AnimatePresence> */}
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Enhanced Right Content Area */}
        <div
          className="bg-gradient-to-br from-background via-background to-muted/5 overflow-hidden h-full"
        >
          {selectedAgent ? (
            <ChatInterface
              agent={selectedAgent}
              sessionId={sessionId}
              onSessionCreated={handleSessionCreated}
              starshipSlug={slug}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full">
              <div
                className="bg-gradient-to-br from-card via-card/95 to-primary/5 p-10 rounded-2xl text-center max-w-lg shadow-xl border border-primary/20"
              >
                <div className="mb-8">
                  <MessageSquare className="h-16 w-16 text-primary mx-auto" />
                </div>
                
                <h3
                  className="text-2xl font-bold mb-4 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent"
                >
                  Ready to Chat
                </h3>
                
                <p
                  className="text-muted-foreground mb-8 leading-relaxed"
                >
                  Select an AI agent from the sidebar to begin your conversation. Each agent has unique capabilities and specializations.
                </p>
                
                <div
                  className="space-y-4"
                >
                  
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
