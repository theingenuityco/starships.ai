'use client'

import { useState } from 'react'
import { MCPServerConnector, MCPServerOption } from '@/lib/api'
import { ConnectorStatusDashboard } from '@/components/crew/ConnectorStatusDashboard'
import { ConnectorInstanceMonitor } from '@/components/crew/ConnectorInstanceMonitor'
import { ConnectorPerformanceMetrics } from '@/components/crew/ConnectorPerformanceMetrics'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

// Mock data for demonstration
const mockTemplates: MCPServerOption[] = [
  {
    id: 'github-mcp',
    name: 'GitHub MCP',
    command: 'npx',
    args: ['@modelcontextprotocol/server-github'],
    env: '{"GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"}',
  },
  {
    id: 'slack-mcp',
    name: 'Slack MCP',
    command: 'npx',
    args: ['@modelcontextprotocol/server-slack'],
    env: '{"SLACK_BOT_TOKEN": "${SLACK_TOKEN}", "SLACK_TEAM_ID": "${SLACK_TEAM_ID}"}',
  },
  {
    id: 'simple-mcp',
    name: 'Simple MCP',
    command: 'node',
    args: ['server.js'],
    env: '{}',
  },
]

const createMockConnector = (
  template: MCPServerOption,
  status: MCPServerConnector['status'],
  hasApiKeys: boolean = false,
  errorMessage?: string
): MCPServerConnector => ({
  id: `conn-${template.id}`,
  templateId: template.id,
  starshipId: 'demo-ship',
  status,
  isActive: status === 'active',
  connectedAt: new Date(Date.now() - Math.random() * 86400000).toISOString(),
  createdAt: new Date(Date.now() - Math.random() * 86400000).toISOString(),
  updatedAt: new Date().toISOString(),
  lastUsed:
    status === 'active' ? new Date(Date.now() - Math.random() * 3600000).toISOString() : undefined,
  template,
  env: hasApiKeys
    ? template.env?.replace(/\$\{([^}]+)\}/g, (_, key) => {
        // Mock API key values
        if (key.includes('TOKEN')) return 'tok_1234567890abcdef'
        if (key.includes('KEY')) return 'key_abcdef1234567890'
        if (key.includes('ID')) return 'T1234567890'
        return 'mock_value'
      }) || '{}'
    : '{}',
  errorMessage,
})

export function ConnectorStatusDemo() {
  const [scenario, setScenario] = useState<'configured' | 'missing' | 'mixed'>('configured')

  const getConnectorInstances = (): MCPServerConnector[] => {
    switch (scenario) {
      case 'configured':
        return [
          createMockConnector(mockTemplates[0], 'active', true),
          createMockConnector(mockTemplates[1], 'active', true),
          createMockConnector(mockTemplates[2], 'active', false),
        ]
      case 'missing':
        return [
          createMockConnector(mockTemplates[0], 'error', false, 'Missing required API keys'),
          createMockConnector(mockTemplates[1], 'inactive', false),
          createMockConnector(mockTemplates[2], 'active', false),
        ]
      case 'mixed':
        return [
          createMockConnector(mockTemplates[0], 'active', true),
          createMockConnector(mockTemplates[1], 'error', false, 'Invalid API token'),
          createMockConnector(mockTemplates[2], 'active', false),
        ]
      default:
        return []
    }
  }

  const connectorInstances = getConnectorInstances()

  return (
    <div className="space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            🚀 Connector Status Demo
            <Badge variant="secondary">Enhanced with API Key Status</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-3">
                This demo shows the enhanced connector status displays with API key configuration
                information. Switch between different scenarios to see how the status indicators
                change.
              </p>

              <div className="flex gap-2">
                <Button
                  variant={scenario === 'configured' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setScenario('configured')}
                >
                  All Configured
                </Button>
                <Button
                  variant={scenario === 'missing' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setScenario('missing')}
                >
                  Missing Keys
                </Button>
                <Button
                  variant={scenario === 'mixed' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setScenario('mixed')}
                >
                  Mixed Status
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Scenario: {scenario}</h4>
                <div className="text-xs text-muted-foreground space-y-1">
                  {scenario === 'configured' && (
                    <>
                      <div>✅ All connectors have API keys configured</div>
                      <div>🔑 GitHub: Token configured</div>
                      <div>🔑 Slack: Token + Team ID configured</div>
                      <div>➖ Simple: No keys required</div>
                    </>
                  )}
                  {scenario === 'missing' && (
                    <>
                      <div>❌ Connectors missing required API keys</div>
                      <div>🔑 GitHub: Missing token</div>
                      <div>🔑 Slack: Missing token + team ID</div>
                      <div>➖ Simple: No keys required</div>
                    </>
                  )}
                  {scenario === 'mixed' && (
                    <>
                      <div>🔄 Mixed configuration status</div>
                      <div>✅ GitHub: Token configured</div>
                      <div>❌ Slack: Invalid token</div>
                      <div>➖ Simple: No keys required</div>
                    </>
                  )}
                </div>
              </div>

              <div className="lg:col-span-2">
                <div className="text-xs text-muted-foreground">
                  <strong>Key Features:</strong>
                  <ul className="list-disc list-inside mt-1 space-y-1">
                    <li>🔑 API key status indicators with color coding</li>
                    <li>📊 Masked API key values for security</li>
                    <li>💡 Detailed tooltips with configuration guidance</li>
                    <li>⚠️ Missing key warnings and counts</li>
                    <li>✅ Visual confirmation of configured keys</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="dashboard" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="dashboard">Status Dashboard</TabsTrigger>
          <TabsTrigger value="monitor">Instance Monitor</TabsTrigger>
          <TabsTrigger value="performance">Performance Metrics</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4">
          <ConnectorStatusDashboard connectorInstances={connectorInstances} />
        </TabsContent>

        <TabsContent value="monitor" className="space-y-4">
          <ConnectorInstanceMonitor connectorInstances={connectorInstances} autoRefresh={false} />
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <ConnectorPerformanceMetrics connectorInstances={connectorInstances} showDetails={true} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
