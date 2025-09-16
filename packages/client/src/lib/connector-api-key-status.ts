import { MCPServerConnector, MCPServerOption } from '@/lib/api'
import { ConnectorApiKeyManager } from '@/lib/connector-api-keys'
import { ApiKeyRequirement } from '@/types/connector-api-keys'

export type ApiKeyConfigStatus = 'configured' | 'missing' | 'invalid' | 'not_required'

export interface ApiKeyStatusInfo {
  status: ApiKeyConfigStatus
  requirements: ApiKeyRequirement[]
  configuredCount: number
  totalRequired: number
  missingKeys: string[]
  maskedValues: Record<string, string>
  hasValidConfiguration: boolean
}

/**
 * Utility class for checking API key configuration status in connector instances
 */
export class ConnectorApiKeyStatus {
  /**
   * Check the API key configuration status for a connector instance
   */
  static checkApiKeyStatus(connector: MCPServerConnector, template?: MCPServerOption): ApiKeyStatusInfo {
    // Use template if provided, otherwise try to get from connector
    const sourceTemplate = template || connector.template

    if (!sourceTemplate) {
      return {
        status: 'not_required',
        requirements: [],
        configuredCount: 0,
        totalRequired: 0,
        missingKeys: [],
        maskedValues: {},
        hasValidConfiguration: true,
      }
    }

    // Detect API key requirements from the template
    const requirements = ConnectorApiKeyManager.detectRequirements(sourceTemplate)

    if (requirements.length === 0) {
      return {
        status: 'not_required',
        requirements: [],
        configuredCount: 0,
        totalRequired: 0,
        missingKeys: [],
        maskedValues: {},
        hasValidConfiguration: true,
      }
    }

    // Parse current environment variables from connector instance
    const currentEnv = this.parseConnectorEnvironment(connector)

    // Check which keys are configured
    const configuredKeys: string[] = []
    const missingKeys: string[] = []
    const maskedValues: Record<string, string> = {}

    for (const requirement of requirements) {
      const value = currentEnv[requirement.envKey]

      if (value && value.trim() !== '') {
        configuredKeys.push(requirement.envKey)
        maskedValues[requirement.envKey] = ConnectorApiKeyManager.maskValue(value, requirement)
      } else if (requirement.required) {
        missingKeys.push(requirement.envKey)
      }
    }

    const requiredCount = requirements.filter(req => req.required).length
    const configuredCount = configuredKeys.length
    const totalRequired = requirements.length

    // Determine overall status
    let status: ApiKeyConfigStatus
    if (missingKeys.length > 0) {
      status = 'missing'
    } else if (configuredCount === requiredCount) {
      status = 'configured'
    } else {
      status = 'invalid'
    }

    const hasValidConfiguration = missingKeys.length === 0 && configuredCount >= requiredCount

    return {
      status,
      requirements,
      configuredCount,
      totalRequired,
      missingKeys,
      maskedValues,
      hasValidConfiguration,
    }
  }

  /**
   * Parse environment variables from connector instance
   */
  private static parseConnectorEnvironment(connector: MCPServerConnector): Record<string, string> {
    try {
      // Try to parse from connector's environment variables
      if (connector.env) {
        return JSON.parse(connector.env)
      }

      // Fallback to template env if available
      if (connector.template?.env) {
        return JSON.parse(connector.template.env)
      }

      return {}
    } catch (error) {
      console.warn('[ConnectorApiKeyStatus] Failed to parse environment variables:', error)
      return {}
    }
  }

  /**
   * Get a user-friendly status message
   */
  static getStatusMessage(statusInfo: ApiKeyStatusInfo): string {
    switch (statusInfo.status) {
      case 'configured':
        return `API Keys: Configured (${statusInfo.configuredCount}/${statusInfo.totalRequired})`
      case 'missing':
        return `API Keys: Missing (${statusInfo.configuredCount}/${statusInfo.totalRequired})`
      case 'invalid':
        return `API Keys: Invalid Configuration`
      case 'not_required':
        return 'API Keys: Not Required'
      default:
        return 'API Keys: Unknown Status'
    }
  }

  /**
   * Get status color class for UI
   */
  static getStatusColor(status: ApiKeyConfigStatus): string {
    switch (status) {
      case 'configured':
        return 'text-green-600'
      case 'missing':
        return 'text-amber-600'
      case 'invalid':
        return 'text-red-600'
      case 'not_required':
        return 'text-gray-500'
      default:
        return 'text-gray-500'
    }
  }

  /**
   * Get status background color class for UI
   */
  static getStatusBgColor(status: ApiKeyConfigStatus): string {
    switch (status) {
      case 'configured':
        return 'bg-green-100 dark:bg-green-900/20'
      case 'missing':
        return 'bg-amber-100 dark:bg-amber-900/20'
      case 'invalid':
        return 'bg-red-100 dark:bg-red-900/20'
      case 'not_required':
        return 'bg-gray-100 dark:bg-gray-900/20'
      default:
        return 'bg-gray-100 dark:bg-gray-900/20'
    }
  }

  /**
   * Get status icon name for UI
   */
  static getStatusIcon(status: ApiKeyConfigStatus): string {
    switch (status) {
      case 'configured':
        return 'CheckCircle'
      case 'missing':
        return 'AlertTriangle'
      case 'invalid':
        return 'XCircle'
      case 'not_required':
        return 'Minus'
      default:
        return 'AlertCircle'
    }
  }

  /**
   * Get detailed tooltip content for API key status
   */
  static getTooltipContent(statusInfo: ApiKeyStatusInfo): string {
    if (statusInfo.status === 'not_required') {
      return 'This connector does not require API keys'
    }

    const lines: string[] = []
    lines.push(`Status: ${this.getStatusMessage(statusInfo)}`)

    if (statusInfo.requirements.length > 0) {
      lines.push('')
      lines.push('Required Keys:')
      statusInfo.requirements.forEach(req => {
        const isConfigured = statusInfo.maskedValues[req.envKey]
        const status = isConfigured ? '✓' : '✗'
        const value = isConfigured ? ` (${statusInfo.maskedValues[req.envKey]})` : ''
        lines.push(`${status} ${req.displayName}${value}`)
      })
    }

    if (statusInfo.missingKeys.length > 0) {
      lines.push('')
      lines.push('Missing Keys:')
      statusInfo.missingKeys.forEach(key => {
        const req = statusInfo.requirements.find(r => r.envKey === key)
        lines.push(`• ${req?.displayName || key}`)
      })
    }

    return lines.join('\n')
  }

  /**
   * Check if connector template requires API keys
   */
  static requiresApiKeys(template: MCPServerOption): boolean {
    const requirements = ConnectorApiKeyManager.detectRequirements(template)
    return requirements.length > 0
  }

  /**
   * Get API key requirements for a template
   */
  static getRequirements(template: MCPServerOption): ApiKeyRequirement[] {
    return ConnectorApiKeyManager.detectRequirements(template)
  }
}
