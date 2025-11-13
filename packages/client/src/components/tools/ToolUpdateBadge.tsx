'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToolUpdateCheck, useUpdateToolFromTemplate } from '@/hooks/useToolUpdate'
import Icon from '@/components/primitives/Icon'
import { useState } from 'react'
import { motion } from 'motion/react'

interface ToolUpdateBadgeProps {
  toolId: string
  toolName: string
}

export function ToolUpdateBadge({ toolId, toolName }: ToolUpdateBadgeProps) {
  const { data: updateCheck, isLoading } = useToolUpdateCheck(toolId)
  const updateMutation = useUpdateToolFromTemplate()
  const [showDialog, setShowDialog] = useState(false)

  // Don't show anything if loading or no update available
  if (isLoading || !updateCheck?.needsUpdate) {
    return null
  }

  const handleUpdate = () => {
    updateMutation.mutate(toolId, {
      onSuccess: () => {
        setShowDialog(false)
      },
    })
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        <Badge
          className="cursor-pointer text-[10px] px-1.5 py-0.5 font-medium relative overflow-hidden flex items-center"
          style={{
            background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.12), rgba(124, 58, 237, 0.08))',
            borderColor: 'rgba(139, 92, 246, 0.3)',
            color: 'rgb(139, 92, 246)',
            boxShadow: '0 0 8px rgba(139, 92, 246, 0.15)',
          }}
          onClick={e => {
            e.stopPropagation()
            setShowDialog(true)
          }}
        >
          <motion.div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.15), transparent)',
            }}
            animate={{
              x: ['-100%', '100%'],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: 'linear',
            }}
          />
          <span className="relative z-10 flex items-center gap-1">
            <Icon name="arrow-up-circle" className="w-2.5 h-2.5" />
            NEW UPDATE AVAILABLE
          </span>
        </Badge>
      </motion.div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent onClick={e => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Update {toolName}</DialogTitle>
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
                <p className="font-mono font-semibold text-base text-blue-600">v{updateCheck.latestVersion}</p>
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
