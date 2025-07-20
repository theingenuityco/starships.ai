'use client'

import { useState, useEffect, useMemo } from 'react'
import { MCPServerOption, MCPServerConnector, mcpServerAPI } from '@/lib/api'
import { monitoringService, connectorMonitoring } from '@/lib/connector-monitoring'
import { ConnectorInstanceConfig } from './ConnectorInstanceConfig'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Loader2,
  Search,
  ChevronDown,
  Check,
  X,
  Plug,
  AlertCircle,
  Wifi,
  WifiOff,
  Clock,
  XCircle,
  AlertTriangle,
  CheckCircle,
  Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Updated props interface to work with connector instances
interface ConnectorSelectorProps {
  starshipId: string
  selectedConnectors: MCPServerOption[] // Templates derived from connector instances
  onConnectorsChange: (connectors: MCPServerOption[]) => void
  disabled?: boolean
  className?: string
  // NEW: Optional connector instances for status display
  connectorInstances?: MCPServerConnector[]
  // NEW: Configuration management callbacks
  onConfigUpdate?: (connectorId: string, config: any) => Promise<void>
  onTemplateApply?: (connectorId: string, templateId: string) => Promise<void>
}

// Utility function for parsing environment variables
function parseConnectorEnv(envString: string): Record<string, string> {
  try {
    return JSON.parse(envString)
  } catch {
    return {}
  }
}

// Display environment variables in UI
function formatEnvForDisplay(envString: string): string {
  const envVars = parseConnectorEnv(envString)
  const keys = Object.keys(envVars)
  return keys.length > 0 ? `Requires: ${keys.join(', ')}` : 'No configuration required'
}

// Get command badge variant based on command type
function getCommandBadgeVariant(command: string): 'default' | 'secondary' | 'outline' {
  switch (command.toLowerCase()) {
    case 'docker':
      return 'default'
    case 'npx':
      return 'secondary'
    case 'uvx':
      return 'outline'
    default:
      return 'outline'
  }
}

