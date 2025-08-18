'use client';

import React, { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Node,
  Edge,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { MissionTask, MissionPlanResponse } from '@starships/protocol';

interface MissionFlowchartProps {
  plan: MissionPlanResponse;
}

interface FlowNode extends Node {
  data: {
    label: string;
    task: MissionTask;
    priority: 'low' | 'medium' | 'high';
    agentId: string;
  };
}

// Custom node styles based on priority
const getNodeStyle = (priority: string) => {
  switch (priority) {
    case 'high':
      return {
        background: '#fee2e2',
        border: '2px solid #dc2626',
        borderRadius: '8px',
        color: '#7f1d1d',
      };
    case 'medium':
      return {
        background: '#fef3c7',
        border: '2px solid #d97706',
        borderRadius: '8px',
        color: '#92400e',
      };
    case 'low':
      return {
        background: '#dcfce7',
        border: '2px solid #16a34a',
        borderRadius: '8px',
        color: '#14532d',
      };
    default:
      return {
        background: '#f3f4f6',
        border: '2px solid #6b7280',
        borderRadius: '8px',
        color: '#374151',
      };
  }
};

// Convert tasks to nodes and edges for React Flow
const convertToFlowData = (plan: MissionPlanResponse) => {
  const nodes: FlowNode[] = [];
  const edges: Edge[] = [];

  // Create a map of task IDs for validation
  const taskIdSet = new Set(plan.tasks.map(task => task.id));
  
  console.log('🔍 MissionFlowchart Debug Info:');
  console.log('📋 Plan tasks:', plan.tasks.length);
  console.log('🆔 Task IDs:', Array.from(taskIdSet));

  // Sort tasks by dependencies (topological sort for better visual flow)
  const sortedTasks = [...plan.tasks].sort((a, b) => {
    const aDeps = a.dependencies?.length || 0;
    const bDeps = b.dependencies?.length || 0;
    return aDeps - bDeps; // Tasks with fewer dependencies come first
  });

  // Generate nodes
  sortedTasks.forEach((task, index) => {
    // Calculate position - arrange vertically
    const x = 50; // Centered in sidebar
    const y = index * 120; // Vertical spacing between tasks

    console.log(`📌 Task ${index + 1}:`, {
      id: task.id,
      title: task.title,
      dependencies: task.dependencies,
      position: { x, y }
    });

    nodes.push({
      id: task.id,
      type: 'default',
      position: { x, y },
      data: {
        label: `${plan.tasks.findIndex(t => t.id === task.id) + 1}. ${task.title}`,
        task,
        priority: task.priority,
        agentId: task.assignedAgentId,
      },
      style: getNodeStyle(task.priority),
    });

    // Generate edges for dependencies
    if (task.dependencies && task.dependencies.length > 0) {
      console.log(`🔗 Processing dependencies for task ${task.id}:`, task.dependencies);
      
      task.dependencies.forEach((depId) => {
        if (taskIdSet.has(depId)) {
          const edge = {
            id: `${depId}-${task.id}`,
            source: depId,
            target: task.id,
            type: 'smoothstep',
            animated: true,
            style: { stroke: '#3b82f6', strokeWidth: 3 },
            markerEnd: {
              type: 'arrowclosed',
              color: '#3b82f6',
            },
          };
          
          console.log(`✅ Created edge:`, edge);
          edges.push(edge);
        } else {
          console.log(`❌ Dependency not found in task set: ${depId}`);
        }
      });
    } else {
      console.log(`ℹ️ Task ${task.id} has no dependencies`);
    }
  });

  console.log(`📊 Final result: ${nodes.length} nodes, ${edges.length} edges`);
  console.log('🔗 All edges:', edges);

  return { nodes, edges };
};

function FlowchartContent({ plan }: MissionFlowchartProps) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => convertToFlowData(plan),
    [plan]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  return (
    <div className="h-[600px] w-full border border-gray-200 rounded-lg overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
        fitViewOptions={{
          padding: 0.2,
          minZoom: 0.3,
          maxZoom: 1.0,
        }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
      >
        <Controls 
          showZoom={true}
          showFitView={true}
          showInteractive={false}
          position="bottom-right"
        />
        <Background color="#e2e8f0" gap={16} />
      </ReactFlow>
    </div>
  );
}

export function MissionFlowchart({ plan }: MissionFlowchartProps) {
  if (!plan.tasks || plan.tasks.length === 0) {
    return (
      <div className="h-[200px] flex items-center justify-center border border-gray-200 rounded-lg bg-gray-50">
        <p className="text-gray-500">No tasks to display</p>
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <FlowchartContent plan={plan} />
    </ReactFlowProvider>
  );
}