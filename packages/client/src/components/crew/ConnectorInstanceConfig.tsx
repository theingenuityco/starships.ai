'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Settings,
  Save,
  RotateCcw,
  AlertCircle,
  CheckCircle,
  Clock,
  Zap,
  Activity,
  Shield,
  FileText,
  Download,
  Upload,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Types for configuration
interface ConnectorInstanceConfig {
  customName?: string
  customDescription?: string
  environmentVariables?: string
  timeouts?: {
    connection?: number
    request?: number
    idle?: number
  }
  retry?: {
    maxAttempts?: number
    baseDelay?: number
    maxDelay?: number
    exponentialBackoff?: boolean
  }
  logging?: {
    level?: 'error' | 'warn' | 'info' | 'debug'
    enableDebug?: boolean
    logRequests?: boolean
    logMetrics?: boolean
  }
  resources?: {
    maxMemoryMB?: number
    maxCpuPercent?: number
    maxConnections?: number
  }
  healthCheck?: {
    enabled?: boolean
    interval?: number
    timeout?: number
    failureThreshold?: number
  }
  customConfig?: Record<string, any>
}

interface ConnectorConfigTemplate {
  id: string
  name: string
  description: string
  category: 'development' | 'production' | 'testing' | 'monitoring' | 'custom'
  tags: string[]
  config: ConnectorInstanceConfig
}

interface ConnectorInstanceConfigProps {
  connectorId: string
  starshipId: string
  connectorName: string
  currentConfig?: ConnectorInstanceConfig
  onConfigUpdate: (config: ConnectorInstanceConfig) => Promise<void>
  onTemplateApply: (templateId: string) => Promise<void>
  disabled?: boolean
  className?: string
}

// Default configuration values
const DEFAULT_CONFIG: Required<ConnectorInstanceConfig> = {
  customName: '',
  customDescription: '',
  environmentVariables: '{}',
  timeouts: {
    connection: 30000,
    request: 60000,
    idle: 300000,
  },
  retry: {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    exponentialBackoff: true,
  },
  logging: {
    level: 'info',
    enableDebug: false,
    logRequests: false,
    logMetrics: true,
  },
  resources: {
    maxMemoryMB: 512,
    maxCpuPercent: 80,
    maxConnections: 100,
  },
  healthCheck: {
    enabled: true,
    interval: 30000,
    timeout: 5000,
    failureThreshold: 3,
  },
  customConfig: {},
}

// Built-in configuration templates
const BUILTIN_TEMPLATES: ConnectorConfigTemplate[] = [
  {
    id: 'development',
    name: 'Development',
    description: 'Optimized for development with debug logging and relaxed timeouts',
    category: 'development',
    tags: ['development', 'debug', 'local'],
    config: {
      timeouts: {
        connection: 60000,
        request: 120000,
        idle: 600000,
      },
      retry: {
        maxAttempts: 1,
        baseDelay: 500,
        maxDelay: 2000,
        exponentialBackoff: false,
      },
      logging: {
        level: 'debug',
        enableDebug: true,
        logRequests: true,
        logMetrics: true,
      },
      healthCheck: {
        enabled: true,
        interval: 60000,
        timeout: 10000,
        failureThreshold: 5,
      },
    },
  },
  {
    id: 'production',
    name: 'Production',
    description: 'Optimized for production with conservative settings and monitoring',
    category: 'production',
    tags: ['production', 'stable', 'monitoring'],
    config: {
      timeouts: {
        connection: 15000,
        request: 30000,
        idle: 180000,
      },
      retry: {
        maxAttempts: 3,
        baseDelay: 1000,
        maxDelay: 8000,
        exponentialBackoff: true,
      },
      logging: {
        level: 'warn',
        enableDebug: false,
        logRequests: false,
        logMetrics: true,
      },
      resources: {
        maxMemoryMB: 256,
        maxCpuPercent: 70,
        maxConnections: 50,
      },
      healthCheck: {
        enabled: true,
        interval: 15000,
        timeout: 3000,
        failureThreshold: 2,
      },
    },
  },
  {
    id: 'testing',
    name: 'Testing',
    description: 'Optimized for testing with fast timeouts and detailed logging',
    category: 'testing',
    tags: ['testing', 'ci', 'fast'],
    config: {
      timeouts: {
        connection: 5000,
        request: 10000,
        idle: 30000,
      },
      retry: {
        maxAttempts: 1,
        baseDelay: 100,
        maxDelay: 500,
        exponentialBackoff: false,
      },
      logging: {
        level: 'info',
        enableDebug: false,
        logRequests: true,
        logMetrics: false,
      },
      healthCheck: {
        enabled: false,
        interval: 5000,
        timeout: 1000,
        failureThreshold: 1,
      },
    },
  },
]