export function ConnectorSelector({
  starshipId,
  selectedConnectors,
  onConnectorsChange,
  disabled = false,
  className,
  connectorInstances = [],
  onConfigUpdate,
  onTemplateApply,
}: ConnectorSelectorProps) {
  // State management
  const [availableConnectors, setAvailableConnectors] = useState<MCPServerOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [connectingIds, setConnectingIds] = useState<Set<string>>(new Set())

  // Create a map of template ID to connector instance for quick lookup
  const connectorInstanceMap = useMemo(() => {
    const map = new Map<string, MCPServerConnector>()
    connectorInstances.forEach(instance => {
      if (instance.templateId) {
        map.set(instance.templateId, instance)
      }
    })
    return map
  }, [connectorInstances])

  // Fetch data on mount and when starshipId changes
  useEffect(() => {
    fetchConnectorData()
  }, [starshipId])

  // Use all available connectors since search is removed
  const filteredConnectors = availableConnectors

  // Check if a connector is selected
  const isConnectorSelected = (connector: MCPServerOption): boolean => {
    return selectedConnectors.some(selected => selected.id === connector.id)
  }

  // Get connector instance for a template (if exists)
  const getConnectorInstance = (connector: MCPServerOption): MCPServerConnector | undefined => {
    return connectorInstanceMap.get(connector.id)
  }

  // Check if a connector has an active instance
  const isConnectorConnected = (connector: MCPServerOption): boolean => {
    const instance = getConnectorInstance(connector)
    return instance ? instance.isActive && instance.status === 'active' : false
  }

  // Get connector status for display
  const getConnectorStatus = (
    connector: MCPServerOption
  ): MCPServerConnector['status'] | 'disconnected' => {
    const instance = getConnectorInstance(connector)
    return instance ? instance.status : 'disconnected'
  }

  // Fetch available connector templates
  const fetchConnectorData = async () => {
    try {
      setLoading(true)
      setError(null)

      // Only fetch available connector templates - instances are managed by parent
      const available = await mcpServerAPI.getAll()
      setAvailableConnectors(available)
    } catch (err) {
      console.error('Failed to fetch connector data:', err)
      setError('Failed to load connectors. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Handle connector selection/deselection
  const handleConnectorToggle = async (connector: MCPServerOption) => {
    if (disabled || connectingIds.has(connector.id)) return

    const isCurrentlySelected = isConnectorSelected(connector)

    try {
      setConnectingIds(prev => new Set(prev).add(connector.id))

      if (isCurrentlySelected) {
        // Deselect - let parent handle the connector instance removal
        const newSelected = selectedConnectors.filter(c => c.id !== connector.id)
        onConnectorsChange(newSelected)
      } else {
        // Select - let parent handle the connector instance creation
        const newSelected = [...selectedConnectors, connector]
        onConnectorsChange(newSelected)
      }
    } catch (err) {
      console.error('Failed to toggle connector:', err)
      setError(`Failed to ${isCurrentlySelected ? 'disconnect' : 'connect'} ${connector.name}`)
    } finally {
      setConnectingIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(connector.id)
        return newSet
      })
    }
  }

  // Clear all selections
  const handleClearAll = async () => {
    if (disabled) return

    // Let parent handle the connector instance removal
    onConnectorsChange([])
  }

  // Render loading state
  if (loading && availableConnectors.length === 0) {
    return (
      <div className={cn('space-y-4', className)}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold flex items-center">
            <span className="bg-primary/10 p-2 rounded-md mr-3">
              <Plug className="h-5 w-5 text-primary" />
            </span>
            Connectors
          </h3>
        </div>
        <div className="flex items-center justify-center p-6 border border-dashed rounded-lg bg-card">
          <Loader2 className="w-6 h-6 animate-spin text-primary mr-2" />
          <span className="text-sm text-muted-foreground">Loading connectors...</span>
        </div>
      </div>
    )
  }

  // Render error state
  if (error && availableConnectors.length === 0) {
    return (
      <div className={cn('space-y-4', className)}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold flex items-center">
            <span className="bg-primary/10 p-2 rounded-md mr-3">
              <Plug className="h-5 w-5 text-primary" />
            </span>
            Connectors
          </h3>
        </div>
        <div className="flex flex-col items-center justify-center p-6 border border-dashed rounded-lg bg-card">
          <AlertCircle className="w-8 h-8 text-destructive mb-2" />
          <p className="text-sm text-destructive text-center mb-3">{error}</p>
          <Button onClick={fetchConnectorData} size="sm" variant="outline">
            Try Again
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center">
            <span className="bg-primary/10 p-2 rounded-md mr-3">
              <Plug className="h-5 w-5 text-primary" />
            </span>
            <h3 className="text-lg font-semibold">Connectors</h3>
          </div>
          {selectedConnectors.length > 0 && (
            <Badge variant="outline" className="text-xs">
              {selectedConnectors.length}
            </Badge>
          )}
        </div>
        {selectedConnectors.length > 0 && (
          <Button
            onClick={handleClearAll}
            size="sm"
            variant="ghost"
            disabled={disabled || loading}
            className="text-muted-foreground hover:text-foreground text-xs"
          >
            Clear All
          </Button>
        )}
      </div>

      {/* Multi-select Dropdown */}
      <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-between h-auto min-h-[2.5rem] p-3 bg-card hover:bg-muted/50 transition-colors"
            disabled={disabled}
            aria-label="Select connectors"
            aria-expanded={isDropdownOpen}
            aria-haspopup="listbox"
          >
            <div className="flex flex-1 mr-2">
              {selectedConnectors.length === 0 ? (
                <span className="text-muted-foreground">Select connectors...</span>
              ) : (
                <span className="text-foreground">Browse Connectors</span>
              )}
            </div>
            <ChevronDown className="w-4 h-4 flex-shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-[var(--radix-dropdown-menu-trigger-width)] max-h-[300px] overflow-y-auto bg-card border-border shadow-lg"
          align="start"
        >
          <DropdownMenuLabel>Available Connectors</DropdownMenuLabel>
          <DropdownMenuSeparator />

          {filteredConnectors.length === 0 ? (
            <DropdownMenuItem disabled>No connectors available</DropdownMenuItem>
          ) : (
            filteredConnectors.map(connector => {
              const isSelected = isConnectorSelected(connector)
              const isConnecting = connectingIds.has(connector.id)
              const connectorInstance = getConnectorInstance(connector)
              const status = getConnectorStatus(connector)

              // Enhanced status display with health metrics
              const healthMetrics = connectorInstance
                ? monitoringService.createHealthMetrics(connectorInstance, connector)
                : null

              const getStatusIcon = () => {
                if (isConnecting) {
                  return <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
                }

                if (healthMetrics) {
                  switch (healthMetrics.healthStatus) {
                    case 'healthy':
                      return <CheckCircle className="w-3 h-3 text-green-500" />
                    case 'warning':
                      return <AlertTriangle className="w-3 h-3 text-yellow-500" />
                    case 'critical':
                      return <XCircle className="w-3 h-3 text-red-500" />
                    default:
                      return <AlertCircle className="w-3 h-3 text-gray-500" />
                  }
                }

                switch (status) {
                  case 'active':
                    return <Wifi className="w-3 h-3 text-green-500" />
                  case 'connecting':
                    return <Clock className="w-3 h-3 text-blue-500" />
                  case 'error':
                    return <XCircle className="w-3 h-3 text-red-500" />
                  case 'inactive':
                    return <WifiOff className="w-3 h-3 text-gray-500" />
                  default:
                    return <WifiOff className="w-3 h-3 text-gray-400" />
                }
              }

              const getStatusText = () => {
                if (healthMetrics && status === 'active') {
                  return `${status} (${healthMetrics.healthStatus})`
                }
                switch (status) {
                  case 'active':
                    return 'Active'
                  case 'connecting':
                    return 'Connecting...'
                  case 'error':
                    return 'Error'
                  case 'inactive':
                    return 'Inactive'
                  default:
                    return 'Not connected'
                }
              }

              const getHealthTooltip = () => {
                if (!healthMetrics) return getStatusText()
                return `Status: ${status}\nHealth: ${healthMetrics.healthStatus}\nUptime: ${connectorMonitoring.formatUptime(healthMetrics.uptime)}\nSuccess Rate: ${connectorMonitoring.formatSuccessRate(healthMetrics.successRate)}`
              }

              return (
                <DropdownMenuItem
                  key={connector.id}
                  onClick={() => handleConnectorToggle(connector)}
                  disabled={disabled || isConnecting}
                  className="flex items-start gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                  role="option"
                  aria-selected={isSelected}
                >
                  <div className="flex items-center justify-center w-4 h-4 mt-0.5">
                    {isConnecting ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : isSelected ? (
                      <Check className="w-3 h-3 text-primary" />
                    ) : (
                      <div className="w-3 h-3 border border-muted-foreground/30 rounded-sm" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{connector.name}</span>
                      <Badge
                        variant={getCommandBadgeVariant(connector.command)}
                        className="text-xs"
                      >
                        {connector.command.toUpperCase()}
                      </Badge>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center gap-1 cursor-help">
                              {getStatusIcon()}
                              <span className="text-xs text-muted-foreground">
                                {getStatusText()}
                              </span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="text-xs whitespace-pre-line">{getHealthTooltip()}</div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>

                    {connector.env && (
                      <p className="text-xs text-muted-foreground">
                        {formatEnvForDisplay(connector.env)}
                      </p>
                    )}

                    {connectorInstance?.errorMessage && status === 'error' && (
                      <p className="text-xs text-red-500 mt-1">{connectorInstance.errorMessage}</p>
                    )}
                  </div>
                </DropdownMenuItem>
              )
            })
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Selected Connectors Display */}
      {selectedConnectors.length > 0 && (
        <div className="space-y-2">
          <label className="text-sm font-medium">Selected Connectors:</label>
          <div className="space-y-2">
            {selectedConnectors.map(connector => {
              const isConnecting = connectingIds.has(connector.id)
              const connectorInstance = getConnectorInstance(connector)
              const status = getConnectorStatus(connector)

              // Enhanced status display with health metrics
              const healthMetrics = connectorInstance
                ? monitoringService.createHealthMetrics(connectorInstance, connector)
                : null

              const getStatusDisplay = () => {
                if (isConnecting) {
                  return {
                    icon: <Loader2 className="w-4 h-4 animate-spin text-blue-500" />,
                    badge: (
                      <Badge variant="secondary" className="text-xs">
                        Connecting...
                      </Badge>
                    ),
                    borderColor: 'border-blue-200 dark:border-blue-800',
                  }
                }

                if (healthMetrics) {
                  const healthColor = connectorMonitoring.getHealthStatusColor(
                    healthMetrics.healthStatus
                  )
                  const healthBg = connectorMonitoring.getHealthStatusBgColor(
                    healthMetrics.healthStatus
                  )

                  return {
                    icon:
                      status === 'active' ? (
                        healthMetrics.healthStatus === 'healthy' ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : healthMetrics.healthStatus === 'warning' ? (
                          <AlertTriangle className="w-4 h-4 text-yellow-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-500" />
                        )
                      ) : (
                        <WifiOff className="w-4 h-4 text-gray-500" />
                      ),
                    badge: (
                      <Badge
                        variant={
                          healthMetrics.healthStatus === 'healthy'
                            ? 'default'
                            : healthMetrics.healthStatus === 'warning'
                              ? 'secondary'
                              : healthMetrics.healthStatus === 'critical'
                                ? 'destructive'
                                : 'outline'
                        }
                        className="text-xs"
                      >
                        {status} ({healthMetrics.healthStatus})
                      </Badge>
                    ),
                    borderColor:
                      healthMetrics.healthStatus === 'healthy'
                        ? 'border-green-200 dark:border-green-800'
                        : healthMetrics.healthStatus === 'warning'
                          ? 'border-yellow-200 dark:border-yellow-800'
                          : healthMetrics.healthStatus === 'critical'
                            ? 'border-red-200 dark:border-red-800'
                            : 'border-gray-200 dark:border-gray-800',
                  }
                }

                // Fallback to basic status display
                switch (status) {
                  case 'active':
                    return {
                      icon: <Wifi className="w-4 h-4 text-green-500" />,
                      badge: (
                        <Badge variant="default" className="text-xs">
                          Active
                        </Badge>
                      ),
                      borderColor: 'border-green-200 dark:border-green-800',
                    }
                  case 'connecting':
                    return {
                      icon: <Clock className="w-4 h-4 text-blue-500" />,
                      badge: (
                        <Badge variant="secondary" className="text-xs">
                          Connecting...
                        </Badge>
                      ),
                      borderColor: 'border-blue-200 dark:border-blue-800',
                    }
                  case 'error':
                    return {
                      icon: <XCircle className="w-4 h-4 text-red-500" />,
                      badge: (
                        <Badge variant="destructive" className="text-xs">
                          Error
                        </Badge>
                      ),
                      borderColor: 'border-red-200 dark:border-red-800',
                    }
                  case 'inactive':
                    return {
                      icon: <WifiOff className="w-4 h-4 text-gray-500" />,
                      badge: (
                        <Badge variant="outline" className="text-xs">
                          Inactive
                        </Badge>
                      ),
                      borderColor: 'border-gray-200 dark:border-gray-800',
                    }
                  default:
                    return {
                      icon: <WifiOff className="w-4 h-4 text-muted-foreground" />,
                      badge: null,
                      borderColor: 'border-border',
                    }
                }
              }

              const statusDisplay = getStatusDisplay()

              return (
                <div
                  key={connector.id}
                  className={cn(
                    'flex items-center justify-between p-3 border rounded-lg bg-card transition-colors',
                    statusDisplay.borderColor
                  )}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="flex items-center gap-1">{statusDisplay.icon}</div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-medium text-sm">{connector.name}</span>
                        <Badge
                          variant={getCommandBadgeVariant(connector.command)}
                          className="text-xs"
                        >
                          {connector.command.toUpperCase()}
                        </Badge>
                        {statusDisplay.badge}
                      </div>

                      {connector.env && (
                        <p className="text-xs text-muted-foreground mb-1">
                          {formatEnvForDisplay(connector.env)}
                        </p>
                      )}

                      {connectorInstance?.errorMessage && status === 'error' && (
                        <p className="text-xs text-red-500">{connectorInstance.errorMessage}</p>
                      )}

                      {connectorInstance?.lastUsed && (
                        <p className="text-xs text-muted-foreground">
                          Last used: {new Date(connectorInstance.lastUsed).toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {/* Configuration button - only show if connector instance exists and callbacks are provided */}
                    {connectorInstance && onConfigUpdate && onTemplateApply && (
                      <ConnectorInstanceConfig
                        connectorId={connectorInstance.id}
                        starshipId={starshipId}
                        connectorName={connector.name}
                        currentConfig={connectorInstance.config}
                        onConfigUpdate={config => onConfigUpdate(connectorInstance.id, config)}
                        onTemplateApply={templateId =>
                          onTemplateApply(connectorInstance.id, templateId)
                        }
                        disabled={disabled}
                        className="h-8 w-8 p-0"
                      />
                    )}

                    <Button
                      onClick={() => handleConnectorToggle(connector)}
                      size="sm"
                      variant="ghost"
                      disabled={disabled || isConnecting}
                      className="h-8 w-8 p-0"
                      aria-label={`Remove ${connector.name}`}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="flex items-center gap-2 p-3 border border-destructive/30 rounded-lg bg-destructive/10">
          <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
          <p className="text-sm text-destructive">{error}</p>
          <Button
            onClick={() => setError(null)}
            size="sm"
            variant="ghost"
            className="ml-auto h-6 w-6 p-0"
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      )}
    </div>
  )
}
