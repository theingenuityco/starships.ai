'use client'

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Loader2,
  Eye,
  MessageSquare,
} from 'lucide-react'
import { WorkflowVisualization } from './WorkflowVisualization'
import type { WorkflowModel } from '@starships/protocol'

// Client-side workflow type for compatibility
type WorkflowDSL = WorkflowModel | any

export interface WorkflowApprovalModalProps {
  workflow: WorkflowDSL | null
  isOpen: boolean
  onApprove: (workflow: WorkflowDSL) => Promise<void>
  onReject: (workflow: WorkflowDSL, reason: string) => Promise<void>
  onClose: () => void
  loading?: boolean
}

/**
 * Workflow summary component
 */
const WorkflowSummary: React.FC<{ workflow: WorkflowDSL }> = ({ workflow }) => {
  const agentNodes = workflow.nodes?.filter((n: any) => n.type === 'agent') || []
  const userPrompts = workflow.nodes?.filter((n: any) => n.type === 'user_prompt') || []
  const totalEstimatedTime =
    workflow.nodes
      ?.filter((n: any) => n.estimatedTime)
      .reduce((sum: number, n: any) => sum + (n.estimatedTime || 0), 0) || 0

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-lg">
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-600">{workflow.nodes.length}</div>
          <div className="text-sm text-gray-600">Total Steps</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-purple-600">{agentNodes.length}</div>
          <div className="text-sm text-gray-600">Agent Tasks</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-yellow-600">{userPrompts.length}</div>
          <div className="text-sm text-gray-600">User Prompts</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-green-600">
            {totalEstimatedTime || workflow.metadata?.estimatedDuration || 0}m
          </div>
          <div className="text-sm text-gray-600">Est. Duration</div>
        </div>
      </div>

      {/* Workflow metadata */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Complexity:</span>
          <Badge variant="outline">{workflow.metadata?.complexity || 'unknown'}</Badge>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Created by:</span>
          <span className="text-sm text-gray-600">{workflow.metadata?.createdBy || 'System'}</span>
        </div>

        {workflow.metadata?.tags && workflow.metadata.tags.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Tags:</span>
            <div className="flex flex-wrap gap-1">
              {workflow.metadata?.tags?.map((tag: any, index: number) => (
                <Badge key={index} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {workflow.metadata?.description && (
          <div>
            <span className="text-sm font-medium">Description:</span>
            <p className="text-sm text-gray-600 mt-1">{workflow.metadata.description}</p>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Approval confirmation component
 */
const ApprovalActions: React.FC<{
  onApprove: () => void
  onReject: () => void
  loading: boolean
  hasRejectionReason: boolean
}> = ({ onApprove, onReject, loading, hasRejectionReason }) => (
  <div className="flex gap-3">
    <Button variant="outline" onClick={onReject} disabled={loading} className="flex-1">
      {loading ? (
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
      ) : (
        <XCircle className="w-4 h-4 mr-2" />
      )}
      {hasRejectionReason ? 'Reject with Reason' : 'Reject Workflow'}
    </Button>

    <Button onClick={onApprove} disabled={loading} className="flex-1">
      {loading ? (
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
      ) : (
        <CheckCircle2 className="w-4 h-4 mr-2" />
      )}
      Approve & Execute
    </Button>
  </div>
)

/**
 * Main workflow approval modal component
 */
export const WorkflowApprovalModal: React.FC<WorkflowApprovalModalProps> = ({
  workflow,
  isOpen,
  onApprove,
  onReject,
  onClose,
  loading = false,
}) => {
  const [showRejectionInput, setShowRejectionInput] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleApprove = async () => {
    if (!workflow) return

    setSubmitting(true)
    try {
      await onApprove(workflow)
      onClose()
    } catch (error) {
      console.error('Failed to approve workflow:', error)
    } finally {
      setSubmitting(false)
    }
  }

  const handleReject = async () => {
    if (!workflow) return

    if (!showRejectionInput) {
      setShowRejectionInput(true)
      return
    }

    setSubmitting(true)
    try {
      await onReject(workflow, rejectionReason)
      onClose()
    } catch (error) {
      console.error('Failed to reject workflow:', error)
    } finally {
      setSubmitting(false)
      setShowRejectionInput(false)
      setRejectionReason('')
    }
  }

  const handleClose = () => {
    if (submitting) return
    setShowRejectionInput(false)
    setRejectionReason('')
    onClose()
  }

  if (!workflow) return null

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5" />
            Workflow Approval Required
          </DialogTitle>
          <DialogDescription>
            Review the proposed workflow <strong>{workflow.id}</strong> before execution begins.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-6">
            {/* Workflow Summary */}
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Workflow Summary
              </h3>
              <WorkflowSummary workflow={workflow} />
            </div>

            <Separator />

            {/* Workflow Visualization */}
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Eye className="w-4 h-4" />
                Workflow Preview
              </h3>
              <WorkflowVisualization
                workflow={workflow}
                showControls={true}
                className="border-0 shadow-none"
              />
            </div>

            {/* Rejection Reason Input */}
            <AnimatePresence>
              {showRejectionInput && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-2"
                >
                  <Separator />
                  <div>
                    <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                      <MessageSquare className="w-4 h-4" />
                      Rejection Reason
                    </h3>
                    <Textarea
                      placeholder="Please provide a reason for rejecting this workflow..."
                      value={rejectionReason}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                        setRejectionReason(e.target.value)
                      }
                      rows={3}
                      className="resize-none"
                    />
                    <p className="text-sm text-gray-600 mt-2">
                      This reason will help improve future workflow generation.
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </ScrollArea>

        <DialogFooter>
          <div className="flex flex-col gap-3 w-full">
            {/* Warning message */}
            <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-yellow-600 flex-shrink-0" />
              <p className="text-sm text-yellow-800">
                Once approved, this workflow will begin execution immediately. Make sure you&apos;ve
                reviewed all steps carefully.
              </p>
            </div>

            {/* Action buttons */}
            <ApprovalActions
              onApprove={handleApprove}
              onReject={handleReject}
              loading={loading || submitting}
              hasRejectionReason={showRejectionInput}
            />
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default WorkflowApprovalModal