export function ConnectorInstanceConfig({
  connectorId,
  starshipId,
  connectorName,
  currentConfig = {},
  onConfigUpdate,
  onTemplateApply,
  disabled = false,
  className,
}: ConnectorInstanceConfigProps) {
  const [config, setConfig] = useState<ConnectorInstanceConfig>({
    ...DEFAULT_CONFIG,
    ...currentConfig,
  })
  const [originalConfig, setOriginalConfig] = useState<ConnectorInstanceConfig>({
    ...DEFAULT_CONFIG,
    ...currentConfig,
  })
  const [isOpen, setIsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('general')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [envVarsError, setEnvVarsError] = useState<string | null>(null)

  // Update config when currentConfig changes
  useEffect(() => {
    const mergedConfig = { ...DEFAULT_CONFIG, ...currentConfig }
    setConfig(mergedConfig)
    setOriginalConfig(mergedConfig)
  }, [currentConfig])

  // Check if configuration has been modified
  const hasChanges = JSON.stringify(config) !== JSON.stringify(originalConfig)

  // Validate environment variables JSON
  const validateEnvVars = (envString: string): boolean => {
    try {
      JSON.parse(envString || '{}')
      setEnvVarsError(null)
      return true
    } catch (error) {
      setEnvVarsError('Invalid JSON format')
      return false
    }
  }

  // Handle configuration save
  const handleSave = async () => {
    if (!validateEnvVars(config.environmentVariables || '{}')) {
      setActiveTab('general')
      return
    }

    try {
      setSaving(true)
      setError(null)

      await onConfigUpdate(config)
      setOriginalConfig({ ...config })
      setSuccess(true)

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      console.error('Failed to save configuration:', err)
      setError(err instanceof Error ? err.message : 'Failed to save configuration')
    } finally {
      setSaving(false)
    }
  }

  // Handle configuration reset
  const handleReset = () => {
    setConfig({ ...originalConfig })
    setError(null)
    setSuccess(false)
    setEnvVarsError(null)
  }

  // Apply configuration template
  const handleApplyTemplate = async (template: ConnectorConfigTemplate) => {
    try {
      setSaving(true)
      setError(null)

      const newConfig = { ...config, ...template.config }
      setConfig(newConfig)

      await onTemplateApply(template.id)
      setOriginalConfig({ ...newConfig })
      setSuccess(true)

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      console.error('Failed to apply template:', err)
      setError(err instanceof Error ? err.message : 'Failed to apply template')
    } finally {
      setSaving(false)
    }
  }

  // Export configuration as JSON
  const handleExport = () => {
    const dataStr = JSON.stringify(config, null, 2)
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr)

    const exportFileDefaultName = `${connectorName}-config.json`

    const linkElement = document.createElement('a')
    linkElement.setAttribute('href', dataUri)
    linkElement.setAttribute('download', exportFileDefaultName)
    linkElement.click()
  }

  // Import configuration from JSON
  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = e => {
      try {
        const importedConfig = JSON.parse(e.target?.result as string)
        setConfig({ ...DEFAULT_CONFIG, ...importedConfig })
        setError(null)
      } catch (err) {
        setError('Invalid configuration file format')
      }
    }
    reader.readAsText(file)
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled} className={cn('gap-2', className)}>
          <Settings className="h-4 w-4" />
          Configure
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Configure {connectorName}
          </DialogTitle>
          <DialogDescription>
            Customize the configuration for this connector instance. Changes will be applied
            immediately.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="general" className="flex items-center gap-1">
                <FileText className="h-3 w-3" />
                General
              </TabsTrigger>
              <TabsTrigger value="timeouts" className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Timeouts
              </TabsTrigger>
              <TabsTrigger value="retry" className="flex items-center gap-1">
                <RotateCcw className="h-3 w-3" />
                Retry
              </TabsTrigger>
              <TabsTrigger value="logging" className="flex items-center gap-1">
                <Activity className="h-3 w-3" />
                Logging
              </TabsTrigger>
              <TabsTrigger value="templates" className="flex items-center gap-1">
                <Shield className="h-3 w-3" />
                Templates
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto mt-4 space-y-4">
              <TabsContent value="general" className="space-y-4 mt-0">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">General Settings</CardTitle>
                    <CardDescription>
                      Basic configuration options for this connector instance
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="customName">Custom Name</Label>
                        <Input
                          id="customName"
                          value={config.customName || ''}
                          onChange={e => setConfig({ ...config, customName: e.target.value })}
                          placeholder="Enter custom name..."
                          disabled={disabled}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="customDescription">Custom Description</Label>
                        <Input
                          id="customDescription"
                          value={config.customDescription || ''}
                          onChange={e =>
                            setConfig({ ...config, customDescription: e.target.value })
                          }
                          placeholder="Enter description..."
                          disabled={disabled}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="environmentVariables">Environment Variables (JSON)</Label>
                      <Textarea
                        id="environmentVariables"
                        value={config.environmentVariables || '{}'}
                        onChange={e => {
                          setConfig({ ...config, environmentVariables: e.target.value })
                          validateEnvVars(e.target.value)
                        }}
                        placeholder='{"API_KEY": "your-key", "DEBUG": "true"}'
                        className="font-mono text-sm"
                        rows={4}
                        disabled={disabled}
                      />
                      {envVarsError && (
                        <div className="flex items-center gap-2 text-sm text-red-600">
                          <AlertCircle className="h-4 w-4" />
                          {envVarsError}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="timeouts" className="space-y-4 mt-0">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Timeout Settings</CardTitle>
                    <CardDescription>
                      Configure timeout values for different operations (in milliseconds)
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="connectionTimeout">Connection Timeout</Label>
                        <Input
                          id="connectionTimeout"
                          type="number"
                          value={config.timeouts?.connection || DEFAULT_CONFIG.timeouts.connection}
                          onChange={e =>
                            setConfig({
                              ...config,
                              timeouts: {
                                ...config.timeouts,
                                connection: parseInt(e.target.value) || 0,
                              },
                            })
                          }
                          disabled={disabled}
                        />
                        <p className="text-xs text-muted-foreground">Default: 30000ms</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="requestTimeout">Request Timeout</Label>
                        <Input
                          id="requestTimeout"
                          type="number"
                          value={config.timeouts?.request || DEFAULT_CONFIG.timeouts.request}
                          onChange={e =>
                            setConfig({
                              ...config,
                              timeouts: {
                                ...config.timeouts,
                                request: parseInt(e.target.value) || 0,
                              },
                            })
                          }
                          disabled={disabled}
                        />
                        <p className="text-xs text-muted-foreground">Default: 60000ms</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="idleTimeout">Idle Timeout</Label>
                        <Input
                          id="idleTimeout"
                          type="number"
                          value={config.timeouts?.idle || DEFAULT_CONFIG.timeouts.idle}
                          onChange={e =>
                            setConfig({
                              ...config,
                              timeouts: { ...config.timeouts, idle: parseInt(e.target.value) || 0 },
                            })
                          }
                          disabled={disabled}
                        />
                        <p className="text-xs text-muted-foreground">Default: 300000ms</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="retry" className="space-y-4 mt-0">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Retry Configuration</CardTitle>
                    <CardDescription>
                      Configure retry behavior for failed operations
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="maxAttempts">Max Attempts</Label>
                        <Input
                          id="maxAttempts"
                          type="number"
                          min="1"
                          max="10"
                          value={config.retry?.maxAttempts || DEFAULT_CONFIG.retry.maxAttempts}
                          onChange={e =>
                            setConfig({
                              ...config,
                              retry: {
                                ...config.retry,
                                maxAttempts: parseInt(e.target.value) || 1,
                              },
                            })
                          }
                          disabled={disabled}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="baseDelay">Base Delay (ms)</Label>
                        <Input
                          id="baseDelay"
                          type="number"
                          value={config.retry?.baseDelay || DEFAULT_CONFIG.retry.baseDelay}
                          onChange={e =>
                            setConfig({
                              ...config,
                              retry: { ...config.retry, baseDelay: parseInt(e.target.value) || 0 },
                            })
                          }
                          disabled={disabled}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="maxDelay">Max Delay (ms)</Label>
                        <Input
                          id="maxDelay"
                          type="number"
                          value={config.retry?.maxDelay || DEFAULT_CONFIG.retry.maxDelay}
                          onChange={e =>
                            setConfig({
                              ...config,
                              retry: { ...config.retry, maxDelay: parseInt(e.target.value) || 0 },
                            })
                          }
                          disabled={disabled}
                        />
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Switch
                        checked={
                          config.retry?.exponentialBackoff ??
                          DEFAULT_CONFIG.retry.exponentialBackoff
                        }
                        onCheckedChange={checked =>
                          setConfig({
                            ...config,
                            retry: { ...config.retry, exponentialBackoff: checked },
                          })
                        }
                        disabled={disabled}
                      />
                      <Label htmlFor="exponentialBackoff">Enable Exponential Backoff</Label>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="logging" className="space-y-4 mt-0">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Logging Configuration</CardTitle>
                    <CardDescription>Configure logging levels and debug options</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="logLevel">Log Level</Label>
                      <Select
                        value={config.logging?.level || DEFAULT_CONFIG.logging.level}
                        onValueChange={value =>
                          setConfig({
                            ...config,
                            logging: {
                              ...config.logging,
                              level: value as 'error' | 'warn' | 'info' | 'debug',
                            },
                          })
                        }
                        disabled={disabled}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="error">Error</SelectItem>
                          <SelectItem value="warn">Warning</SelectItem>
                          <SelectItem value="info">Info</SelectItem>
                          <SelectItem value="debug">Debug</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={
                            config.logging?.enableDebug ?? DEFAULT_CONFIG.logging.enableDebug
                          }
                          onCheckedChange={checked =>
                            setConfig({
                              ...config,
                              logging: { ...config.logging, enableDebug: checked },
                            })
                          }
                          disabled={disabled}
                        />
                        <Label>Enable Debug Mode</Label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={
                            config.logging?.logRequests ?? DEFAULT_CONFIG.logging.logRequests
                          }
                          onCheckedChange={checked =>
                            setConfig({
                              ...config,
                              logging: { ...config.logging, logRequests: checked },
                            })
                          }
                          disabled={disabled}
                        />
                        <Label>Log Requests/Responses</Label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={config.logging?.logMetrics ?? DEFAULT_CONFIG.logging.logMetrics}
                          onCheckedChange={checked =>
                            setConfig({
                              ...config,
                              logging: { ...config.logging, logMetrics: checked },
                            })
                          }
                          disabled={disabled}
                        />
                        <Label>Log Performance Metrics</Label>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="templates" className="space-y-4 mt-0">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Configuration Templates</CardTitle>
                    <CardDescription>
                      Apply pre-configured templates or manage your configuration
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {BUILTIN_TEMPLATES.map(template => (
                        <Card
                          key={template.id}
                          className="cursor-pointer hover:shadow-md transition-shadow"
                        >
                          <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-sm">{template.name}</CardTitle>
                              <Badge variant="outline">{template.category}</Badge>
                            </div>
                            <CardDescription className="text-xs">
                              {template.description}
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="pt-0">
                            <div className="flex flex-wrap gap-1 mb-3">
                              {template.tags.map(tag => (
                                <Badge key={tag} variant="secondary" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full"
                              onClick={() => handleApplyTemplate(template)}
                              disabled={disabled || saving}
                            >
                              Apply Template
                            </Button>
                          </CardContent>
                        </Card>
                      ))}
                    </div>

                    <Separator />

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExport}
                        disabled={disabled}
                        className="gap-2"
                      >
                        <Download className="h-4 w-4" />
                        Export Config
                      </Button>

                      <div className="relative">
                        <input
                          type="file"
                          accept=".json"
                          onChange={handleImport}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          disabled={disabled}
                        />
                        <Button variant="outline" size="sm" disabled={disabled} className="gap-2">
                          <Upload className="h-4 w-4" />
                          Import Config
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </div>
          </Tabs>
        </div>

        <DialogFooter className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}
            {success && (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle className="h-4 w-4" />
                Configuration saved successfully
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={disabled || saving || !hasChanges}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset
            </Button>
            <Button onClick={handleSave} disabled={disabled || saving || !hasChanges}>
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
