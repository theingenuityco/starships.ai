'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  CheckCircle, 
  Clock, 
  AlertCircle, 
  Users, 
  Target,
  RefreshCw,
  X
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/useToast';
import { missionApi } from '@/lib/missionApi';
import { WorkflowVisualization } from '@/components/workflow';
import type { Mission, WorkflowResponse, MissionWorkflow } from '@starships/protocol';

interface WorkflowPhaseContentProps {
  mission: Mission;
  onWorkflowApproval?: (approved: boolean) => void;
  readonly?: boolean;
}

export function WorkflowPhaseContent({ mission, onWorkflowApproval, readonly = false }: WorkflowPhaseContentProps) {
  const [workflow, setWorkflow] = useState<MissionWorkflow | null>(null);
  const [agents, setAgents] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectionDialog, setShowRejectionDialog] = useState(false);
  
  const { toast } = useToast();

  useEffect(() => {
    loadWorkflow();
  }, [mission.id]);

  const loadWorkflow = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await missionApi.getMissionWorkflow(mission.id);
      
      if (response.error) {
        throw new Error(response.error);
      }
      
      if (!response.data?.workflow) {
        throw new Error('No workflow data available');
      }
      
      setWorkflow(response.data.workflow);
      setAgents(response.data.agents || {});
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load workflow';
      setError(errorMessage);
      toast({
        title: 'Workflow Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleApproval = async (approved: boolean, reason?: string) => {
    if (!workflow) return;
    
    try {
      setActionLoading(true);
      
      const response = await missionApi.approveMissionWorkflow(mission.id, approved, reason);
      
      if (response.error) {
        throw new Error(response.error);
      }
      
      toast({
        title: approved ? 'Workflow Approved' : 'Workflow Rejected',
        description: response.data?.message || (approved ? 'Execution will begin' : 'New workflow will be generated'),
        variant: approved ? 'default' : 'destructive',
      });
      
      // Trigger callback to parent component
      onWorkflowApproval?.(approved);
      
      // Reload workflow to get updated status
      await loadWorkflow();
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update approval';
      setError(errorMessage);
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setActionLoading(false);
      setShowRejectionDialog(false);
    }
  };

  const handleRegenerate = async () => {
    try {
      setActionLoading(true);
      
      const response = await missionApi.regenerateMissionWorkflow(mission.id);
      
      if (response.error) {
        throw new Error(response.error);
      }
      
      toast({
        title: 'Workflow Regeneration Initiated',
        description: response.data?.message || 'Generating new execution workflow',
        variant: 'default',
      });
      
      // Reload workflow
      await loadWorkflow();
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to regenerate workflow';
      setError(errorMessage);
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Get workflow summary for display
  const getWorkflowSummary = (workflow: MissionWorkflow) => {
    const agentTasks = workflow.nodes.filter(node => node.type === 'agent');
    const uniqueAgents = new Set(agentTasks.map(task => task.parameters.agentId));
    
    return {
      totalTasks: agentTasks.length,
      uniqueAgents: uniqueAgents.size,
      estimatedTime: agentTasks.reduce((sum, task) => 
        sum + (task.parameters.estimatedTime || 0), 0)
    };
  };

  if (loading) {
    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center justify-center p-8"
      >
        <div className="flex items-center space-x-3">
          <Clock className="w-6 h-6 animate-spin text-blue-600" />
          <span className="text-lg">Generating execution workflow...</span>
        </div>
      </motion.div>
    );
  }

  if (error && !workflow) {
    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center justify-center p-8"
      >
        <div className="text-red-600 flex items-center space-x-3">
          <AlertCircle className="w-6 h-6" />
          <span className="text-lg">{error}</span>
        </div>
      </motion.div>
    );
  }

  if (!workflow) {
    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center justify-center p-8"
      >
        <span className="text-lg text-gray-600">No workflow available</span>
      </motion.div>
    );
  }

  const summary = getWorkflowSummary(workflow);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-4"
    >
      {/* Workflow Summary */}
      {workflow && (
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {summary.totalTasks} tasks
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {summary.uniqueAgents} agents
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${
              workflow.approvalStatus === 'approved' ? 'bg-green-500' :
              workflow.approvalStatus === 'rejected' ? 'bg-red-500' :
              'bg-yellow-500'
            }`}></div>
            <span className={`text-sm font-medium capitalize ${
              workflow.approvalStatus === 'approved' ? 'text-green-600 dark:text-green-400' :
              workflow.approvalStatus === 'rejected' ? 'text-red-600 dark:text-red-400' :
              'text-yellow-600 dark:text-yellow-400'
            }`}>
              {workflow.approvalStatus}
            </span>
          </div>
        </div>
      )}

      {/* Workflow Visualization */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-700 mb-2">Execution Flow</h3>
        <WorkflowVisualization workflow={workflow} agents={agents} />
      </div>

      
      {/* Status Messages */}
      {workflow.approvalStatus === 'approved' && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center p-6 bg-green-50 rounded-lg border border-green-200"
        >
          <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-3" />
          <p className="text-green-800 font-medium text-lg">Workflow approved! Execution is ready to begin.</p>
        </motion.div>
      )}
      
      {workflow.approvalStatus === 'rejected' && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center p-6 bg-red-50 rounded-lg border border-red-200"
        >
          <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-3" />
          <p className="text-red-800 font-medium text-lg">Workflow requires changes. Commander ARIA will revise the workflow.</p>
        </motion.div>
      )}

      {/* Rejection Dialog */}
      {showRejectionDialog && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setShowRejectionDialog(false)}
        >
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-lg p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-4">Request Workflow Changes</h3>
            <p className="text-gray-600 mb-4">
              Please provide feedback on what changes you&apos;d like to see in the execution workflow:
            </p>
            <Textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Describe the changes you'd like to see..."
              className="mb-4"
              rows={4}
            />
            <div className="flex justify-end space-x-3">
              <Button
                variant="outline"
                onClick={() => setShowRejectionDialog(false)}
                disabled={actionLoading}
              >
                Cancel
              </Button>
              <Button
                onClick={() => handleApproval(false, rejectionReason)}
                disabled={actionLoading}
                variant="destructive"
              >
                Request Changes
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </motion.div>
  );
}