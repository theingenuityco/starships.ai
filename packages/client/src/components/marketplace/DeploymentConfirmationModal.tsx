'use client'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Bot, Wrench, AlertTriangle, Sparkles } from 'lucide-react'
import type { AgentTemplateModel, ToolTemplateModel } from '@starships/protocol'

interface DeploymentConfirmationModalProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => Promise<void>
  isProcessing: boolean
  type: 'agent' | 'tool'
  template: AgentTemplateModel | ToolTemplateModel
  starshipName: string
}

export function DeploymentConfirmationModal({ isOpen, onOpenChange, onConfirm, isProcessing, type, template, starshipName }: DeploymentConfirmationModalProps) {
  const isAgent = type === 'agent'
  const actionText = isAgent ? 'deploy' : 'install'
  const ActionIcon = isAgent ? Bot : Wrench

  const handleConfirm = async () => {
    await onConfirm()
    onOpenChange(false)
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ActionIcon className="w-5 h-5 text-primary" />
            Confirm {isAgent ? 'Deployment' : 'Installation'}
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to {actionText} this {type} to your starship?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Template Info */}
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 p-2 rounded-lg bg-primary/20">
                <div className="text-lg">{isAgent ? (template as AgentTemplateModel).icon || '🤖' : '🔧'}</div>
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-sm">{template.name}</h4>
                <Badge variant="outline" className="text-xs mt-1">
                  {template.category}
                </Badge>
              </div>
            </div>
            <p className="text-sm text-muted-foreground line-clamp-2">{template.description}</p>
          </div>

          {/* Destination */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Destination:</span>
            <Badge variant="secondary" className="font-mono">
              {starshipName}
            </Badge>
          </div>

          {/* Additional Info */}
          {!isAgent && (template as ToolTemplateModel).requiresApiKey && (
            <div className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
              <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
              <span className="text-sm text-yellow-800 dark:text-yellow-200">This tool requires an API key to function properly.</span>
            </div>
          )}

          {isAgent && (template as AgentTemplateModel).model && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Model:</span>
              <Badge variant="outline" className="font-mono text-xs">
                {(template as AgentTemplateModel).model}
              </Badge>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isProcessing}>
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={isProcessing} className="min-w-[120px]">
            {isProcessing ? (
              <>
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                {isAgent ? 'Deploying...' : 'Installing...'}
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                {isAgent ? 'Deploy' : 'Install'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
