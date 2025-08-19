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
  MarkerType,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { 
  Play, 
  CheckCircle2, 
  Zap, 
  User, 
  AlertTriangle, 
  Eye, 
  Clock 
} from 'lucide-react';
import type { MissionWorkflow, WorkflowDSLNode } from '@starships/protocol';

export interface WorkflowVisualizationProps {
  workflow: MissionWorkflow;
  currentNodeId?: string;
  onNodeClick?: (nodeId: string) => void;
  className?: string;
}

interface FlowNode extends Node {
  data: {
    label: string;
    node: WorkflowDSLNode;
    icon: React.ReactNode;
    isActive: boolean;
  };
}

// Get icon for node type
const getNodeIcon = (nodeType: string) => {
  switch (nodeType) {
    case 'start':
      return <Play className="w-4 h-4" />;
    case 'end':
      return <CheckCircle2 className="w-4 h-4" />;
    case 'agent':
      return <Zap className="w-4 h-4" />;
    case 'user_prompt':
      return <User className="w-4 h-4" />;
    case 'conditional':
      return <AlertTriangle className="w-4 h-4" />;
    case 'output':
      return <Eye className="w-4 h-4" />;
    default:
      return <Clock className="w-4 h-4" />;
  }
};

// Get node colors and styling
const getNodeStyle = (nodeType: string, isActive: boolean) => {
  const baseStyles = {
    start: { 
      background: '#dcfce7', 
      border: '2px solid #16a34a', 
      color: '#14532d' 
    },
    end: { 
      background: '#dbeafe', 
      border: '2px solid #2563eb', 
      color: '#1e3a8a' 
    },
    agent: { 
      background: '#f3e8ff', 
      border: '2px solid #9333ea', 
      color: '#581c87' 
    },
    user_prompt: { 
      background: '#fef3c7', 
      border: '2px solid #d97706', 
      color: '#92400e' 
    },
    conditional: { 
      background: '#fed7aa', 
      border: '2px solid #ea580c', 
      color: '#9a3412' 
    },
    output: { 
      background: '#e0e7ff', 
      border: '2px solid #4f46e5', 
      color: '#3730a3' 
    },
    default: { 
      background: '#f3f4f6', 
      border: '2px solid #6b7280', 
      color: '#374151' 
    }
  };

  const activeStyles = {
    start: { 
      background: '#bbf7d0', 
      border: '3px solid #16a34a', 
      boxShadow: '0 0 0 3px rgba(34, 197, 94, 0.2)' 
    },
    end: { 
      background: '#bfdbfe', 
      border: '3px solid #2563eb', 
      boxShadow: '0 0 0 3px rgba(37, 99, 235, 0.2)' 
    },
    agent: { 
      background: '#e9d5ff', 
      border: '3px solid #9333ea', 
      boxShadow: '0 0 0 3px rgba(147, 51, 234, 0.2)' 
    },
    user_prompt: { 
      background: '#fde68a', 
      border: '3px solid #d97706', 
      boxShadow: '0 0 0 3px rgba(217, 119, 6, 0.2)' 
    },
    conditional: { 
      background: '#fdba74', 
      border: '3px solid #ea580c', 
      boxShadow: '0 0 0 3px rgba(234, 88, 12, 0.2)' 
    },
    output: { 
      background: '#c7d2fe', 
      border: '3px solid #4f46e5', 
      boxShadow: '0 0 0 3px rgba(79, 70, 229, 0.2)' 
    },
    default: { 
      background: '#e5e7eb', 
      border: '3px solid #6b7280', 
      boxShadow: '0 0 0 3px rgba(107, 114, 128, 0.2)' 
    }
  };

  const baseStyle = baseStyles[nodeType as keyof typeof baseStyles] || baseStyles.default;
  const activeStyle = isActive ? 
    (activeStyles[nodeType as keyof typeof activeStyles] || activeStyles.default) : {};

  return {
    ...baseStyle,
    ...activeStyle,
    borderRadius: '12px',
    padding: '12px 16px',
    minWidth: '200px',
    fontSize: '14px',
    fontWeight: '500',
    transition: 'all 0.2s ease-in-out',
  };
};

// Custom node component
const CustomNode: React.FC<{ data: FlowNode['data'] }> = ({ data }) => {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {data.icon}
        <span className="font-semibold">{data.node.name}</span>
      </div>
      
      {data.node.description && (
        <div className="text-xs opacity-75 line-clamp-2">
          {data.node.description}
        </div>
      )}
      
      <div className="flex items-center justify-between text-xs">
        <span className="px-2 py-1 bg-black/10 rounded-full">
          {data.node.type}
        </span>
        {data.node.estimatedTime && (
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>{data.node.estimatedTime}min</span>
          </div>
        )}
      </div>
    </div>
  );
};

// Convert workflow to React Flow format
const convertToFlowData = (workflow: MissionWorkflow, currentNodeId?: string) => {
  const nodes: FlowNode[] = [];
  const edges: Edge[] = [];

  // Create nodes
  workflow.nodes.forEach((node, index) => {
    const isActive = node.id === currentNodeId;
    
    // Calculate position - use a simple grid layout
    const x = (index % 3) * 280; // 3 columns with wider spacing
    const y = Math.floor(index / 3) * 150; // Row height
    
    nodes.push({
      id: node.id,
      type: 'default',
      position: { x, y },
      data: {
        label: node.name,
        node,
        icon: getNodeIcon(node.type),
        isActive,
      },
      style: getNodeStyle(node.type, isActive),
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    });
  });

  // Create edges
  workflow.edges.forEach((edge) => {
    edges.push({
      id: edge.id,
      source: edge.from,
      target: edge.to,
      type: 'smoothstep',
      animated: true,
      style: { 
        stroke: '#3b82f6', 
        strokeWidth: 2 
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: '#3b82f6',
      },
    });
  });

  return { nodes, edges };
};

// Node types for React Flow
const nodeTypes = {
  default: CustomNode,
};

function FlowContent({ workflow, currentNodeId, onNodeClick }: WorkflowVisualizationProps) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => convertToFlowData(workflow, currentNodeId),
    [workflow, currentNodeId]
  );

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (onNodeClick) {
        onNodeClick(node.id);
      }
    },
    [onNodeClick]
  );

  return (
    <div className="h-[500px] w-full border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{
          padding: 0.2,
          minZoom: 0.1,
          maxZoom: 2.0,
        }}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        zoomOnScroll={true}
        zoomOnPinch={true}
        panOnScroll={true}
        panOnDrag={true}
      >
        <Controls 
          showZoom={true}
          showFitView={true}
          showInteractive={false}
          position="bottom-right"
        />
        <Background 
          color="#e2e8f0" 
          gap={20} 
          size={1}
        />
      </ReactFlow>
    </div>
  );
}

/**
 * Main workflow visualization component using React Flow
 */
export const WorkflowVisualization: React.FC<WorkflowVisualizationProps> = ({
  workflow,
  currentNodeId,
  onNodeClick,
  className = ''
}) => {
  if (!workflow?.nodes || workflow.nodes.length === 0) {
    return (
      <div className={`h-[200px] flex items-center justify-center border border-gray-200 rounded-lg bg-gray-50 ${className}`}>
        <p className="text-gray-500">No workflow nodes to display</p>
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <div className={className}>
        <FlowContent 
          workflow={workflow} 
          currentNodeId={currentNodeId} 
          onNodeClick={onNodeClick} 
        />
      </div>
    </ReactFlowProvider>
  );
};

export default WorkflowVisualization;