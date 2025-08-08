'use client'

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Eye,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Play,
  Pause,
  RefreshCw,
  Loader2,
  Zap,
  FileText,
  GitBranch,
  Users
} from 'lucide-react'
import { WorkflowVisualization, WorkflowApprovalModal } from '@/components/workflow'
import { useWorkflow } from '@/hooks/useWorkflow'
import type { WorkflowDSL } from '@starships/protocol'

interface WorkflowTabProps {
  expeditionId: string
  userId: string
  className?: string
}

/**
 * Workflow status indicator
 */
const WorkflowStatus: React.FC<{ 
  workflow: WorkflowDSL | null
  executionStatus: any
}> = ({ workflow, executionStatus }) => {
  if (!workflow) {
    return (
      <Badge variant="secondary" className="gap-1">
        <AlertTriangle className="w-3 h-3" />
        No Workflow
      </Badge>
    )
  }

  const getStatusDisplay = () => {
    if (workflow.approvalStatus === 'pending') {
      return {
        variant: 'secondary' as const,
        icon: Clock,
        text: 'Pending Approval'
      }
    }
    
    if (workflow.approvalStatus === 'rejected') {
      return {
        variant: 'destructive' as const,
        icon: XCircle,
        text: 'Rejected'
      }
    }

    if (workflow.approvalStatus === 'approved') {
      if (!executionStatus) {
        return {
          variant: 'outline' as const,
          icon: Play,
          text: 'Ready to Execute'
        }
      }

      if (executionStatus.currentStatus === 'running') {
        return {
          variant: 'default' as const,
          icon: Zap,
          text: 'Executing'
        }
      }

      if (executionStatus.currentStatus === 'completed') {
        return {
          variant: 'default' as const,
          icon: CheckCircle2,
          text: 'Completed'
        }
      }

      if (executionStatus.currentStatus === 'paused') {
        return {
          variant: 'secondary' as const,
          icon: Pause,
          text: 'Paused'
        }
      }
    }

    return {
      variant: 'outline' as const,
      icon: FileText,
      text: 'Draft'
    }
  }

  const status = getStatusDisplay()
  const StatusIcon = status.icon

  return (
    <Badge variant={status.variant} className="gap-1">
      <StatusIcon className="w-3 h-3" />
      {status.text}
    </Badge>
  )
}

/**
 * Workflow statistics component
 */
const WorkflowStats: React.FC<{ 
  workflow: WorkflowDSL 
  executionStatus: any
}> = ({ workflow, executionStatus }) => (
  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
    <div className="text-center p-3 bg-blue-50 rounded-lg">
      <div className="text-2xl font-bold text-blue-600">{workflow.nodes.length}</div>
      <div className="text-sm text-blue-800">Total Steps</div>
    </div>
    
    <div className="text-center p-3 bg-purple-50 rounded-lg">
      <div className="text-2xl font-bold text-purple-600">
        {workflow.nodes.filter(n => n.type === 'agent').length}
      </div>
      <div className="text-sm text-purple-800">Agent Tasks</div>
    </div>
    
    <div className="text-center p-3 bg-green-50 rounded-lg">
      <div className="text-2xl font-bold text-green-600">
        {executionStatus?.completedNodes || 0}
      </div>
      <div className="text-sm text-green-800">Completed</div>
    </div>
    
    <div className="text-center p-3 bg-orange-50 rounded-lg">
      <div className="text-2xl font-bold text-orange-600">
        {workflow.metadata?.estimatedDuration || 0}m
      </div>
      <div className="text-sm text-orange-800">Est. Time</div>
    </div>
  </div>
)

/**
 * Workflow actions component
 */
