'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { MCPServerOption, MCPServerConnector, mcpServerAPI } from '@/lib/api'
import { monitoringService } from '@/lib/connector-monitoring'
import { ConnectorApiKeyStatus, ApiKeyStatusInfo } from '@/lib/connector-api-key-status'
import { EnhancedApiKeyInputModal } from './EnhancedApiKeyInputModal'
import { ConnectorApiKeyManager } from '@/lib/connector-api-keys'
import { ApiKeyRequirement } from '@/types/connector-api-keys'
import { useErrorRecovery, ErrorRecoveryManager } from '@/lib/error-recovery'
import { ErrorBoundary, useErrorHandler } from '@/components/ui/error-boundary'
import {
  ConnectorListSkeleton,
  ConnectionStatus,
  InlineLoading,
} from '@/components/ui/loading-states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
  AlertTriangle,
  Key,
  RefreshCw,
  Filter,
  SortAsc,
  SortDesc,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface EnhancedConnectorSelectorProps {
  starshipId: string
  selectedConnectors: MCPServerOption[]
  onConnectorsChange: (connectors: MCPServerOption[]) => void
  disabled?: boolean
  className?: string
  connectorInstances?: MCPServerConnector[]
  showAdvancedFeatures?: boolean
  autoRefresh?: boolean
  refreshInterval?: number
}

type SortOption = 'name' | 'status' | 'lastUsed' | 'health'
type FilterOption = 'all' | 'connected' | 'available' | 'error' | 'requires-keys'

interface ConnectorWithMetrics extends MCPServerOption {
  instance?: MCPServerConnector
  status: MCPServerConnector['status'] | 'disconnected'
  healthMetrics?: any
  apiKeyStatus?: ApiKeyStatusInfo
  lastUsed?: Date
  isConnecting?: boolean
}

