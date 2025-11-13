'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAgentUpdateCheck, useUpdateAgentFromTemplate } from '@/hooks/useAgentUpdate'
import Icon from '@/components/primitives/Icon'
import { useState } from 'react'

interface AgentUpdateBadgeProps {
  agentId: string
  agentName: string
}

export function AgentUpdateBadge({ agentId, agentName }: AgentUpdateBadgeProps) {
  const { data: updateCheck, isLoading } = useAgentUpdateCheck(agentId)
  const updateMutation = useUpdateAgentFromTemplate()
  const [showDialog, setShowDialog] = useState(false)

  // Don't show anything if loading or no update available
  if (isLoading || !updateCheck?.needsUpdate) {
    return null
  }

  const handleUpdate = () => {
    updateMutation.mutate(agentId, {
      onSuccess: () => {
        setShowDialog(false)
      },
    })
  }

  return (
    <>
      <Badge
        variant="default"
        className="cursor-pointer hover:opacity-80 bg-blue-600 hover:bg-blue-700 transition-all duration-200 flex items-center gap-1.5 shadow-md"
        onClick={e => {
          e.stopPropagation()
          setShowDialog(true)
        }}
      >
        <Icon name="arrow-up-circle" className="w-3.5 h-3.5" />
        Update to v{updateCheck.latestVersion}
      </Badge>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent onClick={e => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Update {agentName}</DialogTitle>
            <DialogDescription>A new version of this agent template is available.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground mb-1">Current Version:</p>
                <p className="font-mono font-semibold text-base">v{updateCheck.currentVersion}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">Latest Version:</p>
                <p className="font-mono font-semibold text-base text-blue-600">v{updateCheck.latestVersion}</p>
              </div>
            </div>

            <div className="text-sm bg-muted/50 p-4 rounded-lg border">
              <p className="text-muted-foreground">
                This will update your agent with the latest template configuration, including system prompt, blueprint, and model settings.
              </p>
            </div>

            {updateCheck.templateUpdatedAt && (
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <Icon name="clock" className="w-3.5 h-3.5" />
                Template last updated: {new Date(updateCheck.templateUpdatedAt).toLocaleString()}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={e => {
                e.stopPropagation()
                setShowDialog(false)
              }}
            >
              Later
            </Button>
            <Button
              onClick={e => {
                e.stopPropagation()
                handleUpdate()
              }}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? 'Updating...' : 'Update Now'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
