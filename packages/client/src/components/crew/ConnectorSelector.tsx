'use client'

import { useState, useEffect, useMemo } from 'react'
import { MCPServerOption, MCPServerConnector, mcpServerAPI } from '@/lib/api'
import { monitoringService, connectorMonitoring } from '@/lib/connector-monitoring'
import { ConnectorApiKeyStatus, ApiKeyStatusInfo } from '@/lib/connector-api-key-status'
import { ConnectorInstanceConfig } from './ConnectorInstanceConfig'
import { ApiKeyInputModal } from './ApiKeyInputModal'
import { ConnectorApiKeyManager } from '@/lib/connector-api-keys'
import { ApiKeyRequirement } from '@/types/connector-api-keys'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Loader2,
  ChevronDown,
  Check,
  X,
  Plug,
  AlertCircle,
  WifiOff,
  Clock,
  XCircle,
  AlertTriangle,
  CheckCircle,
  Key,
  Sparkles,
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

  // API Key Modal state
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false)
  const [currentConnectorForApiKeys, setCurrentConnectorForApiKeys] =
    useState<MCPServerOption | null>(null)
  const [apiKeyRequirements, setApiKeyRequirements] = useState<ApiKeyRequirement[]>([])

  // API Key status tracking
  const [apiKeyStatusMap, setApiKeyStatusMap] = useState<Map<string, ApiKeyStatusInfo>>(new Map())

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

  // Update API key status when connector instances change
  useEffect(() => {
    console.log(
      '[ConnectorSelector] API key status update triggered - instances:',
      connectorInstances.length
    )
    const newApiKeyStatus = new Map<string, ApiKeyStatusInfo>()
    connectorInstances.forEach(instance => {
      if (instance.templateId) {
        const keyStatus = ConnectorApiKeyStatus.checkApiKeyStatus(instance, instance.template)
        newApiKeyStatus.set(instance.templateId, keyStatus)
      }
    })
    console.log(
      '[ConnectorSelector] Setting API key status map with',
      newApiKeyStatus.size,
      'entries'
    )
    setApiKeyStatusMap(newApiKeyStatus)
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

  // Get connector status for display
  const getConnectorStatus = (
    connector: MCPServerOption
  ): MCPServerConnector['status'] | 'disconnected' => {
    const instance = getConnectorInstance(connector)
    return instance ? instance.status : 'disconnected'
  }

  // Check if connector requires API keys
  const connectorRequiresApiKeys = (connector: MCPServerOption): boolean => {
    const requirements = ConnectorApiKeyManager.detectRequirements(connector)
    return requirements.length > 0
  }

  // Get API key requirements for a connector
  const getApiKeyRequirements = (connector: MCPServerOption): ApiKeyRequirement[] => {
    return ConnectorApiKeyManager.detectRequirements(connector)
  }

  // Helper function to get connector icon
  const getConnectorIcon = (connector: MCPServerOption) => {
    const name = connector.name.toLowerCase()
    if (name.includes('firecrawl')) return '🔥'
    if (name.includes('searx')) return '🔍'
    if (name.includes('sequential') || name.includes('thinking')) return '🧠'
    return '🔗'
  }

  // Helper function to get connector description
  const getConnectorDescription = (connector: MCPServerOption) => {
    const name = connector.name.toLowerCase()
    if (name.includes('firecrawl')) return 'Web scraping and data extraction'
    if (name.includes('searx')) return 'Privacy-focused web search engine'
    if (name.includes('sequential') || name.includes('thinking'))
      return 'Advanced reasoning and problem solving'
    return 'External service integration'
  }

  // Helper function to check if connector needs configuration display
  const needsConfigurationDisplay = (connector: MCPServerOption) => {
    // Sequential thinking doesn't need configuration display
    const name = connector.name.toLowerCase()
    return !(name.includes('sequential') || name.includes('thinking'))
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

    // Log connector interaction for debugging
    console.log('[ConnectorSelector] Toggling connector:', connector.name)

    try {
      setConnectingIds(prev => new Set(prev).add(connector.id))

      if (isCurrentlySelected) {
        // Deselect - let parent handle the connector instance removal
        const newSelected = selectedConnectors.filter(c => c.id !== connector.id)
        onConnectorsChange(newSelected)
      } else {
        // Check if connector requires API keys
        const requirements = getApiKeyRequirements(connector)

        if (requirements.length > 0) {
          // Show API key modal for configuration
          setCurrentConnectorForApiKeys(connector)
          setApiKeyRequirements(requirements)
          setIsApiKeyModalOpen(true)
          setIsDropdownOpen(false) // Close dropdown when modal opens
        } else {
          // Select directly - no API keys required
          const newSelected = [...selectedConnectors, connector]
          onConnectorsChange(newSelected)
        }
      }
    } catch (err) {
      console.error('Failed to toggle connector:', err)
      setError(`Failed to ${isCurrentlySelected ? 'disconnect' : 'connect'} ${connector.name}`)
    } finally {
      // Only clear connecting state if we're not showing the modal
      if (!connectorRequiresApiKeys(connector) || isCurrentlySelected) {
        setConnectingIds(prev => {
          const newSet = new Set(prev)
          newSet.delete(connector.id)
          return newSet
        })
      }
    }
  }

  // Handle API key modal submission
  const handleApiKeySubmit = async (apiKeys: Record<string, string>) => {
    if (!currentConnectorForApiKeys) return

    try {
      console.log(
        '[ConnectorSelector] Submitting API keys for connector:',
        currentConnectorForApiKeys.name
      )
      console.log('[ConnectorSelector] API keys provided:', Object.keys(apiKeys))

      // Build environment variables string for the connector configuration
      const environmentVariables = ConnectorApiKeyManager.buildEnvironmentString(
        currentConnectorForApiKeys
      )

      console.log('[ConnectorSelector] Built environment variables:', environmentVariables)

      // Create enhanced connector option with API keys in the template env field
      // This is used for the UI display and template matching
      const enhancedConnector: MCPServerOption = {
        ...currentConnectorForApiKeys,
        env: environmentVariables,
      }

      // Add to selected connectors - this will trigger the parent to create the connector instance
      // The parent (StarshipCrewContent) will handle creating the actual connector instance
      // with the API keys stored in config.environmentVariables
      const newSelected = [...selectedConnectors, enhancedConnector]
      onConnectorsChange(newSelected)

      // Close modal and reset state
      setIsApiKeyModalOpen(false)
      setCurrentConnectorForApiKeys(null)
      setApiKeyRequirements([])
    } catch (err) {
      console.error('Failed to submit API keys:', err)
      throw new Error('Failed to configure connector with API keys')
    } finally {
      // Clear connecting state
      if (currentConnectorForApiKeys) {
        setConnectingIds(prev => {
          const newSet = new Set(prev)
          newSet.delete(currentConnectorForApiKeys.id)
          return newSet
        })
      }
    }
  }

  // Handle API key modal cancellation
  const handleApiKeyCancel = () => {
    if (currentConnectorForApiKeys) {
      // Clear connecting state
      setConnectingIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(currentConnectorForApiKeys.id)
        return newSet
      })
    }

    // Reset modal state
    setIsApiKeyModalOpen(false)
    setCurrentConnectorForApiKeys(null)
    setApiKeyRequirements([])
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
    <div className={cn('space-y-6', className)}>
      {/* Enhanced Header with better visual hierarchy */}
      <div className="p-6 bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20 rounded-lg space-y-6">
        <div className="flex items-center gap-4">
          <span className="bg-primary/20 p-3 rounded-lg shadow-sm flex-shrink-0">
            <Plug className="h-6 w-6 text-primary" />
          </span>
          <div className="flex-1 min-w-0 space-y-1">
            <h3 className="text-xl font-bold text-foreground">Connectors</h3>
            <p className="text-sm text-muted-foreground">
              Manage your starship&apos;s external connections
            </p>
          </div>
        </div>

        {/* Browse Connectors Dropdown */}
        <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              className="w-full justify-between h-11 px-4 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors border-0 shadow-sm"
              disabled={disabled}
              aria-label="Select connectors"
              aria-expanded={isDropdownOpen}
              aria-haspopup="listbox"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                <span className="font-medium">Browse Connectors</span>
              </div>
              <ChevronDown className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[var(--radix-dropdown-menu-trigger-width)] max-h-[450px] overflow-y-auto bg-card border-2 border-primary/30 shadow-2xl rounded-xl"
            align="start"
          >
            {filteredConnectors.length === 0 ? (
              <DropdownMenuItem disabled className="py-4 text-center text-muted-foreground">
                No connectors available
              </DropdownMenuItem>
            ) : (
              filteredConnectors.map((connector, index) => {
                const isSelected = isConnectorSelected(connector)
                const isConnecting = connectingIds.has(connector.id)
                const connectorInstance = getConnectorInstance(connector)
                const status = getConnectorStatus(connector)

                // Enhanced status display with health metrics
                const healthMetrics = connectorInstance
                  ? monitoringService.createHealthMetrics()
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
                      return <CheckCircle className="w-3 h-3 text-green-500" />
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
                  return `Status: ${status}\nHealth: ${healthMetrics.healthStatus}\nUptime: ${connectorMonitoring.formatUptime()}\nSuccess Rate: ${connectorMonitoring.formatSuccessRate()}`
                }

                return (
                  <div key={connector.id}>
                    <DropdownMenuItem
                      onClick={() => handleConnectorToggle(connector)}
                      disabled={disabled || isConnecting}
                      className={cn(
                        'flex items-start gap-4 p-4 cursor-pointer transition-all duration-300 hover:bg-gradient-to-r hover:from-primary/8 hover:to-primary/3 hover:shadow-sm min-h-[90px] rounded-lg group',
                        isSelected &&
                          'bg-gradient-to-r from-green-50 to-green-25 dark:from-green-900/20 dark:to-green-900/10 shadow-md'
                      )}
                      role="option"
                      aria-selected={isSelected}
                    >
                      <div className="flex items-center justify-center w-6 h-6 mt-1 flex-shrink-0">
                        {isConnecting ? (
                          <Loader2 className="w-5 h-5 animate-spin text-primary" />
                        ) : isSelected ? (
                          <div className="w-5 h-5 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center shadow-sm border border-green-600/50">
                            <Check className="w-3 h-3 text-white font-bold" />
                          </div>
                        ) : (
                          <div className="w-5 h-5 border-2 border-muted-foreground/30 rounded-full hover:border-primary/70 hover:bg-primary/5 transition-all duration-200 group-hover:scale-110" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0 space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">{getConnectorIcon(connector)}</span>
                              <div className="flex flex-col">
                                <h4 className="font-bold text-base text-foreground truncate group-hover:text-primary transition-colors">
                                  {connector.name}
                                </h4>
                                <span className="text-xs text-muted-foreground">
                                  {getConnectorDescription(connector)}
                                </span>
                              </div>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="flex items-center justify-center w-5 h-5 cursor-help rounded-full transition-all duration-200">
                                      {getStatusIcon()}
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <div className="text-xs whitespace-pre-line max-w-xs">
                                      {getHealthTooltip()}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </div>
                        </div>

                        {connectorRequiresApiKeys(connector) &&
                          needsConfigurationDisplay(connector) && (
                            <div className="flex flex-wrap items-center gap-2">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge
                                      variant="secondary"
                                      className="text-xs font-semibold bg-gradient-to-r from-amber-100 to-amber-50 text-amber-800 hover:from-amber-200 hover:to-amber-100 dark:from-amber-900/40 dark:to-amber-900/20 dark:text-amber-300 border border-amber-200 dark:border-amber-800 shadow-sm"
                                    >
                                      <Key className="w-3 h-3 mr-1.5" />
                                      Configuration Required
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <div className="text-xs">
                                      This connector requires configuration to function
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          )}

                        {connector.env && (
                          <div className="text-xs text-muted-foreground bg-gradient-to-r from-muted/40 to-muted/20 px-3 py-2 rounded-lg border border-muted-foreground/10 shadow-sm">
                            {formatEnvForDisplay(connector.env)}
                          </div>
                        )}

                        {connectorInstance?.errorMessage && status === 'error' && (
                          <div className="text-xs text-red-700 bg-gradient-to-r from-red-50 to-red-25 dark:from-red-900/30 dark:to-red-900/10 px-3 py-2 rounded-lg border border-red-200 dark:border-red-800 shadow-sm line-clamp-2">
                            <span className="font-semibold">Error:</span>{' '}
                            {connectorInstance.errorMessage}
                          </div>
                        )}
                      </div>
                    </DropdownMenuItem>

                    {/* Add separator between connector options */}
                    {index < filteredConnectors.length - 1 && (
                      <div className="mx-3 my-2">
                        <div className="h-0.5 bg-gradient-to-r from-transparent via-border to-transparent"></div>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Enhanced Selected Connectors Display */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 px-1">
          <div className="h-px bg-gradient-to-r from-primary/50 to-transparent flex-1"></div>
          <h4 className="text-sm font-semibold text-primary uppercase tracking-wide">
            ACTIVE CONNECTORS
          </h4>
          <div className="h-px bg-gradient-to-l from-primary/50 to-transparent flex-1"></div>
        </div>

        {selectedConnectors.length > 0 ? (
          <div className="space-y-3">
            {selectedConnectors.map(connector => {
              const isConnecting = connectingIds.has(connector.id)
              const connectorInstance = getConnectorInstance(connector)
              const status = getConnectorStatus(connector)

              // Enhanced status display with health metrics
              const healthMetrics = connectorInstance
                ? monitoringService.createHealthMetrics()
                : null

              // Get API key status for this connector
              const apiKeyStatusInfo = apiKeyStatusMap.get(connector.id)

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
                  return {
                    icon: <CheckCircle className="w-4 h-4 text-green-500" />,
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
                        {healthMetrics.healthStatus === 'healthy' ? 'Connected' : status}
                      </Badge>
                    ),
                    borderColor:
                      healthMetrics.healthStatus === 'healthy'
                        ? 'border-green-300 dark:border-green-700'
                        : healthMetrics.healthStatus === 'warning'
                          ? 'border-yellow-300 dark:border-yellow-700'
                          : healthMetrics.healthStatus === 'critical'
                            ? 'border-red-300 dark:border-red-700'
                            : 'border-green-200 dark:border-green-800',
                  }
                }

                // Fallback to basic status display
                switch (status) {
                  case 'active':
                    return {
                      icon: <CheckCircle className="w-4 h-4 text-green-500" />,
                      badge: (
                        <Badge variant="default" className="text-xs">
                          Connected
                        </Badge>
                      ),
                      borderColor: 'border-green-300 dark:border-green-700',
                    }
                  case 'connecting':
                    return {
                      icon: <Clock className="w-4 h-4 text-blue-500" />,
                      badge: (
                        <Badge variant="secondary" className="text-xs">
                          Connecting...
                        </Badge>
                      ),
                      borderColor: 'border-green-200 dark:border-green-800',
                    }
                  case 'error':
                    return {
                      icon: <XCircle className="w-4 h-4 text-red-500" />,
                      badge: (
                        <Badge variant="destructive" className="text-xs">
                          Error
                        </Badge>
                      ),
                      borderColor: 'border-red-300 dark:border-red-700',
                    }
                  case 'inactive':
                    return {
                      icon: <WifiOff className="w-4 h-4 text-gray-500" />,
                      badge: (
                        <Badge variant="outline" className="text-xs">
                          Inactive
                        </Badge>
                      ),
                      borderColor: 'border-green-200 dark:border-green-800',
                    }
                  default:
                    return {
                      icon: <WifiOff className="w-4 h-4 text-muted-foreground" />,
                      badge: null,
                      borderColor: 'border-green-200 dark:border-green-800',
                    }
                }
              }

              const statusDisplay = getStatusDisplay()

              return (
                <div
                  key={connector.id}
                  className={cn(
                    'flex items-start gap-4 p-5 border-2 rounded-xl bg-gradient-to-r from-card to-muted/20 transition-all duration-200 shadow-sm hover:shadow-md',
                    statusDisplay.borderColor
                  )}
                >
                  <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 border-2 border-primary/20 flex-shrink-0">
                    {statusDisplay.icon}
                  </div>

                  <div className="flex-1 min-w-0 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-lg text-foreground truncate mb-1">
                          {connector.name}
                        </h4>
                        <div className="flex flex-wrap items-center gap-2">
                          {statusDisplay.badge}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Configuration button - only show if connector instance exists and callbacks are provided */}
                        {connectorInstance && onConfigUpdate && onTemplateApply && (
                          <ConnectorInstanceConfig
                            connectorId={connectorInstance.id}
                            starshipId={starshipId}
                            connectorName={connector.name}
                            currentConfig={{
                              environmentVariables: connectorInstance.env || '{}',
                            }}
                            onTemplateApply={(templateId: string) =>
                              onTemplateApply(connectorInstance.id, templateId)
                            }
                            disabled={disabled}
                            className="h-9 w-9 p-0"
                          />
                        )}

                        <Button
                          onClick={() => handleConnectorToggle(connector)}
                          size="sm"
                          variant="ghost"
                          disabled={disabled || isConnecting}
                          className="h-9 w-9 p-0 text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/50 transition-colors"
                          aria-label={`Remove ${connector.name}`}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    {/* API Key Status Badge */}
                    {apiKeyStatusInfo && apiKeyStatusInfo.status !== 'not_required' && (
                      <div className="flex items-center gap-2">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge
                                variant={
                                  apiKeyStatusInfo.status === 'configured'
                                    ? 'default'
                                    : apiKeyStatusInfo.status === 'missing'
                                      ? 'secondary'
                                      : 'destructive'
                                }
                                className={cn(
                                  'text-xs',
                                  apiKeyStatusInfo.status === 'configured' &&
                                    'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
                                  apiKeyStatusInfo.status === 'missing' &&
                                    'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                                )}
                              >
                                🔑{' '}
                                {apiKeyStatusInfo.status === 'configured'
                                  ? 'API Keys Configured'
                                  : apiKeyStatusInfo.status === 'missing'
                                    ? 'API Keys Missing'
                                    : 'API Keys Invalid'}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="text-xs whitespace-pre-line max-w-xs">
                                {ConnectorApiKeyStatus.getTooltipContent(apiKeyStatusInfo)}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        {apiKeyStatusInfo.missingKeys.length > 0 && (
                          <span className="text-xs text-amber-600 font-medium">
                            Missing: {apiKeyStatusInfo.missingKeys.length} key
                            {apiKeyStatusInfo.missingKeys.length !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    )}

                    {connectorInstance?.errorMessage && status === 'error' && (
                      <div className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg border border-red-200 dark:border-red-800">
                        <strong>Error:</strong> {connectorInstance.errorMessage}
                      </div>
                    )}

                    {connectorInstance?.lastUsed && (
                      <p className="text-xs text-muted-foreground">
                        Last used: {new Date(connectorInstance.lastUsed).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-center py-10 bg-muted/5 border border-dashed border-muted rounded-lg">
            <div className="w-16 h-16 bg-muted/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Plug className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-base text-muted-foreground mb-3">No connectors available</p>
          </div>
        )}
      </div>

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

      {/* API Key Input Modal */}
      {isApiKeyModalOpen && currentConnectorForApiKeys && (
        <ApiKeyInputModal
          isOpen={isApiKeyModalOpen}
          onClose={handleApiKeyCancel}
          onSubmit={handleApiKeySubmit}
          connector={currentConnectorForApiKeys}
          requirements={apiKeyRequirements}
        />
      )}
    </div>
  )
}