const WorkflowActions: React.FC<{
  workflow: WorkflowDSL | null
  loading: boolean
  onApprove: () => void
  onReject: () => void
  onRefresh: () => void
}> = ({ workflow, loading, onApprove, onReject, onRefresh }) => {
  if (!workflow) {
    return (
      <div className="flex justify-end">
        <Button 
          variant="outline" 
          onClick={onRefresh} 
          disabled={loading}
          className="gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Refresh
        </Button>
      </div>
    )
  }

  if (workflow.approvalStatus === 'pending') {
    return (
      <div className="flex gap-2 justify-end">
        <Button 
          variant="outline" 
          onClick={onRefresh} 
          disabled={loading}
          size="sm"
        >
          <RefreshCw className="w-4 h-4" />
        </Button>
        <Button 
          variant="outline" 
          onClick={onReject} 
          disabled={loading}
          size="sm"
        >
          <XCircle className="w-4 h-4 mr-1" />
          Reject
        </Button>
        <Button 
          onClick={onApprove} 
          disabled={loading}
          size="sm"
        >
          <CheckCircle2 className="w-4 h-4 mr-1" />
          Approve
        </Button>
      </div>
    )
  }

  return (
    <div className="flex justify-end">
      <Button 
        variant="outline" 
        onClick={onRefresh} 
        disabled={loading}
        size="sm"
        className="gap-1"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        Refresh
      </Button>
    </div>
  )
}

/**
 * Main workflow tab component
 */
export const WorkflowTab: React.FC<WorkflowTabProps> = ({
  expeditionId,
  userId,
  className = ''
}) => {
  const [showApprovalModal, setShowApprovalModal] = useState(false)
  
  const {
    workflow,
    loading,
    error,
    executionStatus,
    pendingPrompts,
    approveWorkflow,
    rejectWorkflow,
    refreshWorkflow
  } = useWorkflow({ 
    expeditionId,
    enabled: true,
    pollInterval: 15000 // Poll every 15 seconds
  })

  const handleApprove = () => {
    if (workflow) {
      setShowApprovalModal(true)
    }
  }

  const handleReject = async () => {
    if (workflow) {
      setShowApprovalModal(true) // Modal handles both approve and reject
    }
  }

  const handleModalApprove = async (workflowData: WorkflowDSL) => {
    try {
      await approveWorkflow(userId)
      setShowApprovalModal(false)
    } catch (error) {
      console.error('Failed to approve workflow:', error)
      // Error handling could be improved with toast notifications
    }
  }

  const handleModalReject = async (workflowData: WorkflowDSL, reason: string) => {
    try {
      await rejectWorkflow(userId, reason)
      setShowApprovalModal(false)
    } catch (error) {
      console.error('Failed to reject workflow:', error)
      // Error handling could be improved with toast notifications
    }
  }

  // Loading state
  if (loading && !workflow) {
    return (
      <div className={`space-y-4 ${className}`}>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <Skeleton className="h-6 w-48 mb-2" />
                <Skeleton className="h-4 w-32" />
              </div>
              <Skeleton className="h-6 w-20" />
            </div>
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className={className}>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Failed to load workflow data: {error.message}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  // No workflow state
  if (!workflow) {
    return (
      <div className={className}>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <GitBranch className="w-16 h-16 text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">No Workflow Available</h3>
            <p className="text-gray-500 text-center mb-4">
              This expedition does not have a workflow DSL generated yet.
            </p>
            <Button 
              variant="outline" 
              onClick={refreshWorkflow} 
              disabled={loading}
              className="gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Check Again
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Workflow Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Eye className="w-5 h-5" />
                Expedition Workflow
              </CardTitle>
              <CardDescription>
                Generated workflow for expedition execution
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <WorkflowStatus workflow={workflow} executionStatus={executionStatus} />
              <WorkflowActions
                workflow={workflow}
                loading={loading}
                onApprove={handleApprove}
                onReject={handleReject}
                onRefresh={refreshWorkflow}
              />
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Workflow Statistics */}
      {workflow && (
        <WorkflowStats workflow={workflow} executionStatus={executionStatus} />
      )}

      {/* Pending Prompts Alert */}
      <AnimatePresence>
        {pendingPrompts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <Alert>
              <Users className="h-4 w-4" />
              <AlertDescription>
                You have {pendingPrompts.length} pending user prompt{pendingPrompts.length !== 1 ? 's' : ''} 
                that require your attention.
              </AlertDescription>
            </Alert>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Workflow Visualization */}
      <WorkflowVisualization
        workflow={workflow}
        currentNodeId={executionStatus?.currentNodeId || undefined}
        showControls={true}
      />

      {/* Approval Modal */}
      <WorkflowApprovalModal
        workflow={workflow}
        isOpen={showApprovalModal}
        onApprove={handleModalApprove}
        onReject={handleModalReject}
        onClose={() => setShowApprovalModal(false)}
        loading={loading}
      />
    </div>
  )
}

export default WorkflowTab