export function EnhancedConnectorSelector({
  starshipId,
  selectedConnectors,
  onConnectorsChange,
  disabled = false,
  className,
  connectorInstances = [],
  showAdvancedFeatures = true,
  autoRefresh = true,
  refreshInterval = 30000,
}: EnhancedConnectorSelectorProps) {
  // Error handling
  const { handleError, withRetry } = useErrorRecovery()
  const { error, hasError, handleError: setError, clearError } = useErrorHandler()

  // State management
  const [availableConnectors, setAvailableConnectors] = useState<MCPServerOption[]>([])
  const [loading, setLoading] = useState(true)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [connectingIds, setConnectingIds] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<SortOption>('name')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [filterBy, setFilterBy] = useState<FilterOption>('all')
  const [refreshing, setRefreshing] = useState(false)
  // Removed unused state variables

  // API Key Modal state
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false)
  const [currentConnectorForApiKeys, setCurrentConnectorForApiKeys] =
    useState<MCPServerOption | null>(null)
  const [apiKeyRequirements, setApiKeyRequirements] = useState<ApiKeyRequirement[]>([])

  // API Key status tracking
  const [apiKeyStatusMap, setApiKeyStatusMap] = useState<Map<string, ApiKeyStatusInfo>>(new Map())

  // Create connector instance map
  const connectorInstanceMap = useMemo(() => {
    const map = new Map<string, MCPServerConnector>()
    connectorInstances.forEach(instance => {
      if (instance.templateId) {
        map.set(instance.templateId, instance)
      }
    })
    return map
  }, [connectorInstances])

  // Enhanced connectors with metrics and status
  const enhancedConnectors = useMemo((): ConnectorWithMetrics[] => {
    return availableConnectors.map(connector => {
      const instance = connectorInstanceMap.get(connector.id)
      const status = instance ? instance.status : 'disconnected'
      const healthMetrics = instance
        ? monitoringService.createHealthMetrics()
        : null
      const apiKeyStatus = apiKeyStatusMap.get(connector.id)
      const isConnecting = connectingIds.has(connector.id)

      return {
        ...connector,
        instance,
        status,
        healthMetrics,
        apiKeyStatus,
        lastUsed: instance?.lastUsed ? new Date(instance.lastUsed) : undefined,
        isConnecting,
      }
    })
  }, [availableConnectors, connectorInstanceMap, apiKeyStatusMap, connectingIds])

  // Filtered and sorted connectors
  const filteredConnectors = useMemo(() => {
    let filtered = enhancedConnectors

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        connector =>
          connector.name.toLowerCase().includes(query) ||
          connector.command.toLowerCase().includes(query) ||
          connector.id.toLowerCase().includes(query)
      )
    }

    // Apply status filter
    switch (filterBy) {
      case 'connected':
        filtered = filtered.filter(c => c.status === 'active')
        break
      case 'available':
        filtered = filtered.filter(c => c.status === 'disconnected')
        break
      case 'error':
        filtered = filtered.filter(c => c.status === 'error')
        break
      case 'requires-keys':
        filtered = filtered.filter(c => ConnectorApiKeyManager.detectRequirements(c).length > 0)
        break
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let comparison = 0

      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name)
          break
        case 'status': {
          const statusOrder = { active: 0, connecting: 1, inactive: 2, error: 3, disconnected: 4 }
          comparison =
            (statusOrder[a.status as keyof typeof statusOrder] || 5) -
            (statusOrder[b.status as keyof typeof statusOrder] || 5)
          break
        }
        case 'lastUsed': {
          const aTime = a.lastUsed?.getTime() || 0
          const bTime = b.lastUsed?.getTime() || 0
          comparison = bTime - aTime
          break
        }
        case 'health': {
          const aHealth = a.healthMetrics?.healthStatus || 'unknown'
          const bHealth = b.healthMetrics?.healthStatus || 'unknown'
          const healthOrder = { healthy: 0, warning: 1, critical: 2, unknown: 3 }
          comparison =
            (healthOrder[aHealth as keyof typeof healthOrder] || 3) -
            (healthOrder[bHealth as keyof typeof healthOrder] || 3)
          break
        }
      }

      return sortDirection === 'asc' ? comparison : -comparison
    })

    return filtered
  }, [enhancedConnectors, searchQuery, filterBy, sortBy, sortDirection])

  // Update API key status when connector instances change
  useEffect(() => {
    const newApiKeyStatus = new Map<string, ApiKeyStatusInfo>()
    connectorInstances.forEach(instance => {
      if (instance.templateId) {
        const keyStatus = ConnectorApiKeyStatus.checkApiKeyStatus(instance, instance.template)
        newApiKeyStatus.set(instance.templateId, keyStatus)
      }
    })
    setApiKeyStatusMap(newApiKeyStatus)
  }, [connectorInstances])

  // Fetch connector data
  const fetchConnectorData = useCallback(
    async (showLoading = true) => {
      try {
        if (showLoading) {
          setLoading(true)
        } else {
          setRefreshing(true)
        }
        clearError()

        const available = await withRetry(() => mcpServerAPI.getAll(), {
          maxRetries: 2,
          baseDelay: 1000,
        })

        setAvailableConnectors(available)
      } catch (error) {
        setError(new Error('Failed to fetch connector details'))
        console.error('Error fetching connector details:', error)
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [starshipId, withRetry, handleError, setError, clearError]
  )

  // Auto-refresh functionality
  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      fetchConnectorData(false)
    }, refreshInterval)

    return () => clearInterval(interval)
  }, [autoRefresh, refreshInterval, fetchConnectorData])

  // Initial data fetch
  useEffect(() => {
    fetchConnectorData()
  }, [fetchConnectorData])

  // Check if connector is selected
  const isConnectorSelected = useCallback(
    (connector: MCPServerOption): boolean => {
      return selectedConnectors.some(selected => selected.id === connector.id)
    },
    [selectedConnectors]
  )

  // Handle connector toggle with enhanced error handling
  const handleConnectorToggle = useCallback(
    async (connector: MCPServerOption) => {
      if (disabled || connectingIds.has(connector.id)) return

      const isCurrentlySelected = isConnectorSelected(connector)

      try {
        setConnectingIds(prev => new Set(prev).add(connector.id))
        clearError()

        if (isCurrentlySelected) {
          // Deselect connector
          const newSelected = selectedConnectors.filter(c => c.id !== connector.id)
          onConnectorsChange(newSelected)
        } else {
          // Check if connector requires API keys
          const requirements = ConnectorApiKeyManager.detectRequirements(connector)

          if (requirements.length > 0) {
            // Show API key modal
            setCurrentConnectorForApiKeys(connector)
            setApiKeyRequirements(requirements)
            setIsApiKeyModalOpen(true)
            setIsDropdownOpen(false)
          } else {
            // Select directly
            const newSelected = [...selectedConnectors, connector]
            onConnectorsChange(newSelected)
          }
        }
      } catch (error) {
        handleError(
          error as Error,
          ErrorRecoveryManager.createContext('toggle-connector', 'EnhancedConnectorSelector', {
            connectorId: connector.id,
            action: isCurrentlySelected ? 'disconnect' : 'connect',
          })
        )
        setError(error as Error)
      } finally {
        // Clear connecting state if not showing modal
        if (!ConnectorApiKeyManager.detectRequirements(connector).length || isCurrentlySelected) {
          setConnectingIds(prev => {
            const newSet = new Set(prev)
            newSet.delete(connector.id)
            return newSet
          })
        }
      }
    },
    [
      disabled,
      connectingIds,
      isConnectorSelected,
      selectedConnectors,
      onConnectorsChange,
      clearError,
      handleError,
      setError,
    ]
  )

  // Handle API key modal submission
  const handleApiKeySubmit = useCallback(
    async (apiKeys: Record<string, string>) => {
      if (!currentConnectorForApiKeys) return

      try {
        const enhancedEnv = ConnectorApiKeyManager.buildEnvironmentString(
          currentConnectorForApiKeys,
          apiKeys
        )

        const enhancedConnector: MCPServerOption = {
          ...currentConnectorForApiKeys,
          env: enhancedEnv,
        }

        const newSelected = [...selectedConnectors, enhancedConnector]
        onConnectorsChange(newSelected)

        setIsApiKeyModalOpen(false)
        setCurrentConnectorForApiKeys(null)
        setApiKeyRequirements([])
      } catch (err) {
        throw new Error('Failed to configure connector with API keys')
      } finally {
        if (currentConnectorForApiKeys) {
          setConnectingIds(prev => {
            const newSet = new Set(prev)
            newSet.delete(currentConnectorForApiKeys.id)
            return newSet
          })
        }
      }
    },
    [currentConnectorForApiKeys, selectedConnectors, onConnectorsChange]
  )

  // Handle API key modal cancellation
  const handleApiKeyCancel = useCallback(() => {
    if (currentConnectorForApiKeys) {
      setConnectingIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(currentConnectorForApiKeys.id)
        return newSet
      })
    }

    setIsApiKeyModalOpen(false)
    setCurrentConnectorForApiKeys(null)
    setApiKeyRequirements([])
  }, [currentConnectorForApiKeys])

  // Get command badge variant
  const getCommandBadgeVariant = (command: string): 'default' | 'secondary' | 'outline' => {
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
        <ConnectorListSkeleton count={5} />
      </div>
    )
  }

  // Render error state
  if (hasError && availableConnectors.length === 0) {
    return (
      <ErrorBoundary component="EnhancedConnectorSelector">
        <div className={cn('space-y-4', className)}>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold flex items-center">
              <span className="bg-primary/10 p-2 rounded-md mr-3">
                <Plug className="h-5 w-5 text-primary" />
              </span>
              Connectors
            </h3>
          </div>

          <Card className="border-destructive/20">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center justify-center p-6 text-center">
                <AlertCircle className="w-12 h-12 text-destructive mb-4" />
                <h4 className="font-medium text-destructive mb-2">Failed to Load Connectors</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  {error?.message || 'Unable to fetch available connectors. Please try again.'}
                </p>
                <div className="flex gap-2">
                  <Button onClick={() => fetchConnectorData()} size="sm" variant="outline">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Try Again
                  </Button>
                  {error?.recoveryActions?.map(action => (
                    <Button
                      key={action.id}
                      onClick={action.action}
                      size="sm"
                      variant={action.primary ? 'default' : 'outline'}
                    >
                      {action.label}
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </ErrorBoundary>
    )
  }

  return (
    <ErrorBoundary component="EnhancedConnectorSelector">
      <div className={cn('space-y-6', className)}>
        {/* Enhanced Header */}
        <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="bg-primary/20 p-3 rounded-lg shadow-sm">
                  <Plug className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-xl">Connectors</CardTitle>
                  <CardDescription>
                    Manage your starship&apos;s external connections
                    {autoRefresh && (
                      <span className="ml-2 text-xs">
                        • Auto-refresh enabled
                        {refreshing && <InlineLoading size="xs" className="ml-1" />}
                      </span>
                    )}
                  </CardDescription>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {selectedConnectors.length > 0 && (
                  <Badge
                    variant="default"
                    className="text-sm px-3 py-1 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                  >
                    {selectedConnectors.length} Active
                  </Badge>
                )}

                {showAdvancedFeatures && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => fetchConnectorData(false)}
                          disabled={refreshing}
                        >
                          <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Refresh connectors</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Search and Filters */}
        {showAdvancedFeatures && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row gap-4">
                {/* Search */}
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search connectors..."
                    value={searchQuery}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                    className="pl-10"
                    disabled={disabled}
                  />
                </div>

                {/* Filter */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="min-w-[120px]">
                      <Filter className="h-4 w-4 mr-2" />
                      {filterBy === 'all'
                        ? 'All'
                        : filterBy === 'connected'
                          ? 'Connected'
                          : filterBy === 'available'
                            ? 'Available'
                            : filterBy === 'error'
                              ? 'Error'
                              : 'Requires Keys'}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setFilterBy('all')}>
                      All Connectors
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setFilterBy('connected')}>
                      Connected Only
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setFilterBy('available')}>
                      Available Only
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setFilterBy('error')}>
                      Error Status
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setFilterBy('requires-keys')}>
                      Requires API Keys
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Sort */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="min-w-[120px]">
                      {sortDirection === 'asc' ? (
                        <SortAsc className="h-4 w-4 mr-2" />
                      ) : (
                        <SortDesc className="h-4 w-4 mr-2" />
                      )}
                      Sort
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setSortBy('name')}>Name</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSortBy('status')}>Status</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSortBy('lastUsed')}>
                      Last Used
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSortBy('health')}>Health</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
                    >
                      {sortDirection === 'asc' ? 'Descending' : 'Ascending'}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Results Summary */}
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <div className="text-sm text-muted-foreground">
                  Showing {filteredConnectors.length} of {availableConnectors.length} connectors
                  {searchQuery && ` matching "${searchQuery}"`}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Browse Connectors Section */}
        <div className="space-y-3">
          <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-between h-auto min-h-[3rem] p-4 bg-gradient-to-r from-card to-muted/30 hover:from-muted/50 hover:to-muted/70 transition-all duration-200 border-2 border-dashed border-primary/30 hover:border-primary/50 shadow-sm hover:shadow-md"
                disabled={disabled}
                aria-label="Select connectors"
                aria-expanded={isDropdownOpen}
                aria-haspopup="listbox"
              >
                <div className="flex flex-1 mr-2 items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-primary/60 animate-pulse"></div>
                  {selectedConnectors.length === 0 ? (
                    <span className="text-muted-foreground font-medium">
                      Browse & Select Connectors...
                    </span>
                  ) : (
                    <span className="text-foreground font-medium">Browse More Connectors</span>
                  )}
                </div>
                <ChevronDown className="w-5 h-5 flex-shrink-0 text-primary/70" />
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
              className="w-[var(--radix-dropdown-menu-trigger-width)] max-h-[400px] overflow-y-auto bg-card/95 backdrop-blur-sm border-2 border-primary/20 shadow-xl"
              align="start"
            >
              <DropdownMenuLabel className="text-primary font-semibold">
                Available Connectors ({filteredConnectors.length})
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-primary/20" />

              {filteredConnectors.length === 0 ? (
                <DropdownMenuItem disabled>
                  {searchQuery ? 'No connectors match your search' : 'No connectors available'}
                </DropdownMenuItem>
              ) : (
                filteredConnectors.map(connector => {
                  const isSelected = isConnectorSelected(connector)
                  const requiresApiKeys =
                    ConnectorApiKeyManager.detectRequirements(connector).length > 0

                  return (
                    <DropdownMenuItem
                      key={connector.id}
                      onClick={() => handleConnectorToggle(connector)}
                      disabled={disabled || connector.isConnecting}
                      className={cn(
                        'flex items-start gap-3 p-4 cursor-pointer transition-all duration-200 border-l-4 border-transparent hover:border-primary/50 hover:bg-gradient-to-r hover:from-primary/5 hover:to-transparent',
                        isSelected && 'border-primary bg-gradient-to-r from-primary/10 to-primary/5'
                      )}
                      role="option"
                      aria-selected={isSelected}
                    >
                      {/* Selection Indicator */}
                      <div className="flex items-center justify-center w-5 h-5 mt-0.5">
                        {connector.isConnecting ? (
                          <Loader2 className="w-4 h-4 animate-spin text-primary" />
                        ) : isSelected ? (
                          <div className="w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                            <Check className="w-3 h-3 text-primary-foreground" />
                          </div>
                        ) : (
                          <div className="w-4 h-4 border-2 border-muted-foreground/40 rounded-full hover:border-primary/60 transition-colors" />
                        )}
                      </div>

                      {/* Connector Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className="font-semibold text-sm text-foreground">
                            {connector.name}
                          </span>

                          <Badge
                            variant={getCommandBadgeVariant(connector.command)}
                            className="text-xs font-medium"
                          >
                            {connector.command.toUpperCase()}
                          </Badge>

                          <ConnectionStatus
                            status={
                              connector.isConnecting
                                ? 'connecting'
                                : connector.status === 'active'
                                  ? 'connected'
                                  : connector.status === 'error'
                                    ? 'error'
                                    : 'disconnected'
                            }
                            showLabel={false}
                          />

                          {requiresApiKeys && (
                            <Badge
                              variant="secondary"
                              className="text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                            >
                              <Key className="w-3 h-3 mr-1" />
                              API Keys Required
                            </Badge>
                          )}
                        </div>

                        {connector.env && (
                          <p className="text-xs text-muted-foreground bg-muted/30 px-2 py-1 rounded">
                            {(() => {
                              try {
                                const envVars = JSON.parse(connector.env)
                                const keys = Object.keys(envVars)
                                return keys.length > 0
                                  ? `Requires: ${keys.join(', ')}`
                                  : 'No configuration required'
                              } catch {
                                return 'No configuration required'
                              }
                            })()}
                          </p>
                        )}

                        {connector.instance?.errorMessage && connector.status === 'error' && (
                          <p className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded mt-1 border border-red-200 dark:border-red-800">
                            {connector.instance.errorMessage}
                          </p>
                        )}
                      </div>
                    </DropdownMenuItem>
                  )
                })
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Selected Connectors Display */}
        {selectedConnectors.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 px-1">
              <div className="h-px bg-gradient-to-r from-green-500/50 to-transparent flex-1"></div>
              <h4 className="text-sm font-semibold text-green-600 uppercase tracking-wide">
                Active Connectors
              </h4>
              <div className="h-px bg-gradient-to-l from-green-500/50 to-transparent flex-1"></div>
            </div>

            <div className="space-y-3">
              {selectedConnectors.map(connector => {
                const isConnecting = connectingIds.has(connector.id)
                const connectorInstance = connectorInstanceMap.get(connector.id)
                const status = connectorInstance ? connectorInstance.status : 'disconnected'

                return (
                  <div
                    key={connector.id}
                    className={cn(
                      'flex items-center justify-between p-4 border-2 rounded-xl bg-gradient-to-r from-card to-muted/20 transition-all duration-200 shadow-sm hover:shadow-md',
                      status === 'active'
                        ? 'border-green-200 dark:border-green-800'
                        : status === 'error'
                          ? 'border-red-200 dark:border-red-800'
                          : 'border-border'
                    )}
                  >
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 border-2 border-primary/20">
                        <ConnectionStatus
                          status={
                            isConnecting
                              ? 'connecting'
                              : status === 'active'
                                ? 'connected'
                                : status === 'error'
                                  ? 'error'
                                  : 'disconnected'
                          }
                          showLabel={false}
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                          <span className="font-bold text-base text-foreground">
                            {connector.name}
                          </span>
                          <Badge
                            variant={getCommandBadgeVariant(connector.command)}
                            className="text-xs font-semibold px-2 py-1"
                          >
                            {connector.command.toUpperCase()}
                          </Badge>
                          <ConnectionStatus
                            status={
                              isConnecting
                                ? 'connecting'
                                : status === 'active'
                                  ? 'connected'
                                  : status === 'error'
                                    ? 'error'
                                    : 'disconnected'
                            }
                          />
                        </div>

                        {connector.env && (
                          <p className="text-xs text-muted-foreground bg-muted/40 px-3 py-1.5 rounded-full mb-2 inline-block">
                            {(() => {
                              try {
                                const envVars = JSON.parse(connector.env)
                                const keys = Object.keys(envVars)
                                return keys.length > 0
                                  ? `Requires: ${keys.join(', ')}`
                                  : 'No configuration required'
                              } catch {
                                return 'No configuration required'
                              }
                            })()}
                          </p>
                        )}

                        {connectorInstance?.errorMessage && status === 'error' && (
                          <p className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 px-3 py-1.5 rounded-full border border-red-200 dark:border-red-800 mb-2 inline-block">
                            {connectorInstance.errorMessage}
                          </p>
                        )}

                        {connectorInstance?.lastUsed && (
                          <p className="text-xs text-muted-foreground">
                            Last used: {new Date(connectorInstance.lastUsed).toLocaleString()}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => handleConnectorToggle(connector)}
                        size="sm"
                        variant="outline"
                        disabled={disabled || isConnecting}
                        className="h-9 w-9 p-0 border-destructive/30 hover:border-destructive hover:bg-destructive/10 text-destructive hover:text-destructive"
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
        {hasError && (
          <Card className="border-destructive/20 bg-destructive/5">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0" />
                <div className="flex-1">
                  <h4 className="font-medium text-destructive mb-1">Connection Error</h4>
                  <p className="text-sm text-destructive/80 mb-3">
                    {error?.message || 'An error occurred while managing connectors.'}
                  </p>
                  {error?.recoveryActions && error.recoveryActions.length > 0 && (
                    <div className="flex gap-2">
                      {error.recoveryActions.map(action => (
                        <Button
                          key={action.id}
                          variant={action.primary ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => {
                            if (action.id === 'retry') {
                              fetchConnectorData()
                            } else {
                              action.action()
                            }
                          }}
                          className={
                            action.destructive ? 'border-destructive text-destructive' : ''
                          }
                        >
                          {action.id === 'retry' && <RefreshCw className="h-3 w-3 mr-1" />}
                          {action.label}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
                <Button onClick={clearError} size="sm" variant="ghost" className="h-6 w-6 p-0">
                  <X className="w-3 h-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* API Key Input Modal */}
        {isApiKeyModalOpen && currentConnectorForApiKeys && (
          <EnhancedApiKeyInputModal
            isOpen={isApiKeyModalOpen}
            onClose={handleApiKeyCancel}
            onSubmit={handleApiKeySubmit}
            connector={currentConnectorForApiKeys}
            requirements={apiKeyRequirements}
            showProgress={true}
            enableAutoSave={false}
            validationMode="realtime"
          />
        )}
      </div>
    </ErrorBoundary>
  )
}
