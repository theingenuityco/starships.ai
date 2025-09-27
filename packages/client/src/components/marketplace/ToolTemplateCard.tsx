'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useCreateToolFromTemplate } from '@/hooks/useTemplates'
import { useUserStarships } from '@/hooks/useStarships'
import { useAuth } from '@/hooks/useAuth'
import { Wrench, Users, Star, Sparkles, Package, Bot, BarChart2 } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import type { ToolTemplateModel } from '@starships/protocol'

interface ToolTemplateCardProps {
  template: ToolTemplateModel
  onInstall?: (template: ToolTemplateModel) => void
}

export function ToolTemplateCard({ template, onInstall }: ToolTemplateCardProps) {
  const [isInstalling, setIsInstalling] = useState(false)

  // Get current user and their starships for installation
  const { userId } = useAuth()
  const { data: starships = [] } = useUserStarships(userId || '', !!userId)
  const primaryStarship = starships[0] // Use first starship by default

  // Installation mutation
  const createToolMutation = useCreateToolFromTemplate()

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'integration':
        return <Package className="w-4 h-4" />
      case 'automation':
        return <Bot className="w-4 h-4" />
      case 'data':
        return <BarChart2 className="w-4 h-4" />
      case 'communication':
        return <Users className="w-4 h-4" />
      default:
        return <Wrench className="w-4 h-4" />
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

  const handleInstall = async () => {
    if (!primaryStarship) {
      return // No starship to install to
    }

    setIsInstalling(true)
    try {
      await createToolMutation.mutateAsync({
        templateSlug: template.slug,
        starshipId: primaryStarship.id,
        configuration: {},
      })
      onInstall?.(template)
    } catch (error) {
      // Error handling is done in the mutation hook
    } finally {
      setIsInstalling(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} whileHover={{ y: -2 }} transition={{ duration: 0.2 }}>
      <Card className="h-full min-h-[320px] max-h-[380px] p-6 cursor-pointer transition-all duration-300 frosted-glass-card shadow-frosted-lg hover:shadow-frosted-xl hover:border-primary/50 group flex flex-col">
        {/* Header */}
        <div className="flex items-start gap-4 mb-4">
          <div className="flex-shrink-0 p-3 rounded-lg bg-primary/20 group-hover:bg-primary/30 transition-colors">
            <Wrench className="w-6 h-6 text-primary" />
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

        {/* Stats and Requirements */}
        <div className="flex items-center justify-between mb-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Users className="w-4 h-4" />
              <span>{template.usageCount}</span>
            </div>
            {template.requiresApiKey && (
              <div className="flex items-center gap-1">
                <Star className="w-4 h-4 text-yellow-500" />
                <span className="text-xs">API Key</span>
              </div>
            )}
          </div>
        </div>

        {/* Example Usage or Configuration */}
        {(template.exampleUsage || (template.configurationFields && template.configurationFields.length > 0)) && (
          <div className="mb-4">
            {template.exampleUsage && (
              <div className="mb-2">
                <p className="text-xs text-muted-foreground mb-1">Example:</p>
                <code className="text-xs bg-muted/30 px-2 py-1 rounded font-mono block truncate">
                  {template.exampleUsage.length > 45 ? `${template.exampleUsage.slice(0, 45)}...` : template.exampleUsage}
                </code>
              </div>
            )}

            {template.configurationFields && template.configurationFields.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Config fields:</p>
                <div className="flex flex-wrap gap-1">
                  {template.configurationFields.slice(0, 2).map((field, idx) => (
                    <Badge key={idx} variant="outline" className="text-xs">
                      {field.name}
                    </Badge>
                  ))}
                  {template.configurationFields.length > 2 && (
                    <Badge variant="outline" className="text-xs">
                      +{template.configurationFields.length - 2}
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Action Button */}
        <div className="mt-auto">
          <Button
            size="sm"
            variant="outline"
            className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
            onClick={handleInstall}
            disabled={isInstalling || !primaryStarship}
          >
            <Sparkles className="w-4 h-4 mr-2" />
            {isInstalling ? 'Installing...' : 'Install'}
          </Button>
        </div>
      </Card>
    </motion.div>
  )
}
