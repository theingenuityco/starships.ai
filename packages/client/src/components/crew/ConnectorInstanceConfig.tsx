'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Settings, Loader2, Check, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

// Configuration interface for connector instances
export interface ConnectorInstanceConfig {
  environmentVariables: string // JSON string of environment variables
  templateId?: string
  version?: number
  lastModified?: string
}

interface ConnectorInstanceConfigProps {
  connectorId: string
  starshipId: string
  connectorName: string
  currentConfig?: ConnectorInstanceConfig
  onTemplateApply: (templateId: string) => Promise<void>
  disabled?: boolean
  className?: string
}

export function ConnectorInstanceConfig({
  connectorId,
  connectorName,
  currentConfig,
  onTemplateApply,
  disabled = false,
  className,
}: ConnectorInstanceConfigProps) {
  const [isUpdating, setIsUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Get environment variables from current config
  const getEnvVars = () => {
    try {
      return currentConfig?.environmentVariables
        ? JSON.parse(currentConfig.environmentVariables)
        : {}
    } catch {
      return {}
    }
  }

  const envVars = getEnvVars()
  const hasConfig = Object.keys(envVars).length > 0

  const handleTemplateApply = async (templateId: string) => {
    if (disabled) return

    try {
      setIsUpdating(true)
      setError(null)
      await onTemplateApply(templateId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply template')
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <DropdownMenu>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                disabled={disabled || isUpdating}
                className={cn(
                  'relative',
                  error && 'text-destructive hover:text-destructive',
                  className
                )}
              >
                {isUpdating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Settings className="h-4 w-4" />
                )}
                {error && (
                  <div className="absolute -top-1 -right-1 w-2 h-2 bg-destructive rounded-full" />
                )}
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>

          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              {connectorName} Config
            </DropdownMenuLabel>
            <DropdownMenuSeparator />

            {/* Configuration Status */}
            <DropdownMenuItem disabled className="flex items-center gap-2">
              {hasConfig ? (
                <>
                  <Check className="h-3 w-3 text-green-500" />
                  <span className="text-sm">Configured</span>
                  <Badge variant="outline" className="ml-auto text-xs">
                    v{currentConfig?.version || 1}
                  </Badge>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-3 w-3 text-amber-500" />
                  <span className="text-sm">No configuration</span>
                </>
              )}
            </DropdownMenuItem>

            {hasConfig && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled>
                  <div className="text-xs text-muted-foreground">
                    <div className="font-medium mb-1">Environment Variables:</div>
                    {Object.keys(envVars).length > 0 ? (
                      <div className="space-y-1">
                        {Object.keys(envVars)
                          .slice(0, 3)
                          .map(key => (
                            <div key={key} className="flex items-center gap-2">
                              <span className="font-mono text-xs">{key}</span>
                              <Badge variant="outline" className="text-xs">
                                {envVars[key] ? 'Set' : 'Empty'}
                              </Badge>
                            </div>
                          ))}
                        {Object.keys(envVars).length > 3 && (
                          <div className="text-xs text-muted-foreground">
                            +{Object.keys(envVars).length - 3} more...
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">None configured</span>
                    )}
                  </div>
                </DropdownMenuItem>
              </>
            )}

            {currentConfig?.lastModified && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled>
                  <div className="text-xs text-muted-foreground">
                    Last modified: {new Date(currentConfig.lastModified).toLocaleString()}
                  </div>
                </DropdownMenuItem>
              </>
            )}

            {error && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled>
                  <div className="text-xs text-destructive">Error: {error}</div>
                </DropdownMenuItem>
              </>
            )}

            <DropdownMenuSeparator />

            {/* Actions */}
            <DropdownMenuItem
              onClick={() => {
                // For now, just log that refresh was requested
                console.log(`Refresh configuration for connector ${connectorId}`)
              }}
              disabled={isUpdating}
            >
              <span className="text-sm">Refresh Configuration</span>
            </DropdownMenuItem>

            {currentConfig?.templateId && (
              <DropdownMenuItem
                onClick={() => handleTemplateApply(currentConfig.templateId!)}
                disabled={isUpdating}
              >
                <span className="text-sm">Reapply Template</span>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <TooltipContent>
          <div className="text-xs">
            <div className="font-medium">{connectorName} Configuration</div>
            <div className="text-muted-foreground">
              {hasConfig
                ? `${Object.keys(envVars).length} variables configured`
                : 'No configuration'}
            </div>
            {error && <div className="text-destructive mt-1">Error: {error}</div>}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
