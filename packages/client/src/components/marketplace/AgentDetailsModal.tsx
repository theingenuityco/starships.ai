'use client'

import React from 'react'
import type { AgentTemplateModel } from '@starships/protocol'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AgentTemplateDetailsModalContent } from '@/components/marketplace/AgentTemplateDetailsModalContent'

interface AgentDetailsModalProps {
  template: AgentTemplateModel | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeploy?: (template: AgentTemplateModel) => void
}

export function AgentDetailsModal({ template, open, onOpenChange, onDeploy }: AgentDetailsModalProps) {
  if (!template) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[85vh] p-0 overflow-hidden flex flex-col">
        <DialogHeader className="sr-only">
          <DialogTitle>{template.name ? `${template.name} details` : 'Agent details'}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <AgentTemplateDetailsModalContent template={template} onDeploy={onDeploy} onRequestClose={() => onOpenChange(false)} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
