import { MCPServerConnector, MCPServerOption, mcpServerAPI } from './api'

// Enhanced status types for more granular monitoring
export type ConnectorHealthStatus = 'healthy' | 'warning' | 'critical' | 'unknown'
export type ConnectorPerformanceLevel = 'excellent' | 'good' | 'fair' | 'poor' | 'unknown'

// Connection health metrics
export interface ConnectorHealthMetrics {
  id: string
  templateId: string
  name: string
  status: MCPServerConnector['status']
  healthStatus: ConnectorHealthStatus
  performanceLevel: ConnectorPerformanceLevel
  uptime: number // in milliseconds
  lastResponseTime?: number // in milliseconds
  errorCount: number
  successRate: number // percentage
  lastUsed?: string
  connectedAt: string
  errorMessage?: string
  troubleshootingHints: string[]
}

// Performance metrics for tracking
export interface ConnectorPerformanceMetrics {
  id: string
  responseTime: number
  successCount: number
  errorCount: number
  totalRequests: number
  averageResponseTime: number
  lastUpdated: string
}

// Status history entry
export interface ConnectorStatusHistoryEntry {
  timestamp: string
  status: MCPServerConnector['status']
  healthStatus: ConnectorHealthStatus
  errorMessage?: string
  responseTime?: number
}

// Error categorization
export interface ConnectorError {
  type: 'connection' | 'authentication' | 'timeout' | 'configuration' | 'server' | 'unknown'
  severity: 'low' | 'medium' | 'high' | 'critical'
  message: string
  troubleshootingHints: string[]
  timestamp: string
}

// Monitoring service class
export class ConnectorMonitoringService {
  private static instance: ConnectorMonitoringService
  private performanceMetrics = new Map<string, ConnectorPerformanceMetrics>()
  private statusHistory = new Map<string, ConnectorStatusHistoryEntry[]>()
  private pollingIntervals = new Map<string, NodeJS.Timeout>()
  private subscribers = new Map<string, Set<(metrics: ConnectorHealthMetrics) => void>>()

  static getInstance(): ConnectorMonitoringService {
    if (!ConnectorMonitoringService.instance) {
      ConnectorMonitoringService.instance = new ConnectorMonitoringService()
    }
    return ConnectorMonitoringService.instance
  }

  // Calculate health status based on connector state and metrics
  calculateHealthStatus(connector: MCPServerConnector): ConnectorHealthStatus {
    if (connector.status === 'active') {
      const metrics = this.performanceMetrics.get(connector.id)
      if (!metrics) return 'unknown'

      const successRate =
        metrics.totalRequests > 0 ? (metrics.successCount / metrics.totalRequests) * 100 : 100
      const avgResponseTime = metrics.averageResponseTime

      if (successRate >= 95 && avgResponseTime < 1000) return 'healthy'
      if (successRate >= 85 && avgResponseTime < 3000) return 'warning'
      return 'critical'
    }

    if (connector.status === 'connecting') return 'warning'
    if (connector.status === 'error') return 'critical'
    if (connector.status === 'inactive') return 'unknown'

    return 'unknown'
  }

  // Calculate performance level
  calculatePerformanceLevel(connector: MCPServerConnector): ConnectorPerformanceLevel {
    const metrics = this.performanceMetrics.get(connector.id)
    if (!metrics || metrics.totalRequests === 0) return 'unknown'

    const successRate = (metrics.successCount / metrics.totalRequests) * 100
    const avgResponseTime = metrics.averageResponseTime

    if (successRate >= 98 && avgResponseTime < 500) return 'excellent'
    if (successRate >= 95 && avgResponseTime < 1000) return 'good'
    if (successRate >= 85 && avgResponseTime < 2000) return 'fair'
    return 'poor'
  }

  // Calculate uptime in milliseconds
  calculateUptime(connector: MCPServerConnector): number {
    if (connector.status !== 'active') return 0
    const connectedAt = new Date(connector.connectedAt).getTime()
    return Date.now() - connectedAt
  }

