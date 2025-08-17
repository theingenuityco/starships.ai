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
import type { Mission, MissionPlanResponse, MissionTask } from '@starships/protocol';

interface PlanPhaseContentProps {
  mission: Mission;
  onPlanApproval?: (approved: boolean) => void;
}

export function PlanPhaseContent({ mission, onPlanApproval }: PlanPhaseContentProps) {
  const [plan, setPlan] = useState<MissionPlanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectionDialog, setShowRejectionDialog] = useState(false);
  
  const { toast } = useToast();

  useEffect(() => {
    loadPlan();
  }, [mission.id]);

  const loadPlan = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await missionApi.getMissionPlan(mission.id);
      
      if (response.error) {
        throw new Error(response.error);
      }
      
      setPlan(response.data || null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load plan';
      setError(errorMessage);
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleApproval = async (approved: boolean, reason?: string) => {
    if (!plan) return;
    
    try {
      setActionLoading(true);
      
      const response = await missionApi.approveMissionPlan(mission.id, approved, reason);
      
      if (response.error) {
        throw new Error(response.error);
      }
      
      toast({
        title: approved ? 'Plan Approved' : 'Plan Rejected',
        description: response.data?.message || (approved ? 'Execution will begin' : 'New plan will be generated'),
        variant: approved ? 'default' : 'destructive',
      });
      
      // Trigger callback to parent component
      onPlanApproval?.(approved);
      
      // Reload plan to get updated status
      await loadPlan();
      
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
      
      const response = await missionApi.regenerateMissionPlan(mission.id);
      
      if (response.error) {
        throw new Error(response.error);
      }
      
      toast({
        title: 'Plan Regeneration Initiated',
        description: response.data?.message || 'Generating new execution plan',
        variant: 'default',
      });
      
      // Reload plan
      await loadPlan();
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to regenerate plan';
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

  if (loading) {
    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center justify-center p-8"
      >
        <div className="flex items-center space-x-3">
          <Clock className="w-6 h-6 animate-spin text-blue-600" />
          <span className="text-lg">Generating execution plan...</span>
        </div>
      </motion.div>
    );
  }

  if (error && !plan) {
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

  if (!plan) {
    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center justify-center p-8"
      >
        <span className="text-lg text-gray-600">No plan available</span>
      </motion.div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Plan Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-3">
            <Target className="w-6 h-6 text-blue-600" />
            <span>Mission Execution Plan</span>
            <Badge 
              variant={
                plan.approvalStatus === 'approved' ? 'default' : 
                plan.approvalStatus === 'rejected' ? 'destructive' : 'secondary'
              }
            >
              {plan.approvalStatus}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-6 mb-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600">{plan.tasks.length}</div>
              <div className="text-sm text-gray-600">Tasks</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">
                {Object.keys(plan.agentAssignments).length}
              </div>
              <div className="text-sm text-gray-600">Agents</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-purple-600">
                {plan.tasks.reduce((total, task) => total + (task.dependencies?.length || 0), 0)}
              </div>
              <div className="text-sm text-gray-600">Dependencies</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Task Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Task Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <AnimatePresence>
              {plan.tasks.map((task, index) => (
                <TaskCard key={task.id || `task-${index}`} task={task} index={index} plan={plan} />
              ))}
            </AnimatePresence>
          </div>
        </CardContent>
      </Card>

      {/* Agent Assignments */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-3">
            <Users className="w-6 h-6 text-gray-600" />
            <span>Agent Assignments</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Object.entries(plan.agentAssignments).map(([agentId, taskIds]) => (
              <motion.div 
                key={agentId}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
              >
                <div>
                  <div className="font-medium text-gray-900">{agentId}</div>
                  <div className="text-sm text-gray-600">{taskIds.length} task(s) assigned</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {taskIds.map((taskId, idx) => {
                    const taskIndex = plan.tasks.findIndex(t => t.id === taskId);
                    return (
                      <Badge key={taskId || `badge-${agentId}-${idx}`} variant="outline" className="text-xs">
                        Task {taskIndex + 1}
                      </Badge>
                    );
                  })}
                </div>
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      {plan.approvalStatus === 'pending' && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex justify-center space-x-4"
        >
          <Button
            onClick={() => handleApproval(true)}
            disabled={actionLoading}
            className="bg-green-600 hover:bg-green-700 text-white px-8"
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            Approve Plan & Start Execution
          </Button>
          
          <Button
            variant="outline"
            onClick={() => setShowRejectionDialog(true)}
            disabled={actionLoading}
            className="px-6"
          >
            <X className="w-4 h-4 mr-2" />
            Request Changes
          </Button>
          
          <Button
            variant="outline"
            onClick={handleRegenerate}
            disabled={actionLoading}
            className="px-6"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Regenerate Plan
          </Button>
        </motion.div>
      )}
      
      {/* Status Messages */}
      {plan.approvalStatus === 'approved' && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center p-6 bg-green-50 rounded-lg border border-green-200"
        >
          <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-3" />
          <p className="text-green-800 font-medium text-lg">Plan approved! Execution is ready to begin.</p>
        </motion.div>
      )}
      
      {plan.approvalStatus === 'rejected' && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center p-6 bg-red-50 rounded-lg border border-red-200"
        >
          <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-3" />
          <p className="text-red-800 font-medium text-lg">Plan requires changes. Commander ARIA will revise the plan.</p>
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
            <h3 className="text-lg font-semibold mb-4">Request Plan Changes</h3>
            <p className="text-gray-600 mb-4">
              Please provide feedback on what changes you'd like to see in the execution plan:
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

// Task Card Component
interface TaskCardProps {
  task: MissionTask;
  index: number;
  plan: MissionPlanResponse;
}

function TaskCard({ task, index, plan }: TaskCardProps) {
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800 border-red-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getDependencyTasks = (dependencies: string[]) => {
    if (!dependencies || dependencies.length === 0) return '';
    return dependencies.map(depId => {
      const depIndex = plan.tasks.findIndex(t => t.id === depId);
      return depIndex >= 0 ? `Task ${depIndex + 1}` : 'Unknown';
    }).join(', ');
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center space-x-3">
          <span className="font-medium text-blue-600 text-lg">Task {index + 1}</span>
          <Badge className={`text-xs px-2 py-1 ${getPriorityColor(task.priority)}`}>
            {task.priority}
          </Badge>
        </div>
        <Badge variant="outline" className="text-xs">
          {task.assignedAgentId}
        </Badge>
      </div>
      
      <h4 className="font-semibold text-gray-900 mb-2">{task.title}</h4>
      <p className="text-sm text-gray-600 mb-4">{task.description}</p>
      
      <div className="space-y-2">
        <div>
          <span className="text-sm font-medium text-gray-700">Deliverable: </span>
          <span className="text-sm text-gray-600">{task.deliverable}</span>
        </div>
        
        {task.dependencies && task.dependencies.length > 0 && (
          <div>
            <span className="text-sm font-medium text-gray-700">Dependencies: </span>
            <span className="text-sm text-gray-600">{getDependencyTasks(task.dependencies)}</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}