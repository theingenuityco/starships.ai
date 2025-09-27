'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useCreateToolFromTemplate } from '@/hooks/useTemplates'
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

  // Installation mutation (placeholder for now since tool creation isn't implemented yet)
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
    setIsInstalling(true)
    try {
      // TODO: Implement tool installation when backend is ready
      // await createToolMutation.mutateAsync({
      //   templateId: template.id,
      //   starshipId: primaryStarship.id,
      // })
      onInstall?.(template)
    } catch (error) {
      // Error handling is done in the mutation hook
    } finally {
      setIsInstalling(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} whileHover={{ y: -2 }} transition={{ duration: 0.2 }}>
      <Card className="p-6 cursor-pointer transition-all duration-300 hover:shadow-xl hover:border-primary/50 group">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
            <Wrench className="w-6 h-6 text-primary" />
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
                {template.requiresApiKey && (
                  <div className="flex items-center gap-1">
                    <Star className="w-4 h-4 text-yellow-500" />
                    <span className="text-xs">API Key Required</span>
                  </div>
                )}
              </div>

              <Button size="sm" variant="outline" className="group-hover:bg-primary group-hover:text-primary-foreground transition-colors" onClick={handleInstall} disabled={isInstalling}>
                <Sparkles className="w-4 h-4 mr-2" />
                {isInstalling ? 'Installing...' : 'Install'}
              </Button>
            </div>

            {template.exampleUsage && (
              <div className="mt-3 pt-3 border-t border-border/50">
                <p className="text-xs text-muted-foreground mb-1">Example usage:</p>
                <code className="text-xs bg-muted/30 px-2 py-1 rounded font-mono">{template.exampleUsage.length > 50 ? `${template.exampleUsage.slice(0, 50)}...` : template.exampleUsage}</code>
              </div>
            )}

            {template.configurationFields && template.configurationFields.length > 0 && (
              <div className="mt-2">
                <p className="text-xs text-muted-foreground mb-1">Configuration required:</p>
                <div className="flex flex-wrap gap-1">
                  {template.configurationFields.slice(0, 3).map((field, idx) => (
                    <Badge key={idx} variant="outline" className="text-xs">
                      {field.name}
                    </Badge>
                  ))}
                  {template.configurationFields.length > 3 && (
                    <Badge variant="outline" className="text-xs">
                      +{template.configurationFields.length - 3} more
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>
    </motion.div>
  )
}