  // Get success rate percentage
  getSuccessRate(connectorId: string): number {
    const metrics = this.performanceMetrics.get(connectorId)
    if (!metrics || metrics.totalRequests === 0) return 100
    return (metrics.successCount / metrics.totalRequests) * 100
  }

  // Categorize and analyze errors
  categorizeError(errorMessage: string): ConnectorError {
    const message = errorMessage.toLowerCase()
    const timestamp = new Date().toISOString()

    // Connection errors
    if (
      message.includes('connection') ||
      message.includes('connect') ||
      message.includes('network') ||
      message.includes('refused')
    ) {
      return {
        type: 'connection',
        severity: 'high',
        message: errorMessage,
        troubleshootingHints: [
          'Check network connectivity',
          'Verify the connector service is running',
          'Check firewall settings',
          'Ensure the correct port is accessible',
        ],
        timestamp,
      }
    }

    // Authentication errors
    if (
      message.includes('auth') ||
      message.includes('unauthorized') ||
      message.includes('forbidden') ||
      message.includes('token')
    ) {
      return {
        type: 'authentication',
        severity: 'high',
        message: errorMessage,
        troubleshootingHints: [
          'Check authentication credentials',
          'Verify API keys or tokens',
          'Ensure proper permissions are set',
          'Check if credentials have expired',
        ],
        timestamp,
      }
    }

    // Timeout errors
    if (message.includes('timeout') || message.includes('timed out')) {
      return {
        type: 'timeout',
        severity: 'medium',
        message: errorMessage,
        troubleshootingHints: [
          'Increase timeout settings',
          'Check server response time',
          'Verify network latency',
          'Consider load balancing issues',
        ],
        timestamp,
      }
    }

    // Configuration errors
    if (
      message.includes('config') ||
      message.includes('invalid') ||
      message.includes('missing') ||
      message.includes('required')
    ) {
      return {
        type: 'configuration',
        severity: 'high',
        message: errorMessage,
        troubleshootingHints: [
          'Review connector configuration',
          'Check required environment variables',
          'Verify configuration file format',
          'Ensure all required fields are provided',
        ],
        timestamp,
      }
    }

    // Server errors
    if (
      message.includes('server') ||
      message.includes('500') ||
      message.includes('internal') ||
      message.includes('service')
    ) {
      return {
        type: 'server',
        severity: 'critical',
        message: errorMessage,
        troubleshootingHints: [
          'Check server logs for details',
          'Verify server health and resources',
          'Contact system administrator',
          'Check for recent server updates',
        ],
        timestamp,
      }
    }

    // Default unknown error
    return {
      type: 'unknown',
      severity: 'medium',
      message: errorMessage,
      troubleshootingHints: [
        'Check connector logs for more details',
        'Try restarting the connector',
        'Verify system requirements',
        'Contact support if issue persists',
      ],
      timestamp,
    }
  }

  // Generate troubleshooting hints based on connector state
  generateTroubleshootingHints(connector: MCPServerConnector): string[] {
    const hints: string[] = []

    if (connector.status === 'error' && connector.errorMessage) {
      const error = this.categorizeError(connector.errorMessage)
      hints.push(...error.troubleshootingHints)
    }

    if (connector.status === 'connecting') {
      hints.push(
        'Connection is in progress - please wait',
        'If stuck, try disconnecting and reconnecting',
        'Check if the service requires manual startup'
      )
    }

    if (connector.status === 'inactive') {
      hints.push(
        'Connector is not currently active',
        'Try connecting to activate the service',
        'Check if the connector service is available'
      )
    }

    const metrics = this.performanceMetrics.get(connector.id)
    if (metrics && metrics.averageResponseTime > 2000) {
      hints.push(
        'Response times are slower than expected',
        'Consider checking server load',
        'Network latency may be affecting performance'
      )
    }

    if (metrics && this.getSuccessRate(connector.id) < 90) {
      hints.push(
        'Success rate is below optimal levels',
        'Check for intermittent connectivity issues',
        'Review recent error patterns'
      )
    }

    return hints.length > 0 ? hints : ['Connector appears to be functioning normally']
  }

