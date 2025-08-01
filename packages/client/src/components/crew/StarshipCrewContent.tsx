'use client'

import { useState, useEffect } from 'react'
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
import { ConnectorTroubleshootingPanel } from '@/components/crew/ConnectorTroubleshootingPanel'
import { ChatInterface } from '@/components/chat/ChatInterface'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeft, Users, Plug, Bot, Loader2 } from 'lucide-react'
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
    <div className="h-full flex flex-col overflow-hidden">
      {/* Professional Header */}
      <div className="flex items-center justify-between px-8 py-6 bg-gradient-to-r from-card/50 to-muted/30 border-b border-border/50 backdrop-blur-sm">
        <div className="flex items-center gap-6">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
            asChild
          >
            <Link href="/fleet">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Fleet
            </Link>
          </Button>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-primary/20 to-primary/10 p-2.5 rounded-lg shadow-sm border border-primary/20">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div className="flex flex-col">
                <h1 className="text-xl font-bold text-foreground">Crew Console</h1>
              </div>
            </div>

            <div className="h-8 w-px bg-border/60" />

            <div className="flex items-center gap-2">
              <div className="bg-muted/50 p-1.5 rounded-md">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-foreground">
                  {starshipLoading ? 'Loading...' : starship?.name || 'Unknown Starship'}
                </span>
                <span className="text-xs text-muted-foreground">Active Mission</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3"></div>
      </div>

      {/* Main Content - Two Column Layout */}
      <div className="grid grid-cols-[400px_1fr] flex-1 min-h-0">
        {/* Left sidebar - fixed width with tabs */}
        <div className="border-r bg-card shadow-sm flex flex-col min-h-0">
          <div className="p-6 pb-0 flex flex-col h-full min-h-0">
            <Tabs defaultValue="agents" className="flex flex-col h-full">
              <TabsList className="grid w-full grid-cols-2 mb-6 flex-shrink-0">
                <TabsTrigger value="agents" className="flex items-center gap-2">
                  <Bot className="h-4 w-4" />
                  Agents
                </TabsTrigger>
                <TabsTrigger value="connectors" className="flex items-center gap-2">
                  <Plug className="h-4 w-4" />
                  Connectors
                </TabsTrigger>
              </TabsList>

              <TabsContent
                value="agents"
                className="flex-1 mt-0 data-[state=active]:flex data-[state=active]:flex-col min-h-0"
              >
                <div className="flex-1 overflow-y-auto px-6 pb-6 -mx-6 min-h-0">
                  {starshipLoading ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
                        <p className="text-sm text-muted-foreground">Loading agents...</p>
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
              </TabsContent>

              <TabsContent
                value="connectors"
                className="flex-1 mt-0 data-[state=active]:flex data-[state=active]:flex-col min-h-0"
              >
                <div className="flex-1 overflow-y-auto px-6 pb-6 -mx-6 space-y-6 min-h-0">
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
                    <div className="mt-2 text-sm text-destructive">{connectorsError}</div>
                  )}

                  {/* Status Dashboard - compact view */}
                  {connectorInstances.length > 0 && (
                    <div className="mt-3">
                      <ConnectorStatusDashboard
                        starshipId={slug}
                        connectorInstances={connectorInstances}
                        compact={true}
                      />
                    </div>
                  )}

                  {/* Troubleshooting Panel - only show if there are issues */}
                  {connectorInstances.some(c => c.status === 'error' || c.errorMessage) && (
                    <div className="mt-3">
                      <ConnectorTroubleshootingPanel connectorInstances={connectorInstances} />
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Right content area */}
        <div className="bg-background overflow-hidden h-full">
          {selectedAgent ? (
            <ChatInterface
              agent={selectedAgent}
              sessionId={sessionId}
              onSessionCreated={handleSessionCreated}
              starshipSlug={slug}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full bg-muted/5">
              <div className="bg-card p-8 rounded-lg text-center max-w-md shadow-sm border border-border/50">
                <div className="bg-primary/10 p-3 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-6">
                  <Users className="h-10 w-10 text-primary" />
                </div>
                <h3 className="text-xl font-medium mb-3">Select an agent to start chatting</h3>
                <p className="text-muted-foreground text-sm mb-6">
                  Choose a crew member from the sidebar to begin your conversation
                </p>
                <div className="flex justify-center">
                  <div className="bg-muted/20 rounded-md p-3 text-sm text-muted-foreground flex items-center">
                    <svg
                      className="w-5 h-5 mr-2 text-muted-foreground/70"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    Agents can assist with various tasks based on their specialization
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
