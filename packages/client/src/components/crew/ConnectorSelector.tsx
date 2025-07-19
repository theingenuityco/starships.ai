'use client'

import { useState, useEffect, useMemo } from 'react'
import { MCPServerOption, mcpServerAPI } from '@/lib/api'
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
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Props interface as specified in the requirements
interface ConnectorSelectorProps {
  starshipId: string
  selectedConnectors: MCPServerOption[]
  onConnectorsChange: (connectors: MCPServerOption[]) => void
  disabled?: boolean
  className?: string
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
}: ConnectorSelectorProps) {
  // State management
  const [availableConnectors, setAvailableConnectors] = useState<MCPServerOption[]>([])
  const [connectedConnectors, setConnectedConnectors] = useState<MCPServerOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [connectingIds, setConnectingIds] = useState<Set<string>>(new Set())

  // Debounced search query
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
    }, 300)

    return () => clearTimeout(timer)
  }, [searchQuery])

  // Fetch data on mount and when starshipId changes
  useEffect(() => {
    fetchConnectorData()
  }, [starshipId])

  // Filtered connectors based on search query
  const filteredConnectors = useMemo(() => {
    if (!debouncedSearchQuery) return availableConnectors

    const query = debouncedSearchQuery.toLowerCase()
    return availableConnectors.filter(
      connector =>
        connector.name.toLowerCase().includes(query) ||
        connector.command.toLowerCase().includes(query) ||
        connector.id.toLowerCase().includes(query)
    )
  }, [availableConnectors, debouncedSearchQuery])

  // Check if a connector is selected
  const isConnectorSelected = (connector: MCPServerOption): boolean => {
    return selectedConnectors.some(selected => selected.id === connector.id)
  }

  // Check if a connector is connected to the starship
  const isConnectorConnected = (connector: MCPServerOption): boolean => {
    return connectedConnectors.some(connected => connected.id === connector.id)
  }

  // Fetch all connector data
  const fetchConnectorData = async () => {
    try {
      setLoading(true)
      setError(null)

      // Fetch both available and connected connectors in parallel
      const [available, connected] = await Promise.all([
        mcpServerAPI.getAll(),
        mcpServerAPI.getConnectedToStarship(starshipId),
      ])

      setAvailableConnectors(available)
      setConnectedConnectors(connected)

      // Update selected connectors to match connected ones if not already set
      if (selectedConnectors.length === 0) {
        onConnectorsChange(connected)
      }
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
    const isCurrentlyConnected = isConnectorConnected(connector)

    try {
      setConnectingIds(prev => new Set(prev).add(connector.id))

      if (isCurrentlySelected) {
        // Deselect and disconnect if connected
        const newSelected = selectedConnectors.filter(c => c.id !== connector.id)
        onConnectorsChange(newSelected)

        if (isCurrentlyConnected) {
          await mcpServerAPI.disconnectFromStarship(starshipId, connector.id)
          setConnectedConnectors(prev => prev.filter(c => c.id !== connector.id))
        }
      } else {
        // Select and connect
        const newSelected = [...selectedConnectors, connector]
        onConnectorsChange(newSelected)

        if (!isCurrentlyConnected) {
          await mcpServerAPI.connectToStarship(starshipId, connector.id)
          setConnectedConnectors(prev => [...prev, connector])
        }
      }
    } catch (err) {
      console.error('Failed to toggle connector:', err)
      setError(`Failed to ${isCurrentlySelected ? 'disconnect' : 'connect'} ${connector.name}`)

      // Revert the optimistic update
      await fetchConnectorData()
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

    try {
      setLoading(true)

      // Disconnect all selected connectors
      await Promise.all(
        selectedConnectors.map(connector =>
          mcpServerAPI.disconnectFromStarship(starshipId, connector.id)
        )
      )

      onConnectorsChange([])
      setConnectedConnectors([])
    } catch (err) {
      console.error('Failed to clear all connectors:', err)
      setError('Failed to disconnect all connectors')
      await fetchConnectorData()
    } finally {
      setLoading(false)
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
        <h3 className="text-lg font-semibold flex items-center">
          <span className="bg-primary/10 p-2 rounded-md mr-3">
            <Plug className="h-5 w-5 text-primary" />
          </span>
          Connectors
          {selectedConnectors.length > 0 && (
            <Badge variant="secondary" className="ml-2">
              {selectedConnectors.length} selected
            </Badge>
          )}
        </h3>
        {selectedConnectors.length > 0 && (
          <Button
            onClick={handleClearAll}
            size="sm"
            variant="ghost"
            disabled={disabled || loading}
            className="text-muted-foreground hover:text-foreground"
          >
            Clear All
          </Button>
        )}
      </div>

      {/* Search Input */}
      <div className="relative">
        <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">
          <Search className="w-4 h-4" />
        </div>
        <Input
          placeholder="Search connectors..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          disabled={disabled}
          className="pl-10 h-10 bg-card border-border"
          aria-label="Search connectors"
        />
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
            <div className="flex flex-wrap gap-1 flex-1 mr-2">
              {selectedConnectors.length === 0 ? (
                <span className="text-muted-foreground">Select connectors...</span>
              ) : (
                selectedConnectors.map(connector => (
                  <Badge
                    key={connector.id}
                    variant="secondary"
                    className="flex items-center gap-1 text-xs"
                  >
                    {isConnectorConnected(connector) ? (
                      <Wifi className="w-3 h-3" />
                    ) : (
                      <WifiOff className="w-3 h-3" />
                    )}
                    {connector.name}
                  </Badge>
                ))
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
            <DropdownMenuItem disabled>
              {debouncedSearchQuery ? 'No connectors match your search' : 'No connectors available'}
            </DropdownMenuItem>
          ) : (
            filteredConnectors.map(connector => {
              const isSelected = isConnectorSelected(connector)
              const isConnected = isConnectorConnected(connector)
              const isConnecting = connectingIds.has(connector.id)

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
                      {isConnected && (
                        <div className="flex items-center gap-1">
                          <Wifi className="w-3 h-3 text-green-500" />
                          <span className="text-xs text-green-600">Connected</span>
                        </div>
                      )}
                    </div>

                    {connector.env && (
                      <p className="text-xs text-muted-foreground">
                        {formatEnvForDisplay(connector.env)}
                      </p>
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
              const isConnected = isConnectorConnected(connector)
              const isConnecting = connectingIds.has(connector.id)

              return (
                <div
                  key={connector.id}
                  className="flex items-center justify-between p-3 border border-border rounded-lg bg-card"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      {isConnecting ? (
                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      ) : isConnected ? (
                        <Wifi className="w-4 h-4 text-green-500" />
                      ) : (
                        <WifiOff className="w-4 h-4 text-muted-foreground" />
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
                        <span
                          className={cn(
                            'text-xs px-2 py-0.5 rounded-full',
                            isConnected
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                              : 'bg-muted text-muted-foreground'
                          )}
                        >
                          {isConnecting ? 'Connecting...' : isConnected ? 'Connected' : 'Available'}
                        </span>
                      </div>

                      {connector.env && (
                        <p className="text-xs text-muted-foreground">
                          {formatEnvForDisplay(connector.env)}
                        </p>
                      )}
                    </div>
                  </div>

                  <Button
                    onClick={() => handleConnectorToggle(connector)}
                    size="sm"
                    variant="ghost"
                    disabled={disabled || isConnecting}
                    className="ml-2 h-8 w-8 p-0"
                    aria-label={`Remove ${connector.name}`}
                  >
                    <X className="w-4 h-4" />
                  </Button>
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
