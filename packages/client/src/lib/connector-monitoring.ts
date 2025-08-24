// This file has been deprecated as MCP functionality has been removed
// Connector monitoring is no longer supported

// Legacy types kept for backward compatibility during migration
export type ConnectorHealthStatus = 'healthy' | 'warning' | 'critical' | 'unknown'
export type ConnectorPerformanceLevel = 'excellent' | 'good' | 'fair' | 'poor' | 'unknown'

// Deprecated: Connection health metrics
export interface ConnectorHealthMetrics {
  id: string
  templateId: string
  name: string
  status: 'active' | 'inactive' | 'error' | 'connecting'
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

// Deprecated: Performance metrics for tracking
export interface ConnectorPerformanceMetrics {
  id: string
  responseTime: number
  successCount: number
  errorCount: number
  totalRequests: number
  averageResponseTime: number
  lastUpdated: string
}

// Deprecated: Status history entry
export interface ConnectorStatusHistoryEntry {
  timestamp: string
  status: 'active' | 'inactive' | 'error' | 'connecting'
  healthStatus: ConnectorHealthStatus
  errorMessage?: string
  responseTime?: number
}

// Deprecated: Error categorization
export interface ConnectorError {
  type: 'connection' | 'authentication' | 'timeout' | 'configuration' | 'server' | 'unknown'
  severity: 'low' | 'medium' | 'high' | 'critical'
  message: string
  troubleshootingHints: string[]
  timestamp: string
}

// Deprecated: Monitoring service class - now returns empty/default values
export class ConnectorMonitoringService {
  private static instance: ConnectorMonitoringService

  static getInstance(): ConnectorMonitoringService {
    if (!ConnectorMonitoringService.instance) {
      ConnectorMonitoringService.instance = new ConnectorMonitoringService()
    }
    return ConnectorMonitoringService.instance
  }

  // All methods now return default/empty values since MCP is removed
  calculateHealthStatus(): ConnectorHealthStatus {
    return 'unknown'
  }

  calculatePerformanceLevel(): ConnectorPerformanceLevel {
    return 'unknown'
  }

  calculateUptime(): number {
    return 0
  }

  getSuccessRate(): number {
    return 0
  }

  categorizeError(errorMessage: string): ConnectorError {
    return {
      type: 'unknown',
      severity: 'medium',
      message: errorMessage,
      troubleshootingHints: ['MCP functionality has been removed'],
      timestamp: new Date().toISOString(),
    }
  }

  generateTroubleshootingHints(): string[] {
    return ['MCP functionality has been removed from this system']
  }

  createHealthMetrics(): ConnectorHealthMetrics {
    return {
      id: '',
      templateId: '',
      name: 'N/A',
      status: 'inactive',
      healthStatus: 'unknown',
      performanceLevel: 'unknown',
      uptime: 0,
      errorCount: 0,
      successRate: 0,
      connectedAt: new Date().toISOString(),
      troubleshootingHints: ['MCP functionality has been removed'],
    }
  }

  recordPerformanceMetric(): void {
    // No-op since MCP is removed
  }

  recordStatusChange(): void {
    // No-op since MCP is removed
  }

  getStatusHistory(): ConnectorStatusHistoryEntry[] {
    return []
  }

  subscribe(): void {
    // No-op since MCP is removed
  }

  unsubscribe(): void {
    // No-op since MCP is removed
  }

  startPolling(): void {
    // No-op since MCP is removed
  }

  stopPolling(): void {
    // No-op since MCP is removed
  }

  stopAllPolling(): void {
    // No-op since MCP is removed
  }

  getPerformanceMetrics(): ConnectorPerformanceMetrics | undefined {
    return undefined
  }

  getAllPerformanceMetrics(): Map<string, ConnectorPerformanceMetrics> {
    return new Map()
  }

  clearMetrics(): void {
    // No-op since MCP is removed
  }

  clearAllMetrics(): void {
    // No-op since MCP is removed
  }
}

// Utility functions for status monitoring - now return default values
export const connectorMonitoring = {
  getHealthStatusColor(): string {
    return 'text-gray-500'
  },

  getHealthStatusBgColor(): string {
    return 'bg-gray-100 dark:bg-gray-900/20'
  },

  getPerformanceLevelColor(): string {
    return 'text-gray-500'
  },

  formatUptime(): string {
    return 'N/A'
  },

  formatResponseTime(): string {
    return 'N/A'
  },

  formatSuccessRate(): string {
    return 'N/A'
  },
}

// Export singleton instance
export const monitoringService = ConnectorMonitoringService.getInstance()
