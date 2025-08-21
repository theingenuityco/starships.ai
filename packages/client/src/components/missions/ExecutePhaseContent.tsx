'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Play, CheckCircle, AlertCircle, Clock, Zap } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { missionApi } from '@/lib/missionApi';
import { WorkflowVisualization } from '@/components/workflow';
import type { Mission, MissionExecutionState, MissionNodeResult, MissionWorkflow, Agent } from '@starships/protocol';

interface ExecutePhaseContentProps {
  mission: Mission;
  workflow?: MissionWorkflow;
  agents?: Record<string, Agent>;
  onExecutionComplete?: () => void;
}

export function ExecutePhaseContent({ mission, workflow, agents, onExecutionComplete }: ExecutePhaseContentProps) {
  const [executionState, setExecutionState] = useState<MissionExecutionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    const pollExecutionStatus = async () => {
      try {
        const response = await missionApi.getExecutionStatus(mission.id);
        
        if (response.data) {
          setExecutionState(response.data.executionState);
          
          // Stop polling if execution is complete
          const state = response.data.executionState;
          if (state && (state.status === 'completed' || state.status === 'failed')) {
            clearInterval(interval);
            onExecutionComplete?.();
          }
        } else if (response.error) {
          throw new Error(response.error);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMessage);
        console.error('Failed to fetch execution status:', err);
      } finally {
        setLoading(false);
      }
    };

    // Initial fetch
    pollExecutionStatus();
    
    // Poll every 3 seconds during execution
    interval = setInterval(pollExecutionStatus, 3000);
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [mission.id, onExecutionComplete]);

  if (loading) {
    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center p-8 space-y-4"
      >
        <Clock className="w-8 h-8 animate-spin text-orange-600" />
        <div className="text-center">
          <h3 className="text-lg font-semibold">Initializing Execution</h3>
          <p className="text-gray-600">Preparing to run mission tasks...</p>
        </div>
      </motion.div>
    );
  }

  if (error) {
    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center p-8 space-y-4"
      >
        <AlertCircle className="w-8 h-8 text-red-600" />
        <div className="text-center">
          <h3 className="text-lg font-semibold text-red-800">Error Loading Execution Status</h3>
          <p className="text-red-600">{error}</p>
        </div>
      </motion.div>
    );
  }

  if (!executionState) {
    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center p-8 space-y-4"
      >
        <Zap className="w-12 h-12 text-orange-600" />
        <div className="text-center">
          <h3 className="text-lg font-semibold">Ready to Execute</h3>
          <p className="text-gray-600">Mission execution will begin shortly...</p>
        </div>
      </motion.div>
    );
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-6 h-6 text-green-600" />;
      case 'failed': return <AlertCircle className="w-6 h-6 text-red-600" />;
      case 'running': return <Clock className="w-6 h-6 text-orange-600 animate-spin" />;
      default: return <Clock className="w-6 h-6 text-gray-400" />;
    }
  };

  const getProgressPercentage = () => {
    if (executionState.totalNodes === 0) return 0;
    return (executionState.currentNodeIndex / executionState.totalNodes) * 100;
  };

  const getNodeStatusColor = (result: MissionNodeResult) => {
    if (result.success) return 'border-l-green-500 bg-green-50';
    if (result.error) return 'border-l-red-500 bg-red-50';
    return 'border-l-gray-300 bg-gray-50';
  };

  const getNodeStatusIcon = (result: MissionNodeResult) => {
    if (result.success) return <CheckCircle className="w-4 h-4 text-green-600" />;
    if (result.error) return <AlertCircle className="w-4 h-4 text-red-600" />;
    return <Clock className="w-4 h-4 text-gray-400" />;
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Execution Status Header */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              {getStatusIcon(executionState.status)}
              <div>
                <h3 className="text-lg font-semibold capitalize">{executionState.status} Execution</h3>
                <p className="text-sm text-gray-600">
                  {executionState.status === 'running' && `Task ${executionState.currentNodeIndex + 1} of ${executionState.totalNodes}`}
                  {executionState.status === 'completed' && `All ${executionState.totalNodes} tasks completed`}
                  {executionState.status === 'failed' && `Stopped at task ${executionState.currentNodeIndex + 1}`}
                </p>
              </div>
            </div>
            <div className="text-right text-sm text-gray-500">
              <p>Started: {new Date(executionState.startedAt).toLocaleString()}</p>
              {executionState.completedAt && (
                <p>Completed: {new Date(executionState.completedAt).toLocaleString()}</p>
              )}
            </div>
          </div>
          
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Progress</span>
              <span>{Math.round(getProgressPercentage())}%</span>
            </div>
            <Progress value={getProgressPercentage()} className="w-full" />
          </div>
        </CardContent>
      </Card>

      {/* Workflow Visualization */}
      {workflow && (
        <Card>
          <CardContent className="p-6">
            <h4 className="font-medium text-gray-900 mb-4">Mission Workflow</h4>
            <WorkflowVisualization 
              workflow={workflow} 
              agents={agents}
              currentNodeId={executionState?.nodeResults[executionState.currentNodeIndex]?.nodeId}
            />
          </CardContent>
        </Card>
      )}

      {/* Task Execution List */}
      <Card>
        <CardContent className="p-6">
          <h4 className="font-medium text-gray-900 mb-4">Task Execution Details</h4>
          
          {executionState.nodeResults.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No tasks executed yet...</p>
              <p className="text-sm">Execution will begin shortly</p>
            </div>
          ) : (
            <div className="space-y-3">
              {executionState.nodeResults.map((result, index) => (
                <motion.div
                  key={result.nodeId}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className={`border-l-4 p-4 rounded-r-lg ${getNodeStatusColor(result)}`}
                >
                  <div className="flex items-start space-x-3">
                    {getNodeStatusIcon(result)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-sm text-gray-900">{result.nodeName}</p>
                        <span className="text-xs text-gray-500">
                          {new Date(result.timestamp).toLocaleString()}
                        </span>
                      </div>
                      
                      {result.output && (
                        <p className="text-sm text-gray-700 mt-1 bg-white/50 p-2 rounded text-left">
                          {result.output}
                        </p>
                      )}
                      
                      {result.error && (
                        <p className="text-sm text-red-700 mt-1 bg-red-100/50 p-2 rounded">
                          <strong>Error:</strong> {result.error}
                        </p>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Final Status Messages */}
      {executionState.status === 'completed' && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center p-6 bg-green-50 rounded-lg border border-green-200"
        >
          <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-3" />
          <h3 className="text-green-800 font-semibold text-lg">Mission Execution Complete!</h3>
          <p className="text-green-700 mt-2">
            All {executionState.totalNodes} tasks have been successfully executed.
          </p>
          <p className="text-green-600 text-sm mt-1">
            You can now continue the conversation to discuss results or plan next steps.
          </p>
        </motion.div>
      )}

      {executionState.status === 'failed' && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center p-6 bg-red-50 rounded-lg border border-red-200"
        >
          <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-3" />
          <h3 className="text-red-800 font-semibold text-lg">Execution Failed</h3>
          <p className="text-red-700 mt-2">
            {executionState.error || 'One or more tasks failed during execution.'}
          </p>
          <p className="text-red-600 text-sm mt-1">
            Check the task details above and consider regenerating the plan.
          </p>
        </motion.div>
      )}
    </motion.div>
  );
}