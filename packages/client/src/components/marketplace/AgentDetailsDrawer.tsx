'use client'

import React from 'react'
import type { AgentTemplateModel } from '@starships/protocol'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useCreateAgentFromTemplate } from '@/hooks/useTemplates'
import { useUserStarships } from '@/hooks/useStarships'
import { useStarshipAgents } from '@/hooks/useAgents'
import { useAuth } from '@/hooks/useAuth'
import { DeploymentConfirmationModal } from './DeploymentConfirmationModal'
import { BlueprintVisualization } from './BlueprintVisualization'
import { Bot, Code, Lightbulb, BarChart2, HeartPulse, Sparkles, Download, CheckCircle, Brain, MessageSquare, Star, Users, Calendar, Zap, X, FileText, Settings, GitBranch, Copy } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { format } from 'date-fns'

interface AgentDetailsDrawerProps {
  template: AgentTemplateModel | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeploy?: (template: AgentTemplateModel) => void
}

export function AgentDetailsDrawer({ template, open, onOpenChange, onDeploy }: AgentDetailsDrawerProps) {
  const [showConfirmationModal, setShowConfirmationModal] = useState(false)
  const [isDeploying, setIsDeploying] = useState(false)

  // Get current user and their starships for deployment
  const { userId } = useAuth()
  const { data: starships = [] } = useUserStarships(userId || '', !!userId)
  const primaryStarship = starships[0] // Use first starship by default

  // Get deployed agents to check if this template is already deployed
  const { data: deployedAgents = [] } = useStarshipAgents(primaryStarship?.id || '', !!primaryStarship)
  const isAlreadyDeployed = template ? deployedAgents.some(agent => agent.name === template.name) : false

  // Deployment mutation
  const createAgentMutation = useCreateAgentFromTemplate()

  if (!template) return null

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'coding':
        return <Code className="w-5 h-5" />
      case 'creative':
        return <Lightbulb className="w-5 h-5" />
      case 'analysis':
        return <BarChart2 className="w-5 h-5" />
      case 'support':
        return <HeartPulse className="w-5 h-5" />
      default:
        return <Bot className="w-5 h-5" />
    }
  }

  const getCategoryColor = (category: string) => {
    const colors = {
      general: 'bg-gradient-to-r from-gray-500/10 to-gray-500/20 text-gray-700 dark:text-gray-300 border-gray-500/30',
      coding: 'bg-gradient-to-r from-blue-500/10 to-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/30',
      creative: 'bg-gradient-to-r from-purple-500/10 to-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-500/30',
      analysis: 'bg-gradient-to-r from-green-500/10 to-green-500/20 text-green-700 dark:text-green-300 border-green-500/30',
      support: 'bg-gradient-to-r from-orange-500/10 to-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-500/30',
    }
    return colors[category as keyof typeof colors] || colors.general
  }

  const handleDeployClick = () => {
    if (!primaryStarship) return
    setShowConfirmationModal(true)
  }

  const handleConfirmDeploy = async () => {
    if (!primaryStarship || !template) return

    setIsDeploying(true)
    try {
      await createAgentMutation.mutateAsync({
        templateId: template.id,
        starshipId: primaryStarship.id,
      })
      onDeploy?.(template)
      onOpenChange(false) // Close drawer after successful deployment
    } catch {
      // Error handling is done in the mutation hook
    } finally {
      setIsDeploying(false)
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
                    <div className="text-3xl">{template.icon || '🤖'}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <SheetTitle className="text-2xl font-bold text-left mb-2">{template.name}</SheetTitle>
                    <div className="flex items-center gap-2 mb-3">
                      <Badge className={`text-sm ${getCategoryColor(template.category)} flex items-center gap-2 border font-medium`}>
                        {getCategoryIcon(template.category)}
                        {template.category}
                      </Badge>
                      <div className="flex items-center gap-2 bg-muted/50 px-3 py-1 rounded-lg">
                        <Brain className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground font-mono">{template.model}</span>
                      </div>
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
                        <p className="text-sm text-muted-foreground">Deployments</p>
                        <p className="text-xl font-bold">{template.usageCount}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-green-500/10">
                        <Star className="w-4 h-4 text-green-600 dark:text-green-400" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Rating</p>
                        <p className="text-xl font-bold">4.8</p>
                      </div>
                    </div>
                  </div>
                </Card>

                {/* System Prompt */}
                {template.systemPrompt && (
                  <Card className="p-4 frosted-glass-card">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <Settings className="w-5 h-5 text-primary" />
                      System Prompt
                    </h3>
                    <div className="space-y-3">
                      <div className="relative">
                        <div className="p-4 rounded-lg bg-muted/20 border border-muted-foreground/20 font-mono text-sm leading-relaxed max-h-64 overflow-y-auto custom-scrollbar">
                          <pre className="whitespace-pre-wrap text-foreground/90">{template.systemPrompt}</pre>
                        </div>
                        <Button size="sm" variant="ghost" className="absolute top-2 right-2 h-8 w-8 p-0" onClick={() => navigator.clipboard?.writeText(template.systemPrompt || '')}>
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
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

                {/* Preview Prompts */}
                {template.previewPrompts && template.previewPrompts.length > 0 && (
                  <Card className="p-4 frosted-glass-card">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <MessageSquare className="w-5 h-5 text-primary" />
                      Try These Prompts
                    </h3>
                    <div className="space-y-3">
                      {template.previewPrompts.map((prompt, idx) => (
                        <motion.div
                          key={idx}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.1 }}
                          className="p-3 rounded-lg bg-muted/30 border border-muted-foreground/20 hover:bg-muted/50 transition-colors cursor-pointer group"
                        >
                          <div className="flex items-start gap-2">
                            <Zap className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                            <p className="text-sm leading-relaxed group-hover:text-foreground transition-colors">"{prompt}"</p>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Deployment Section */}
                <Card className="p-4 frosted-glass-card">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-primary" />
                    Deployment
                  </h3>

                  {primaryStarship ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/20 border border-muted-foreground/20">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <Users className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Deploy to</p>
                          <p className="font-medium">{primaryStarship.name}</p>
                        </div>
                      </div>

                      {isAlreadyDeployed ? (
                        <Button size="lg" variant="outline" className="w-full" disabled>
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Already Deployed
                        </Button>
                      ) : (
                        <Button size="lg" className="w-full transition-colors" onClick={handleDeployClick} disabled={isDeploying}>
                          <Sparkles className="w-4 h-4 mr-2" />
                          {isDeploying ? 'Deploying...' : 'Deploy Agent'}
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p className="text-sm">No starship available for deployment</p>
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

      {/* Deployment Confirmation Modal */}
      <DeploymentConfirmationModal
        isOpen={showConfirmationModal}
        onOpenChange={setShowConfirmationModal}
        onConfirm={handleConfirmDeploy}
        isProcessing={isDeploying}
        type="agent"
        template={template}
        starshipName={primaryStarship?.name || 'Unknown Starship'}
      />
    </>
  )
}
