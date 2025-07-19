'use client'

import { useState, useEffect } from 'react'
import { Agent, MCPServerOption, mcpServerAPI } from '@/lib/api'
import { AgentSelector } from '@/components/agents/AgentSelector'
import { ConnectorSelector } from '@/components/crew/ConnectorSelector'
import { ChatInterface } from '@/components/chat/ChatInterface'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Users } from 'lucide-react'
import Link from 'next/link'

interface StarshipCrewContentProps {
  slug: string
}

export function StarshipCrewContent({ slug }: StarshipCrewContentProps) {
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)

  // Connector state management
  const [connectedConnectors, setConnectedConnectors] = useState<MCPServerOption[]>([])
  const [connectorsLoading, setConnectorsLoading] = useState(false)
  const [connectorsError, setConnectorsError] = useState<string | null>(null)

  const handleAgentSelect = (agent: Agent) => {
    setSelectedAgent(agent)
    setSessionId(null) // Reset session when agent changes
  }

  const handleSessionCreated = (newSessionId: string) => {
    setSessionId(newSessionId)
  }

  // Fetch connected connectors on component mount and when starship changes
  useEffect(() => {
    fetchConnectedConnectors()
  }, [slug])

  const fetchConnectedConnectors = async () => {
    try {
      setConnectorsLoading(true)
      setConnectorsError(null)
      const connectors = await mcpServerAPI.getConnectedToStarship(slug)
      setConnectedConnectors(connectors)
    } catch (error) {
      console.error('Failed to fetch connected connectors:', error)
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

      // Compare with current connectors to determine what changed
      const currentIds = new Set(connectedConnectors.map(c => c.id))
      const newIds = new Set(newConnectors.map(c => c.id))

      // Find connectors to connect (in new but not in current)
      const toConnect = newConnectors.filter(c => !currentIds.has(c.id))

      // Find connectors to disconnect (in current but not in new)
      const toDisconnect = connectedConnectors.filter(c => !newIds.has(c.id))

      // Execute connection operations
      const operations = [
        ...toConnect.map(connector => mcpServerAPI.connectToStarship(slug, connector.id)),
        ...toDisconnect.map(connector => mcpServerAPI.disconnectFromStarship(slug, connector.id)),
      ]

      if (operations.length > 0) {
        await Promise.all(operations)
      }

      // Update state with new connectors
      setConnectedConnectors(newConnectors)
    } catch (error) {
      console.error('Failed to update connectors:', error)
      setConnectorsError('Failed to update connectors. Please try again.')

      // Refresh connectors to get current state
      await fetchConnectedConnectors()
    } finally {
      setConnectorsLoading(false)
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header with Back Navigation */}
      <div className="flex items-center justify-between p-6 border-b">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/ships">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Fleet
            </Link>
          </Button>
          <div className="text-sm text-muted-foreground">
            Starship: <span className="font-medium">{slug}</span>
          </div>
        </div>
      </div>

      {/* Main Content - Two Column Layout */}
      <div className="grid grid-cols-[350px_1fr] flex-1 overflow-hidden">
        {/* Left sidebar - fixed width */}
        <div className="border-r bg-card shadow-sm overflow-hidden">
          <div className="p-6 h-full flex flex-col">
            <h2 className="text-xl font-semibold mb-6 flex items-center">
              <span className="bg-primary/10 p-2 rounded-md mr-3 shadow-sm">
                <Users className="h-5 w-5 text-primary" />
              </span>
              Crew Console
            </h2>
            <div className="flex-1 overflow-auto pr-1 -mr-1 space-y-6">
              {/* ConnectorSelector above AgentSelector */}
              <div className="pb-4 border-b border-border/50">
                <ConnectorSelector
                  starshipId={slug}
                  selectedConnectors={connectedConnectors}
                  onConnectorsChange={handleConnectorsChange}
                  disabled={connectorsLoading}
                  className="mb-0"
                />
                {connectorsError && (
                  <div className="mt-2 text-sm text-destructive">{connectorsError}</div>
                )}
              </div>

              {/* AgentSelector */}
              <div>
                <AgentSelector
                  selectedAgent={selectedAgent}
                  onAgentSelect={handleAgentSelect}
                  showCreateButton={true}
                  showFilters={true}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right content area */}
        <div className="bg-background overflow-hidden">
          {selectedAgent ? (
            <ChatInterface
              agent={selectedAgent}
              sessionId={sessionId}
              onSessionCreated={handleSessionCreated}
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
