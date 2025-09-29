'use client'

import React from 'react'
import type { ToolTemplateModel } from '@starships/protocol'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useCreateToolFromTemplate } from '@/hooks/useTemplates'
import { useUserStarships } from '@/hooks/useStarships'
import { useAuth } from '@/hooks/useAuth'
import { DeploymentConfirmationModal } from './DeploymentConfirmationModal'
import { BlueprintVisualization } from './BlueprintVisualization'
import { Wrench, Package, Bot, BarChart2, Users, Download, CheckCircle, Sparkles, Star, Calendar, Settings, Copy, Code, Key, GitBranch } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { format } from 'date-fns'
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import type { FetchResponse } from '@/lib/types'
import type { ApiResponse } from '@starships/protocol'

interface ToolDetailsDrawerProps {
  template: ToolTemplateModel | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onInstall?: (template: ToolTemplateModel) => void
}

export function ToolDetailsDrawer({ template, open, onOpenChange, onInstall }: ToolDetailsDrawerProps) {
  const [showConfirmationModal, setShowConfirmationModal] = useState(false)
  const [isInstalling, setIsInstalling] = useState(false)

  // Get current user and their starships for installation
  const { userId } = useAuth()
  const { data: starships = [] } = useUserStarships(userId || '', !!userId)
  const primaryStarship = starships[0] // Use first starship by default

  // Get deployed tools to check if this template is already installed
  const { data: deployedTools = [] } = useQuery({
    queryKey: ['starship-tools', primaryStarship?.id],
    queryFn: async () => {
      if (!primaryStarship?.id) return []
      try {
        const response: FetchResponse<ApiResponse<unknown[]>> = await api.get(`/api/v1/starships/${primaryStarship.id}/tools`)
        return response.data.data || []
      } catch (error) {
        console.warn('Failed to fetch starship tools:', error)
        return []
      }
    },
    enabled: !!primaryStarship?.id,
    staleTime: 30 * 1000,
  })

  const isAlreadyInstalled = template
    ? deployedTools.some((tool: unknown) => (tool as { slug?: string; name?: string }).slug === template.slug || (tool as { slug?: string; name?: string }).name === template.name)
    : false

  // Installation mutation
  const createToolMutation = useCreateToolFromTemplate()

  if (!template) return null

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'integration':
        return <Package className="w-5 h-5" />
      case 'automation':
        return <Bot className="w-5 h-5" />
      case 'data':
        return <BarChart2 className="w-5 h-5" />
      case 'communication':
        return <Users className="w-5 h-5" />
      default:
        return <Wrench className="w-5 h-5" />
    }
  }

  const getCategoryColor = (category: string) => {
    const colors = {
      general: 'bg-gradient-to-r from-gray-500/10 to-gray-500/20 text-gray-700 dark:text-gray-300 border-gray-500/30',
      integration: 'bg-gradient-to-r from-blue-500/10 to-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/30',
      automation: 'bg-gradient-to-r from-green-500/10 to-green-500/20 text-green-700 dark:text-green-300 border-green-500/30',
      data: 'bg-gradient-to-r from-purple-500/10 to-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-500/30',
      communication: 'bg-gradient-to-r from-orange-500/10 to-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-500/30',
    }
    return colors[category as keyof typeof colors] || colors.general
  }

  const handleInstallClick = () => {
    if (!primaryStarship) return
    setShowConfirmationModal(true)
  }

  const handleConfirmInstall = async () => {
    if (!primaryStarship || !template) return

    setIsInstalling(true)
    try {
      await createToolMutation.mutateAsync({
        templateSlug: template.slug,
        starshipId: primaryStarship.id,
        configuration: {},
      })
      onInstall?.(template)
      onOpenChange(false) // Close drawer after successful installation
    } catch {
      // Error handling is done in the mutation hook
    } finally {
      setIsInstalling(false)
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-2xl">
          <ScrollArea className="h-full -mx-6 -mt-6 -mb-6">
            <div className="p-6">
              <SheetHeader className="space-y-4">
                {/* Main Header with Icon and Title */}
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 p-4 rounded-xl bg-primary/20 group-hover:bg-primary/30 transition-colors">
                    <Wrench className="w-8 h-8 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <SheetTitle className="text-2xl font-bold text-left mb-2">{template.name}</SheetTitle>
                    <div className="flex items-center gap-2 mb-3">
                      <Badge className={`text-sm ${getCategoryColor(template.category)} flex items-center gap-2 border font-medium`}>
                        {getCategoryIcon(template.category)}
                        {template.category}
                      </Badge>
                      {template.requiresApiKey && (
                        <div className="flex items-center gap-2 bg-yellow-500/10 px-3 py-1 rounded-lg border border-yellow-500/30">
                          <Key className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                          <span className="text-sm text-yellow-700 dark:text-yellow-300 font-medium">API Key Required</span>
                        </div>
                      )}
                    </div>
                    {template.description && <SheetDescription className="text-left text-base leading-relaxed">{template.description}</SheetDescription>}
                  </div>
                </div>
              </SheetHeader>

              <Separator className="my-6" />

              {/* Stats Section */}
              <div className="space-y-6">
                <Card className="p-4 frosted-glass-card">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <BarChart2 className="w-5 h-5 text-primary" />
                    Usage Statistics
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Download className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Installations</p>
                        <p className="text-xl font-bold">{template.usageCount}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-green-500/10">
                        <Star className="w-4 h-4 text-green-600 dark:text-green-400" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Rating</p>
                        <p className="text-xl font-bold">4.6</p>
                      </div>
                    </div>
                  </div>
                </Card>

                {/* Example Usage */}
                {template.exampleUsage && (
                  <Card className="p-4 frosted-glass-card">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <Code className="w-5 h-5 text-primary" />
                      Example Usage
                    </h3>
                    <div className="space-y-3">
                      <div className="relative">
                        <div className="p-4 rounded-lg bg-muted/20 border border-muted-foreground/20 font-mono text-sm leading-relaxed">
                          <pre className="whitespace-pre-wrap text-foreground/90">{template.exampleUsage}</pre>
                        </div>
                        <Button size="sm" variant="ghost" className="absolute top-2 right-2 h-8 w-8 p-0" onClick={() => navigator.clipboard?.writeText(template.exampleUsage || '')}>
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                )}

                {/* Configuration Fields */}
                {template.configurationFields && template.configurationFields.length > 0 && (
                  <Card className="p-4 frosted-glass-card">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <Settings className="w-5 h-5 text-primary" />
                      Configuration Fields
                    </h3>
                    <div className="space-y-3">
                      {template.configurationFields.map((field, idx) => (
                        <motion.div
                          key={idx}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.1 }}
                          className="p-3 rounded-lg bg-muted/30 border border-muted-foreground/20"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{field.name}</span>
                              {field.required && (
                                <Badge variant="outline" className="text-xs text-red-600 dark:text-red-400 border-red-500/30">
                                  Required
                                </Badge>
                              )}
                            </div>
                            <Badge variant="outline" className="text-xs font-mono">
                              {field.type}
                            </Badge>
                          </div>
                          {field.description && <p className="text-sm text-muted-foreground leading-relaxed">{field.description}</p>}
                        </motion.div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Blueprint Visualization */}
                {template.blueprint && template.blueprint.nodes && template.blueprint.nodes.length > 0 && (
                  <Card className="p-4 frosted-glass-card">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <GitBranch className="w-5 h-5 text-primary" />
                      Blueprint Workflow
                    </h3>
                    <BlueprintVisualization blueprint={template.blueprint} className="h-[500px]" />
                  </Card>
                )}

                {/* Installation Section */}
                <Card className="p-4 frosted-glass-card">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-primary" />
                    Installation
                  </h3>

                  {primaryStarship ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/20 border border-muted-foreground/20">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <Users className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Install to</p>
                          <p className="font-medium">{primaryStarship.name}</p>
                        </div>
                      </div>

                      {template.requiresApiKey && (
                        <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                          <div className="flex items-start gap-2">
                            <Key className="w-4 h-4 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                            <div className="text-sm">
                              <p className="text-yellow-700 dark:text-yellow-300 font-medium">API Key Required</p>
                              <p className="text-yellow-600 dark:text-yellow-400 text-xs mt-1">You&apos;ll need to configure API credentials after installation.</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {isAlreadyInstalled ? (
                        <Button size="lg" variant="outline" className="w-full" disabled>
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Already Installed
                        </Button>
                      ) : (
                        <Button size="lg" className="w-full transition-colors" onClick={handleInstallClick} disabled={isInstalling}>
                          <Sparkles className="w-4 h-4 mr-2" />
                          {isInstalling ? 'Installing...' : 'Install Tool'}
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p className="text-sm">No starship available for installation</p>
                    </div>
                  )}
                </Card>

                {/* Metadata */}
                <Card className="p-4 frosted-glass-card">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-primary" />
                    Details
                  </h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Template ID</span>
                      <span className="font-mono text-xs">{template.id}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Slug</span>
                      <span className="font-mono text-xs">{template.slug}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Created</span>
                      <span>{format(new Date(template.createdAt), 'MMM d, yyyy')}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Last Updated</span>
                      <span>{format(new Date(template.updatedAt), 'MMM d, yyyy')}</span>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Installation Confirmation Modal */}
      <DeploymentConfirmationModal
        isOpen={showConfirmationModal}
        onOpenChange={setShowConfirmationModal}
        onConfirm={handleConfirmInstall}
        isProcessing={isInstalling}
        type="tool"
        template={template}
        starshipName={primaryStarship?.name || 'Unknown Starship'}
      />
    </>
  )
}