  // Create comprehensive health metrics
  createHealthMetrics(
    connector: MCPServerConnector,
    template?: MCPServerOption
  ): ConnectorHealthMetrics {
    const healthStatus = this.calculateHealthStatus(connector)
    const performanceLevel = this.calculatePerformanceLevel(connector)
    const uptime = this.calculateUptime(connector)
    const successRate = this.getSuccessRate(connector.id)
    const troubleshootingHints = this.generateTroubleshootingHints(connector)

    const metrics = this.performanceMetrics.get(connector.id)
    const errorCount = metrics?.errorCount || 0

    return {
      id: connector.id,
      templateId: connector.templateId,
      name: template?.name || connector.templateId,
      status: connector.status,
      healthStatus,
      performanceLevel,
      uptime,
      lastResponseTime: metrics?.averageResponseTime,
      errorCount,
      successRate,
      lastUsed: connector.lastUsed,
      connectedAt: connector.connectedAt,
      errorMessage: connector.errorMessage,
      troubleshootingHints,
    }
  }

  // Record performance metrics
  recordPerformanceMetric(connectorId: string, responseTime: number, success: boolean) {
    const existing = this.performanceMetrics.get(connectorId) || {
      id: connectorId,
      responseTime: 0,
      successCount: 0,
      errorCount: 0,
      totalRequests: 0,
      averageResponseTime: 0,
      lastUpdated: new Date().toISOString(),
    }

    existing.totalRequests++
    existing.responseTime = responseTime
    existing.lastUpdated = new Date().toISOString()

    if (success) {
      existing.successCount++
    } else {
      existing.errorCount++
    }

    // Calculate rolling average response time
    existing.averageResponseTime =
      (existing.averageResponseTime * (existing.totalRequests - 1) + responseTime) /
      existing.totalRequests

    this.performanceMetrics.set(connectorId, existing)
  }

  // Record status history
  recordStatusChange(
    connectorId: string,
    status: MCPServerConnector['status'],
    healthStatus: ConnectorHealthStatus,
    errorMessage?: string,
    responseTime?: number
  ) {
    const history = this.statusHistory.get(connectorId) || []

    const entry: ConnectorStatusHistoryEntry = {
      timestamp: new Date().toISOString(),
      status,
      healthStatus,
      errorMessage,
      responseTime,
    }

    history.push(entry)

    // Keep only last 100 entries
    if (history.length > 100) {
      history.splice(0, history.length - 100)
    }

    this.statusHistory.set(connectorId, history)
  }

  // Get status history for a connector
  getStatusHistory(connectorId: string): ConnectorStatusHistoryEntry[] {
    return this.statusHistory.get(connectorId) || []
  }

  // Subscribe to connector health updates
  subscribe(connectorId: string, callback: (metrics: ConnectorHealthMetrics) => void) {
    if (!this.subscribers.has(connectorId)) {
      this.subscribers.set(connectorId, new Set())
    }
    this.subscribers.get(connectorId)!.add(callback)
  }

  // Unsubscribe from connector health updates
  unsubscribe(connectorId: string, callback: (metrics: ConnectorHealthMetrics) => void) {
    const subscribers = this.subscribers.get(connectorId)
    if (subscribers) {
      subscribers.delete(callback)
      if (subscribers.size === 0) {
        this.subscribers.delete(connectorId)
      }
    }
  }

  // Notify subscribers of health metric changes
  private notifySubscribers(connectorId: string, metrics: ConnectorHealthMetrics) {
    const subscribers = this.subscribers.get(connectorId)
    if (subscribers) {
      subscribers.forEach(callback => callback(metrics))
    }
  }

