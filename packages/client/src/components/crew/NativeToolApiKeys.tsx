'use client'

import React, { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import {
  Eye,
  EyeOff,
  Save,
  ExternalLink,
  Zap,
  Shield,
  DollarSign,
  Trash2,
  Settings,
  Check,
  Key,
  Info,
  CheckCircle2,
} from 'lucide-react'
import api from '@/lib/api'

interface ConfigField {
  name: string
  label: string
  placeholder: string
  description: string
  type: string
}

interface NativeToolConfig {
  name: string
  displayName: string
  description: string
  apiKeyPlaceholder: string
  signupUrl: string
  pricing: string
  icon: string
  configFields?: ConfigField[]
  helpText?: string
}

const NATIVE_TOOLS: NativeToolConfig[] = [
  {
    name: 'brave',
    displayName: 'Brave Search',
    description: 'Privacy-focused web search without tracking',
    apiKeyPlaceholder: 'BSA_xxxxx',
    signupUrl: 'https://brave.com/search/api/',
    pricing: '2,000 queries/month free',
    icon: '🦁',
  },
  {
    name: 'firecrawl',
    displayName: 'Firecrawl',
    description:
      'Web scraping with JavaScript rendering, clean markdown extraction, and structured data parsing',
    apiKeyPlaceholder: 'fc_xxxxx',
    signupUrl: 'https://firecrawl.dev',
    pricing: '$19/month for 1,000 pages',
    icon: '🔥',
  },
  {
    name: 'notion',
    displayName: 'Notion',
    description: 'Manage your Notion workspace - create, read, and update pages and databases',
    apiKeyPlaceholder: 'secret_xxxxx',
    signupUrl: 'https://www.notion.so/my-integrations',
    helpText: 'Create an integration at notion.so/my-integrations and share pages with it',
    pricing: 'Free with Notion account',
    icon: '📝',
  },
]

interface NativeToolApiKeysProps {
  starshipId: string
  onConfiguredCountChange?: (count: number) => void
}

export function NativeToolApiKeys({ starshipId, onConfiguredCountChange }: NativeToolApiKeysProps) {
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({})
  const [toolConfigs, setToolConfigs] = useState<Record<string, Record<string, string>>>({})
  const [showKey, setShowKey] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Modal state
  const [selectedTool, setSelectedTool] = useState<string>('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [tempApiKey, setTempApiKey] = useState('')
  const [tempConfigs, setTempConfigs] = useState<Record<string, string>>({})

  useEffect(() => {
    loadApiKeys()
  }, [starshipId])

  useEffect(() => {
    const configuredCount = getConfiguredTools().length
    if (onConfiguredCountChange) {
      onConfiguredCountChange(configuredCount)
    }
  }, [apiKeys, onConfiguredCountChange])

  const loadApiKeys = async () => {
    try {
      const response = await api.get(`/api/starships/${starshipId}/native-api-keys`)

      if (response.data) {
        const keys: Record<string, string> = {}
        NATIVE_TOOLS.forEach(tool => {
          keys[tool.name] = response.data[tool.name] || ''
        })
        setApiKeys(keys)
      }
    } catch (error) {
      console.error('Failed to load API keys:', error)
      const keys: Record<string, string> = {}
      NATIVE_TOOLS.forEach(tool => {
        keys[tool.name] = ''
      })
      setApiKeys(keys)
    }
  }

  const openConfigModal = (toolName?: string) => {
    if (toolName) {
      const tool = NATIVE_TOOLS.find(t => t.name === toolName)
      if (!tool) return

      setSelectedTool(toolName)
      setTempApiKey(apiKeys[toolName] || '')
      setTempConfigs(toolConfigs[toolName] || {})
    } else {
      setSelectedTool('')
      setTempApiKey('')
      setTempConfigs({})
    }
    setIsModalOpen(true)
    setShowKey(false)
    setMessage(null)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setSelectedTool('')
    setTempApiKey('')
    setTempConfigs({})
    setShowKey(false)
    setMessage(null)
  }

  const saveApiKey = async () => {
    if (!selectedTool) return

    setDeleting(true)
    setMessage(null)

    try {
      await api.post(`/api/starships/${starshipId}/native-api-keys`, {
        toolName: selectedTool,
        apiKey: tempApiKey,
        config: tempConfigs,
      })

      setApiKeys(prev => ({
        ...prev,
        [selectedTool]: tempApiKey,
      }))

      setToolConfigs(prev => ({
        ...prev,
        [selectedTool]: tempConfigs,
      }))

      setMessage({ type: 'success', text: 'Configuration saved successfully!' })

      setTimeout(() => {
        closeModal()
      }, 1500)
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save configuration' })
      console.error('Error saving API key:', error)
    } finally {
      setDeleting(false)
    }
  }

  const deleteApiKey = async () => {
    if (!selectedTool) return

    setDeleting(true)
    setMessage(null)

    try {
      await api.delete(`/api/starships/${starshipId}/native-api-keys/${selectedTool}`)

      setApiKeys(prev => ({
        ...prev,
        [selectedTool]: '',
      }))

      setToolConfigs(prev => ({
        ...prev,
        [selectedTool]: {},
      }))

      setMessage({ type: 'success', text: 'API key deleted successfully!' })

      setTimeout(() => {
        closeModal()
      }, 1500)
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to delete API key' })
      console.error('Error deleting API key:', error)
    } finally {
      setDeleting(false)
    }
  }

  const getSelectedTool = () => NATIVE_TOOLS.find(t => t.name === selectedTool)

  const getConfiguredTools = () => {
    return NATIVE_TOOLS.filter(tool => apiKeys[tool.name] && apiKeys[tool.name].length > 0)
  }

  return (
    <>
      <div className="space-y-6">
        {/* Enhanced Header matching Agents component */}
        <div className="p-6 bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20 rounded-lg space-y-6">
          <div className="flex items-center gap-4">
            <span className="bg-primary/20 p-3 rounded-lg shadow-sm flex-shrink-0">
              <Zap className="h-6 w-6 text-primary" />
            </span>
            <div className="flex-1 min-w-0 space-y-1">
              <h3 className="text-xl font-bold text-foreground">Tools</h3>
              <p className="text-sm text-muted-foreground">
                Add external capabilities to your agents
              </p>
            </div>
          </div>

          {/* Browse Tools Button */}
          <div className="flex justify-start">
            <Button
              onClick={() => setIsModalOpen(true)}
              size="sm"
              className="h-9 whitespace-nowrap bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm transition-colors border-0"
            >
              <Settings className="w-4 h-4 mr-2 flex-shrink-0" />
              <span>Browse Tools</span>
            </Button>
          </div>
        </div>

        {/* Configured Tools List */}
        {getConfiguredTools().length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <div className="h-px bg-gradient-to-r from-primary/50 to-transparent flex-1"></div>
              <h4 className="text-sm font-semibold text-primary uppercase tracking-wide">
                CONFIGURED TOOLS
              </h4>
              <div className="h-px bg-gradient-to-l from-primary/50 to-transparent flex-1"></div>
            </div>
            <div className="grid gap-2">
              {getConfiguredTools().map(tool => (
                <div
                  key={tool.name}
                  className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-card/50 hover:bg-card/70 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{tool.icon}</span>
                    <div>
                      <p className="font-medium text-sm">{tool.displayName}</p>
                      <p className="text-xs text-muted-foreground">{tool.pricing}</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openConfigModal(tool.name)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Security Alert */}
        <div className="flex items-center gap-2 p-3 rounded-lg border border-green-500/20 bg-green-500/5">
          <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-500 flex-shrink-0" />
          <p className="text-xs text-green-700 dark:text-green-400">
            Your API keys are encrypted and stored securely.
          </p>
        </div>
      </div>

      {/* Configuration Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[550px] bg-background/95 backdrop-blur-xl border-border/50">
          {!selectedTool ? (
            /* Tool Selection View */
            <>
              <DialogHeader className="space-y-3">
                <DialogTitle className="flex items-center gap-2 text-xl">
                  <Settings className="h-5 w-5" />
                  Select a Tool to Configure
                </DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  Choose from available native tool integrations
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-3 py-4">
                {NATIVE_TOOLS.map(tool => (
                  <button
                    key={tool.name}
                    onClick={() => openConfigModal(tool.name)}
                    className="flex items-center justify-between p-4 rounded-lg border border-border/50 bg-card/30 hover:bg-card/50 hover:border-primary/50 transition-all text-left group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-xl group-hover:bg-primary/20 transition-colors">
                        {tool.icon}
                      </div>
                      <div>
                        <p className="font-medium">{tool.displayName}</p>
                        <p className="text-xs text-muted-foreground">{tool.pricing}</p>
                      </div>
                    </div>
                    {apiKeys[tool.name] ? (
                      <Badge
                        variant="outline"
                        className="text-xs border-green-500/30 bg-green-500/5 text-green-600 dark:text-green-400"
                      >
                        <Check className="mr-1 h-3 w-3" />
                        Configured
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">
                        Not configured
                      </Badge>
                    )}
                  </button>
                ))}
              </div>
            </>
          ) : getSelectedTool() ? (
            /* Tool Configuration View */
            <>
              <DialogHeader className="space-y-3">
                <DialogTitle className="flex items-center gap-3 text-xl">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-2xl">
                    {getSelectedTool()!.icon}
                  </div>
                  <span>Configure {getSelectedTool()!.displayName}</span>
                </DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  {getSelectedTool()!.description}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-5 py-6">
                {message && (
                  <Alert
                    className={`${message.type === 'success' ? 'border-green-500/30 bg-green-500/5 text-green-600 dark:text-green-400' : 'border-red-500/30 bg-red-500/5 text-red-600 dark:text-red-400'}`}
                  >
                    <AlertDescription className="text-sm font-medium">
                      {message.text}
                    </AlertDescription>
                  </Alert>
                )}

                {/* Pricing Card */}
                <div className="rounded-lg border border-border/50 bg-card/30 p-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Pricing</p>
                      <p className="flex items-center gap-2 text-sm text-muted-foreground">
                        <DollarSign className="h-3.5 w-3.5" />
                        {getSelectedTool()!.pricing}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 border-border/50 hover:bg-primary/10 hover:border-primary/50"
                      asChild
                    >
                      <a
                        href={getSelectedTool()!.signupUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Get API Key
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  </div>
                </div>

                {/* API Key Input Section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="api-key"
                      className="text-sm font-semibold flex items-center gap-2"
                    >
                      <Key className="h-3.5 w-3.5 text-muted-foreground" />
                      API Key
                    </Label>
                    {tempApiKey && (
                      <Badge
                        variant="outline"
                        className="text-xs border-green-500/30 bg-green-500/5 text-green-600 dark:text-green-400"
                      >
                        <Check className="mr-1 h-3 w-3" />
                        Configured
                      </Badge>
                    )}
                  </div>
                  <div className="relative">
                    <Input
                      id="api-key"
                      type={showKey ? 'text' : 'password'}
                      placeholder={getSelectedTool()!.apiKeyPlaceholder}
                      value={tempApiKey}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setTempApiKey(e.target.value)
                      }
                      className="pr-10 bg-background/50 border-border/50 font-mono text-sm focus:border-primary/50"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-1 top-1 h-7 w-7 p-0 hover:bg-transparent"
                      onClick={() => setShowKey(!showKey)}
                    >
                      {showKey ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                  {getSelectedTool()!.helpText && (
                    <div className="flex gap-2 rounded-md bg-yellow-500/5 border border-yellow-500/20 p-2.5">
                      <Info className="h-3.5 w-3.5 text-yellow-600 dark:text-yellow-500 mt-0.5 shrink-0" />
                      <p className="text-xs text-yellow-700 dark:text-yellow-400">
                        {getSelectedTool()!.helpText}
                      </p>
                    </div>
                  )}
                </div>

                {/* Additional Config Fields */}
                {getSelectedTool()!.configFields?.map(field => (
                  <div key={field.name} className="space-y-3">
                    <Label
                      htmlFor={field.name}
                      className="text-sm font-semibold flex items-center gap-2"
                    >
                      <Settings className="h-3.5 w-3.5 text-muted-foreground" />
                      {field.label}
                    </Label>
                    <Input
                      id={field.name}
                      type={field.type}
                      placeholder={field.placeholder}
                      value={tempConfigs[field.name] || ''}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setTempConfigs(prev => ({
                          ...prev,
                          [field.name]: e.target.value,
                        }))
                      }
                      className="bg-background/50 border-border/50 text-sm focus:border-primary/50"
                    />
                    <p className="text-xs text-muted-foreground pl-5">{field.description}</p>
                  </div>
                ))}

                {/* Security Note */}
                <div className="rounded-lg border border-border/30 bg-card/20 p-3.5">
                  <div className="flex gap-3">
                    <Shield className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Your API key will be encrypted and stored securely. It will only be used by
                      your agents to make API calls on your behalf.
                    </p>
                  </div>
                </div>
              </div>

              <DialogFooter className="flex items-center justify-between sm:justify-between">
                <div>
                  {apiKeys[selectedTool] && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={deleteApiKey}
                      disabled={deleting}
                      className="text-red-600 hover:text-red-700 hover:bg-red-500/10"
                    >
                      {deleting ? (
                        <span className="flex items-center gap-2">
                          <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          Deleting...
                        </span>
                      ) : (
                        <>
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete Key
                        </>
                      )}
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={closeModal}
                    disabled={deleting}
                    className="border-border/50"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={saveApiKey}
                    disabled={!tempApiKey || deleting}
                    className="bg-primary hover:bg-primary/90"
                  >
                    {deleting ? (
                      <span className="flex items-center gap-2">
                        <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        Saving...
                      </span>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Save Configuration
                      </>
                    )}
                  </Button>
                </div>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
