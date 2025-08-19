'use client';

import React from 'react';
import { Clock, User, Zap } from 'lucide-react';
import type { MissionWorkflow, WorkflowDSLNode } from '@starships/protocol';

interface WorkflowTaskListProps {
  workflow: MissionWorkflow;
  className?: string;
}

export const WorkflowTaskList: React.FC<WorkflowTaskListProps> = ({
  workflow,
  className = ''
}) => {
  // Filter out non-agent tasks (start, end, etc.)
  const agentTasks = workflow.nodes.filter(node => node.type === 'agent');

  if (agentTasks.length === 0) {
    return (
      <div className={`p-4 text-center text-gray-500 dark:text-gray-400 ${className}`}>
        No tasks found in workflow
      </div>
    );
  }

  const getTaskIcon = (node: WorkflowDSLNode) => {
    switch (node.type) {
      case 'agent':
        return <Zap className="w-4 h-4 text-purple-500" />;
      default:
        return <User className="w-4 h-4 text-gray-500" />;
    }
  };

  return (
    <div className={`space-y-3 ${className}`}>
      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
        Task List ({agentTasks.length} tasks)
      </h3>
      
      <div className="space-y-2">
        {agentTasks.map((task, index) => (
          <div
            key={task.id}
            className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
          >
            {/* Task number and icon */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="w-6 h-6 bg-blue-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                {index + 1}
              </div>
              {getTaskIcon(task)}
            </div>
            
            {/* Task details */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900 dark:text-gray-100 text-sm leading-tight">
                    {task.name}
                  </h4>
                  
                  {task.description && (
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                      {task.description}
                    </p>
                  )}
                  
                  {/* Agent assignment */}
                  {task.parameters.agentId && (
                    <div className="flex items-center gap-1 mt-2">
                      <User className="w-3 h-3 text-purple-500" />
                      <span className="text-xs text-purple-600 dark:text-purple-400 font-medium">
                        Agent: {task.parameters.agentName || task.parameters.agentId}
                      </span>
                    </div>
                  )}
                </div>
                
                {/* Estimated time */}
                {task.parameters.estimatedTime && (
                  <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                    <Clock className="w-3 h-3" />
                    <span>{task.parameters.estimatedTime}min</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default WorkflowTaskList;