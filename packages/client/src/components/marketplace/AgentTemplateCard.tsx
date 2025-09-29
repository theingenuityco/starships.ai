'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useCreateAgentFromTemplate } from '@/hooks/useTemplates'
import { useUserStarships } from '@/hooks/useStarships'
import { useStarshipAgents } from '@/hooks/useAgents'
import { useAuth } from '@/hooks/useAuth'
import { DeploymentConfirmationModal } from './DeploymentConfirmationModal'
import { Bot, Code, Lightbulb, BarChart2, HeartPulse, Sparkles, Download, CheckCircle } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import type { AgentTemplateModel } from '@starships/protocol'

interface AgentTemplateCardProps {
  template: AgentTemplateModel
  onDeploy?: (template: AgentTemplateModel) => void
  onClick?: (template: AgentTemplateModel) => void
}

export function AgentTemplateCard({ template, onDeploy, onClick }: AgentTemplateCardProps) {
  const [isDeploying, setIsDeploying] = useState(false)
  const [showConfirmationModal, setShowConfirmationModal] = useState(false)

  // Get current user and their starships for deployment
  const { userId } = useAuth()
  const { data: starships = [] } = useUserStarships(userId || '', !!userId)
  const primaryStarship = starships[0] // Use first starship by default

  // Get deployed agents to check if this template is already deployed
  const { data: deployedAgents = [] } = useStarshipAgents(primaryStarship?.id || '', !!primaryStarship)
  // Note: We use name matching since agents don't store templateId
  const isAlreadyDeployed = deployedAgents.some(agent => agent.name === template.name)

  // Deployment mutation
  const createAgentMutation = useCreateAgentFromTemplate()

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'coding':
        return <Code className="w-4 h-4" />
      case 'creative':
        return <Lightbulb className="w-4 h-4" />
      case 'analysis':
        return <BarChart2 className="w-4 h-4" />
      case 'support':
        return <HeartPulse className="w-4 h-4" />
      default:
        return <Bot className="w-4 h-4" />
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

  const handleDeployClick = (e: React.MouseEvent) => {
    e.stopPropagation() // Prevent card click from triggering
    if (!primaryStarship) {
      return // No starship to deploy to
    }
    setShowConfirmationModal(true)
  }

  const handleCardClick = () => {
    onClick?.(template)
  }

  const handleConfirmDeploy = async () => {
    if (!primaryStarship) {
      return // No starship to deploy to
    }

    setIsDeploying(true)
    try {
      await createAgentMutation.mutateAsync({
        templateId: template.id,
        starshipId: primaryStarship.id,
      })
      onDeploy?.(template)
    } catch {
      // Error handling is done in the mutation hook
    } finally {
      setIsDeploying(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} whileHover={{ y: -2 }} transition={{ duration: 0.2 }}>
      <Card
        className="h-full min-h-[320px] max-h-[380px] p-6 cursor-pointer transition-all duration-300 frosted-glass-card shadow-frosted-lg hover:shadow-frosted-xl group flex flex-col hover:bg-primary/5"
        onClick={handleCardClick}
      >
        {/* Header */}
        <div className="flex items-start gap-4 mb-4">
          <div className="flex-shrink-0 p-3 rounded-lg bg-primary/20 group-hover:bg-primary/30 transition-colors">
            <div className="text-2xl">{template.icon || '🤖'}</div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2 mb-2">
              <h3 className="font-semibold text-lg leading-tight group-hover:text-primary transition-colors line-clamp-2">{template.name}</h3>
            </div>
            <Badge className={`text-xs ${getCategoryColor(template.category)} flex items-center gap-1 border font-medium w-fit`}>
              {getCategoryIcon(template.category)}
              {template.category}
            </Badge>
          </div>
        </div>

        {/* Description */}
        <div className="flex-1">
          <p className="text-sm text-muted-foreground mb-4 line-clamp-3 leading-relaxed">{template.description}</p>
        </div>

        {/* Stats */}
        <div className="flex items-center justify-between mb-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <Bot className="w-4 h-4 flex-shrink-0" />
            <span className="font-mono text-xs truncate">{template.model}</span>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Download className="w-4 h-4" />
            <span>{template.usageCount}</span>
          </div>
        </div>

        {/* Preview Prompts */}
        {template.previewPrompts && template.previewPrompts.length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-muted-foreground mb-2">Try asking:</p>
            <div className="space-y-1">
              {template.previewPrompts.slice(0, 2).map((prompt, idx) => (
                <div key={idx} className="text-xs bg-muted/30 px-2 py-1 rounded border border-muted-foreground/20 truncate">
                  &quot;{prompt.length > 40 ? `${prompt.slice(0, 40)}...` : prompt}&quot;
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Button */}
        <div className="mt-auto">
          {isAlreadyDeployed ? (
            <Button size="sm" variant="outline" className="w-full transition-colors" disabled onClick={e => e.stopPropagation()}>
              <CheckCircle className="w-4 h-4 mr-2" />
              <span className="truncate">Already deployed on {primaryStarship?.name || 'starship'}</span>
            </Button>
          ) : (
            <Button size="sm" variant="default" className="w-full transition-colors" onClick={handleDeployClick} disabled={isDeploying || !primaryStarship}>
              <Sparkles className="w-4 h-4 mr-2" />
              {isDeploying ? 'Deploying...' : 'Deploy'}
            </Button>
          )}
        </div>

        {/* Confirmation Modal */}
        <DeploymentConfirmationModal
          isOpen={showConfirmationModal}
          onOpenChange={setShowConfirmationModal}
          onConfirm={handleConfirmDeploy}
          isProcessing={isDeploying}
          type="agent"
          template={template}
          starshipName={primaryStarship?.name || 'Unknown Starship'}
        />
      </Card>
    </motion.div>
  )
}
