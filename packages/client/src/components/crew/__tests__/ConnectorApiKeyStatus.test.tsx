import { render, screen } from '@testing-library/react'
import { ConnectorApiKeyStatus } from '@/lib/connector-api-key-status'
import { MCPServerConnector, MCPServerOption } from '@/lib/api'

// Mock data for testing
const mockTemplate: MCPServerOption = {
  id: 'github-mcp',
  name: 'GitHub MCP',
  description: 'GitHub integration connector',
  command: 'npx',
  args: ['@modelcontextprotocol/server-github'],
  env: '{"GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"}',
}

const mockConnectorWithApiKeys: MCPServerConnector = {
  id: 'conn-1',
  templateId: 'github-mcp',
  starshipId: 'ship-1',
  status: 'active',
  isActive: true,
  connectedAt: new Date().toISOString(),
  template: mockTemplate,
  config: {
    environmentVariables: '{"GITHUB_PERSONAL_ACCESS_TOKEN": "[GITHUB-PAT]"}',
  },
}

const mockConnectorMissingApiKeys: MCPServerConnector = {
  id: 'conn-2',
  templateId: 'github-mcp',
  starshipId: 'ship-1',
  status: 'error',
  isActive: false,
  connectedAt: new Date().toISOString(),
  template: mockTemplate,
  config: {
    environmentVariables: '{}',
  },
  errorMessage: 'Missing required API keys',
}

const mockConnectorNoApiKeys: MCPServerConnector = {
  id: 'conn-3',
  templateId: 'simple-connector',
  starshipId: 'ship-1',
  status: 'active',
  isActive: true,
  connectedAt: new Date().toISOString(),
  template: {
    id: 'simple-connector',
    name: 'Simple Connector',
    description: 'A simple connector without API keys',
    command: 'node',
    args: ['server.js'],
    env: '{}',
  },
}

describe('ConnectorApiKeyStatus', () => {
  describe('checkApiKeyStatus', () => {
    it('should detect configured API keys', () => {
      const status = ConnectorApiKeyStatus.checkApiKeyStatus(mockConnectorWithApiKeys)

      expect(status.status).toBe('configured')
      expect(status.configuredCount).toBe(1)
      expect(status.totalRequired).toBe(1)
      expect(status.missingKeys).toHaveLength(0)
      expect(status.hasValidConfiguration).toBe(true)
      expect(status.maskedValues['GITHUB_TOKEN']).toMatch(/ghp_\*+/)
    })

    it('should detect missing API keys', () => {
      const status = ConnectorApiKeyStatus.checkApiKeyStatus(mockConnectorMissingApiKeys)

      expect(status.status).toBe('missing')
      expect(status.configuredCount).toBe(0)
      expect(status.totalRequired).toBe(1)
      expect(status.missingKeys).toContain('GITHUB_TOKEN')
      expect(status.hasValidConfiguration).toBe(false)
    })

    it('should handle connectors without API key requirements', () => {
      const status = ConnectorApiKeyStatus.checkApiKeyStatus(mockConnectorNoApiKeys)

      expect(status.status).toBe('not_required')
      expect(status.configuredCount).toBe(0)
      expect(status.totalRequired).toBe(0)
      expect(status.missingKeys).toHaveLength(0)
      expect(status.hasValidConfiguration).toBe(true)
    })
  })

  describe('getStatusMessage', () => {
    it('should return correct message for configured status', () => {
      const status = ConnectorApiKeyStatus.checkApiKeyStatus(mockConnectorWithApiKeys)
      const message = ConnectorApiKeyStatus.getStatusMessage(status)

      expect(message).toBe('API Keys: Configured (1/1)')
    })

    it('should return correct message for missing status', () => {
      const status = ConnectorApiKeyStatus.checkApiKeyStatus(mockConnectorMissingApiKeys)
      const message = ConnectorApiKeyStatus.getStatusMessage(status)

      expect(message).toBe('API Keys: Missing (0/1)')
    })

    it('should return correct message for not required status', () => {
      const status = ConnectorApiKeyStatus.checkApiKeyStatus(mockConnectorNoApiKeys)
      const message = ConnectorApiKeyStatus.getStatusMessage(status)

      expect(message).toBe('API Keys: Not Required')
    })
  })

  describe('getStatusColor', () => {
    it('should return green for configured status', () => {
      const color = ConnectorApiKeyStatus.getStatusColor('configured')
      expect(color).toBe('text-green-600')
    })

    it('should return amber for missing status', () => {
      const color = ConnectorApiKeyStatus.getStatusColor('missing')
      expect(color).toBe('text-amber-600')
    })

    it('should return red for invalid status', () => {
      const color = ConnectorApiKeyStatus.getStatusColor('invalid')
      expect(color).toBe('text-red-600')
    })

    it('should return gray for not required status', () => {
      const color = ConnectorApiKeyStatus.getStatusColor('not_required')
      expect(color).toBe('text-gray-500')
    })
  })

  describe('getTooltipContent', () => {
    it('should provide detailed tooltip for configured keys', () => {
      const status = ConnectorApiKeyStatus.checkApiKeyStatus(mockConnectorWithApiKeys)
      const tooltip = ConnectorApiKeyStatus.getTooltipContent(status)

      expect(tooltip).toContain('Status: API Keys: Configured (1/1)')
      expect(tooltip).toContain('Required Keys:')
      expect(tooltip).toContain('✓ Github Token')
    })

    it('should provide detailed tooltip for missing keys', () => {
      const status = ConnectorApiKeyStatus.checkApiKeyStatus(mockConnectorMissingApiKeys)
      const tooltip = ConnectorApiKeyStatus.getTooltipContent(status)

      expect(tooltip).toContain('Status: API Keys: Missing (0/1)')
      expect(tooltip).toContain('Missing Keys:')
      expect(tooltip).toContain('• Github Token')
    })

    it('should provide simple tooltip for not required', () => {
      const status = ConnectorApiKeyStatus.checkApiKeyStatus(mockConnectorNoApiKeys)
      const tooltip = ConnectorApiKeyStatus.getTooltipContent(status)

      expect(tooltip).toBe('This connector does not require API keys')
    })
  })

  describe('requiresApiKeys', () => {
    it('should return true for templates with API key requirements', () => {
      const requires = ConnectorApiKeyStatus.requiresApiKeys(mockTemplate)
      expect(requires).toBe(true)
    })

    it('should return false for templates without API key requirements', () => {
      const requires = ConnectorApiKeyStatus.requiresApiKeys(mockConnectorNoApiKeys.template!)
      expect(requires).toBe(false)
    })
  })
})
