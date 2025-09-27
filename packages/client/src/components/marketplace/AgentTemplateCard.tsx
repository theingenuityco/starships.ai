'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useCreateAgentFromTemplate } from '@/hooks/useTemplates'
import { useUserStarships } from '@/hooks/useStarships'
import { useAuth } from '@/hooks/useAuth'
import { Bot, Code, Lightbulb, BarChart2, HeartPulse, Users, Sparkles } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import type { AgentTemplateModel } from '@starships/protocol'

interface AgentTemplateCardProps {
  template: AgentTemplateModel
  onDeploy?: (template: AgentTemplateModel) => void
}

export function AgentTemplateCard({ template, onDeploy }: AgentTemplateCardProps) {
  const [isDeploying, setIsDeploying] = useState(false)

  // Get current user and their starships for deployment
  const { userId } = useAuth()
  const { data: starships = [] } = useUserStarships(userId || '', !!userId)
  const primaryStarship = starships[0] // Use first starship by default

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

  const handleDeploy = async () => {
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
    } catch (error) {
      // Error handling is done in the mutation hook
    } finally {
      setIsDeploying(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} whileHover={{ y: -2 }} transition={{ duration: 0.2 }}>
      <Card className="p-6 cursor-pointer transition-all duration-300 hover:shadow-xl hover:border-primary/50 group">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
            <div className="text-2xl">{template.icon || '🤖'}</div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-semibold text-lg truncate group-hover:text-primary transition-colors">{template.name}</h3>
              <Badge className={`text-xs ${getCategoryColor(template.category)} flex items-center gap-1 border font-medium`}>
                {getCategoryIcon(template.category)}
                {template.category}
              </Badge>
            </div>

            <p className="text-sm text-muted-foreground mb-3 line-clamp-2 leading-relaxed">{template.description}</p>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Users className="w-4 h-4" />
                  <span>{template.usageCount} uses</span>
                </div>
                <div className="flex items-center gap-1">
                  <Bot className="w-4 h-4" />
                  <span className="font-mono text-xs">{template.model}</span>
                </div>
              </div>

              <Button
                size="sm"
                variant="outline"
                className="group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
                onClick={handleDeploy}
                disabled={isDeploying || !primaryStarship}
              >
                <Sparkles className="w-4 h-4 mr-2" />
                {isDeploying ? 'Deploying...' : 'Deploy'}
              </Button>
            </div>

            {template.previewPrompts && template.previewPrompts.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border/50">
                <p className="text-xs text-muted-foreground mb-2">Try asking:</p>
                <div className="flex flex-wrap gap-1">
                  {template.previewPrompts.slice(0, 2).map((prompt, idx) => (
                    <Badge key={idx} variant="outline" className="text-xs bg-muted/30 border-muted-foreground/20 hover:bg-muted/50 transition-colors cursor-pointer">
                      "{prompt.length > 30 ? `${prompt.slice(0, 30)}...` : prompt}"
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>
    </motion.div>
  )
}