  // Start polling for a connector
  startPolling(starshipId: string, connectorId: string, intervalMs: number = 30000) {
    // Clear existing interval if any
    this.stopPolling(connectorId)

    const interval = setInterval(async () => {
      try {
        const instances = await mcpServerAPI.getConnectorInstances(starshipId)
        const connector = instances.find(c => c.id === connectorId)

        if (connector) {
          const healthMetrics = this.createHealthMetrics(connector, connector.template)
          this.recordStatusChange(
            connectorId,
            connector.status,
            healthMetrics.healthStatus,
            connector.errorMessage
          )
          this.notifySubscribers(connectorId, healthMetrics)
        }
      } catch (error) {
        console.error(`Failed to poll connector ${connectorId}:`, error)
        this.recordPerformanceMetric(connectorId, 0, false)
      }
    }, intervalMs)

    this.pollingIntervals.set(connectorId, interval)
  }

  // Stop polling for a connector
  stopPolling(connectorId: string) {
    const interval = this.pollingIntervals.get(connectorId)
    if (interval) {
      clearInterval(interval)
      this.pollingIntervals.delete(connectorId)
    }
  }

  // Stop all polling
  stopAllPolling() {
    this.pollingIntervals.forEach((interval, connectorId) => {
      clearInterval(interval)
    })
    this.pollingIntervals.clear()
  }

  // Get performance metrics for a connector
  getPerformanceMetrics(connectorId: string): ConnectorPerformanceMetrics | undefined {
    return this.performanceMetrics.get(connectorId)
  }

  // Get all performance metrics
  getAllPerformanceMetrics(): Map<string, ConnectorPerformanceMetrics> {
    return new Map(this.performanceMetrics)
  }

  // Clear metrics for a connector
  clearMetrics(connectorId: string) {
    this.performanceMetrics.delete(connectorId)
    this.statusHistory.delete(connectorId)
    this.stopPolling(connectorId)
    this.subscribers.delete(connectorId)
  }

  // Clear all metrics
  clearAllMetrics() {
    this.performanceMetrics.clear()
    this.statusHistory.clear()
    this.stopAllPolling()
    this.subscribers.clear()
  }
}

// Utility functions for status monitoring
export const connectorMonitoring = {
  // Get health status color for UI
  getHealthStatusColor(status: ConnectorHealthStatus): string {
    switch (status) {
      case 'healthy':
        return 'text-green-500'
      case 'warning':
        return 'text-yellow-500'
      case 'critical':
        return 'text-red-500'
      case 'unknown':
        return 'text-gray-500'
      default:
        return 'text-gray-500'
    }
  },

  // Get health status background color for UI
  getHealthStatusBgColor(status: ConnectorHealthStatus): string {
    switch (status) {
      case 'healthy':
        return 'bg-green-100 dark:bg-green-900/20'
      case 'warning':
        return 'bg-yellow-100 dark:bg-yellow-900/20'
      case 'critical':
        return 'bg-red-100 dark:bg-red-900/20'
      case 'unknown':
        return 'bg-gray-100 dark:bg-gray-900/20'
      default:
        return 'bg-gray-100 dark:bg-gray-900/20'
    }
  },

  // Get performance level color for UI
  getPerformanceLevelColor(level: ConnectorPerformanceLevel): string {
    switch (level) {
      case 'excellent':
        return 'text-green-600'
      case 'good':
        return 'text-green-500'
      case 'fair':
        return 'text-yellow-500'
      case 'poor':
        return 'text-red-500'
      case 'unknown':
        return 'text-gray-500'
      default:
        return 'text-gray-500'
    }
  },

  // Format uptime for display
  formatUptime(uptimeMs: number): string {
    if (uptimeMs === 0) return 'Not active'

    const seconds = Math.floor(uptimeMs / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days}d ${hours % 24}h`
    if (hours > 0) return `${hours}h ${minutes % 60}m`
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`
    return `${seconds}s`
  },

  // Format response time for display
  formatResponseTime(timeMs?: number): string {
    if (!timeMs) return 'N/A'
    if (timeMs < 1000) return `${Math.round(timeMs)}ms`
    return `${(timeMs / 1000).toFixed(1)}s`
  },

  // Format success rate for display
  formatSuccessRate(rate: number): string {
    return `${Math.round(rate)}%`
  },
}

// Export singleton instance
export const monitoringService = ConnectorMonitoringService.getInstance()
