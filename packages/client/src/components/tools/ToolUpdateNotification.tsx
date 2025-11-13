'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToolUpdateCheck, useUpdateToolFromTemplate } from '@/hooks/useToolUpdate'
import Icon from '@/components/primitives/Icon'
import { motion } from 'motion/react'
import { useState } from 'react'

interface ToolUpdateNotificationProps {
  toolId: string
  isTemplateBasedTool: boolean
}

export function ToolUpdateNotification({ toolId, isTemplateBasedTool }: ToolUpdateNotificationProps) {
  const { data: updateCheck, isLoading } = useToolUpdateCheck(toolId, isTemplateBasedTool && !!toolId)
  const updateMutation = useUpdateToolFromTemplate()
  const [showDialog, setShowDialog] = useState(false)

  // Don't show if not template-based, loading, or no update available
  if (!isTemplateBasedTool || isLoading || !updateCheck?.needsUpdate) {
    return null
  }

  const handleUpdate = async () => {
    if (!toolId) return
    await updateMutation.mutateAsync(toolId, {
      onSuccess: () => {
        setShowDialog(false)
      },
    })
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="relative overflow-hidden rounded-xl p-3"
        style={{
          background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.08), rgba(124, 58, 237, 0.05))',
          borderColor: 'rgba(139, 92, 246, 0.2)',
          borderWidth: '1px',
          borderStyle: 'solid',
        }}
      >
        <motion.div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent)',
          }}
          animate={{
            x: ['-100%', '200%'],
          }}
          transition={{
            duration: 2.5,
            repeat: Infinity,
            ease: 'linear',
          }}
        />
        <div className="relative flex items-center gap-3">
          <div
            className="relative z-10 flex h-8 w-8 items-center justify-center rounded-lg shrink-0"
            style={{
              background: 'rgba(139, 92, 246, 0.1)',
              border: '1px solid rgba(139, 92, 246, 0.2)',
            }}
          >
            <Icon name="download" className="h-3.5 w-3.5" style={{ color: 'rgb(139, 92, 246)' }} />
          </div>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-sm font-medium whitespace-nowrap">Update available</span>
            <Badge
              variant="outline"
              className="text-[10px] font-mono flex items-center gap-1"
              style={{
                borderColor: 'rgba(139, 92, 246, 0.3)',
                background: 'rgba(139, 92, 246, 0.05)',
                color: 'rgb(139, 92, 246)',
              }}
            >
              <Icon name="arrow-up-circle" className="w-2.5 h-2.5" />
              v{updateCheck.latestVersion}
            </Badge>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => setShowDialog(true)}
            className="hover:opacity-80 transition-opacity h-8 px-3 shrink-0"
            style={{
              background: 'rgba(139, 92, 246, 0.1)',
              borderColor: 'rgba(139, 92, 246, 0.3)',
              color: 'rgb(139, 92, 246)',
            }}
          >
            Update Now
          </Button>
        </div>
      </motion.div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Tool</DialogTitle>
            <DialogDescription>A new version of this tool template is available.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground mb-1">Current Version:</p>
                <p className="font-mono font-semibold text-base">v{updateCheck.currentVersion}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">Latest Version:</p>
                <p className="font-mono font-semibold text-base text-purple-600">v{updateCheck.latestVersion}</p>
              </div>
            </div>

            <div className="text-sm bg-muted/50 p-4 rounded-lg border">
              <p className="text-muted-foreground">
                This will update your tool with the latest template configuration, including parameters, blueprint, and description.
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
            <Button variant="outline" onClick={() => setShowDialog(false)} disabled={updateMutation.isPending}>
              Later
            </Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Updating...' : 'Update Now'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
