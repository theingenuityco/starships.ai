'use client';

import React, { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Node,
  Edge,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  ReactFlowProvider,
  MarkerType,
  Position,
  Handle,
  useReactFlow,
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
import type { WorkflowDSL, WorkflowDSLNode, Agent, MissionWorkflow } from '@starships/protocol';

export interface WorkflowVisualizationProps {
  workflow: WorkflowDSL | MissionWorkflow;
  agents?: Record<string, Agent>;
  currentNodeId?: string;
  onNodeClick?: (nodeId: string) => void;
  className?: string;
  showControls?: boolean;
}

interface FlowNode extends Node {
  data: {
    label: string;
    node: WorkflowDSLNode;
    agent?: Agent;
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

// Minimal node styling
const getNodeStyle = () => {
  return {
    padding: '0', // Remove default padding - we'll handle it in classes
    margin: '0',
    minWidth: '280px', // Increased from 200px for better agent info display
    fontSize: '14px',
    fontWeight: '400',
    transition: 'all 0.2s ease',
    background: 'transparent', // Ensure no background from React Flow
    border: 'none', // Remove React Flow default border
  };
};

// Custom node component with dark mode support
const CustomNode: React.FC<{ data: FlowNode['data'] }> = ({ data }) => {
  const { node } = data;
  
  const getHandleColor = (nodeType: string) => {
    const colors = {
      start: '#22c55e',
      end: '#3b82f6', 
      agent: '#a855f7',
      user_prompt: '#f59e0b',
      conditional: '#f97316',
      output: '#6366f1',
      default: '#64748b'
    };
    return colors[nodeType as keyof typeof colors] || colors.default;
  };

  const getNodeClasses = (nodeType: string, isActive: boolean) => {
    const baseClasses = "border rounded-lg p-3";
    
    const typeClasses = {
      start: "bg-green-50 border-green-300 text-green-700 dark:bg-green-900/20 dark:border-green-600 dark:text-green-300",
      end: "bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/20 dark:border-blue-600 dark:text-blue-300",
      agent: "bg-purple-50 border-purple-300 text-purple-700 dark:bg-purple-900/20 dark:border-purple-600 dark:text-purple-300",
      user_prompt: "bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-900/20 dark:border-amber-600 dark:text-amber-300",
      conditional: "bg-orange-50 border-orange-300 text-orange-700 dark:bg-orange-900/20 dark:border-orange-600 dark:text-orange-300",
      output: "bg-indigo-50 border-indigo-300 text-indigo-700 dark:bg-indigo-900/20 dark:border-indigo-600 dark:text-indigo-300",
      default: "bg-gray-50 border-gray-300 text-gray-700 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300"
    };

    const activeClasses = isActive ? "ring-1 ring-current/50" : '';
    const nodeTypeClass = typeClasses[nodeType as keyof typeof typeClasses] || typeClasses.default;
    
    return `${baseClasses} ${nodeTypeClass} ${activeClasses}`;
  };

  const handleColor = getHandleColor(node.type);
  const nodeClasses = getNodeClasses(node.type, data.isActive);
  
  return (
    <>
      {/* Input handle - all nodes except start can receive connections */}
      {node.type !== 'start' && (
        <Handle
          type="target"
          position={Position.Top}
          className="!w-2 !h-2"
          style={{ 
            background: handleColor,
            border: 'none',
          }}
        />
      )}
      
      <div className={`flex flex-col gap-2 ${nodeClasses}`}>
        {/* Simple header with icon and title - left aligned */}
        <div className="flex items-start gap-2">
          <div className="mt-0.5 flex-shrink-0">
            {data.icon}
          </div>
          <div className="text-left flex-1">
            <div className="font-medium text-sm leading-tight">
              {data.node.name}
            </div>
          </div>
        </div>
        

        {/* Description if present - left aligned */}
        {data.node.description && (
          <div className="text-xs opacity-70 text-left">
            {data.node.description}
          </div>
        )}
        
        {/* Agent details for agent nodes */}
        {data.node.type === 'agent' && data.agent && (
          <div className="flex flex-col gap-1 text-left border-t border-current/10 pt-2 mt-1">
            <div className="flex items-center gap-1 text-xs">
              <User className="w-3 h-3 text-purple-500" />
              <span className="font-medium text-purple-600 dark:text-purple-400">
                {data.agent.name}
              </span>
            </div>
            {data.agent.category && (
              <span className="px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-300 text-xs rounded w-fit">
                {data.agent.category}
              </span>
            )}
          </div>
        )}

        {/* Simple metadata - left aligned */}
        <div className="flex flex-col gap-1 text-left">
          <span className="px-2 py-1 bg-current/5 rounded text-xs inline-block w-fit">
            {data.node.type}
          </span>
          {data.node.estimatedTime && (
            <div className="flex items-center gap-1 opacity-60 text-xs">
              <Clock className="w-3 h-3" />
              <span>{data.node.estimatedTime}min</span>
            </div>
          )}
        </div>
      </div>

      {/* Output handle - all nodes except end can send connections */}
      {node.type !== 'end' && (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!w-2 !h-2"
          style={{ 
            background: handleColor,
            border: 'none',
          }}
        />
      )}
    </>
  );
};

// Simple vertical layout following execution order
const calculateVerticalPositions = (nodes: any[]) => {
  return nodes.map((_node, index) => ({
    x: 400, // Center horizontally
    y: 50 + (index * 320) // Increased from 250px to 320px for more space
  }));
};

// Calculate canvas height based on workflow size
const calculateCanvasHeight = (nodeCount: number) => {
  const baseHeight = 100; // Top padding
  const nodeHeight = 160; // Estimated height per node including content
  const nodeSpacing = 320; // Vertical spacing between nodes
  const bottomPadding = 100; // Bottom padding
  
  const totalHeight = baseHeight + (nodeCount * nodeSpacing) + bottomPadding;
  
  // Minimum height to ensure good UX, maximum to prevent excessive height
  return Math.max(400, Math.min(totalHeight, 1200));
};

// Traverse workflow graph starting from start node to determine execution order
const traverseWorkflowGraph = (workflowNodes: WorkflowDSLNode[], workflowEdges: Array<{from: string, to: string}>) => {
  // Find start node
  const startNode = workflowNodes.find(node => node.type === 'start');
  if (!startNode) {
    console.warn('No start node found, falling back to original order');
    return workflowNodes;
  }

  // Build adjacency map for traversal
  const adjacencyMap = new Map<string, string[]>();
  workflowEdges.forEach(edge => {
    if (!adjacencyMap.has(edge.from)) {
      adjacencyMap.set(edge.from, []);
    }
    adjacencyMap.get(edge.from)!.push(edge.to);
  });

  // Traverse graph using BFS to maintain proper execution order
  const visited = new Set<string>();
  const orderedNodes: WorkflowDSLNode[] = [];
  const queue = [startNode.id];
  visited.add(startNode.id);

  while (queue.length > 0) {
    const currentNodeId = queue.shift()!;
    const currentNode = workflowNodes.find(n => n.id === currentNodeId);
    
    if (currentNode) {
      orderedNodes.push(currentNode);
      
      // Add connected nodes to queue
      const connectedNodes = adjacencyMap.get(currentNodeId) || [];
      connectedNodes.forEach(nodeId => {
        if (!visited.has(nodeId)) {
          visited.add(nodeId);
          queue.push(nodeId);
        }
      });
    }
  }

  // Add any unvisited nodes (shouldn't happen in well-formed workflows)
  workflowNodes.forEach(node => {
    if (!visited.has(node.id)) {
      console.warn(`Orphaned node found: ${node.id}`);
      orderedNodes.push(node);
    }
  });

  return orderedNodes;
};

// Convert workflow to React Flow format
const convertToFlowData = (workflow: WorkflowDSL | MissionWorkflow, currentNodeId?: string, agents?: Record<string, Agent>) => {
  const nodes: FlowNode[] = [];
  const edges: Edge[] = [];

  // Get nodes in proper execution order using graph traversal
  const orderedNodes = traverseWorkflowGraph(workflow.nodes, workflow.edges);

  // Calculate vertical positions following execution order
  const positions = calculateVerticalPositions(orderedNodes);

  // Create nodes with calculated positions
  orderedNodes.forEach((node, index) => {
    const isActive = node.id === currentNodeId;
    const position = positions[index] || { x: 200, y: index * 200 };
    
    // Get agent data if this is an agent node
    const agent = node.type === 'agent' && node.parameters?.agentId 
      ? agents?.[node.parameters.agentId] 
      : undefined;
    
    nodes.push({
      id: node.id,
      type: 'default',
      position: { x: position.x, y: position.y },
      data: {
        label: node.name,
        node,
        agent,
        icon: getNodeIcon(node.type),
        isActive,
      },
      style: getNodeStyle(),
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    });
  });

  // Create node ID set for validation
  const nodeIds = new Set(nodes.map(n => n.id));
  
  // Create edges with validation
  workflow.edges.forEach((edge) => {
    // Validate edge references
    if (!nodeIds.has(edge.from)) {
      console.warn(`Edge references invalid source node: ${edge.from}`);
      return;
    }
    if (!nodeIds.has(edge.to)) {
      console.warn(`Edge references invalid target node: ${edge.to}`);
      return;
    }

    edges.push({
      id: edge.id,
      source: edge.from,
      target: edge.to,
      type: 'smoothstep',
      animated: true,
      style: { 
        stroke: '#64748b', 
        strokeWidth: 3 
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: '#64748b',
        width: 20,
        height: 20,
      },
    });
  });

  console.log(`[Workflow Visualization] Converted ${nodes.length} nodes, ${edges.length} edges`);
  console.log(`[Workflow Visualization] Node IDs:`, nodes.map(n => n.id));
  console.log(`[Workflow Visualization] Edges:`, edges.map(e => `${e.source} → ${e.target}`));

  return { nodes, edges };
};

// Node types for React Flow
const nodeTypes = {
  default: CustomNode,
};

function FlowContent({ workflow, agents, currentNodeId, onNodeClick }: WorkflowVisualizationProps) {
  const { fitView } = useReactFlow();
  
  const { nodes: computedNodes, edges: computedEdges } = useMemo(
    () => convertToFlowData(workflow, currentNodeId, agents),
    [workflow, currentNodeId, agents]
  );

  // Calculate dynamic height based on number of nodes
  const canvasHeight = useMemo(() => {
    return calculateCanvasHeight(computedNodes.length);
  }, [computedNodes.length]);

  const [nodes, setNodes, onNodesChange] = useNodesState(computedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(computedEdges);

  // Update nodes and fit view when workflow changes
  React.useEffect(() => {
    setNodes(computedNodes);
    // Fit view with a small delay to ensure nodes are positioned
    setTimeout(() => {
      fitView({ padding: 0.2, duration: 300 });
    }, 50);
  }, [computedNodes, setNodes, fitView]);

  // Update edges separately when they change
  React.useEffect(() => {
    setEdges(computedEdges);
  }, [computedEdges, setEdges]);

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
    <div className="w-full border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden bg-white dark:bg-gray-900" style={{ pointerEvents: 'none', height: `${canvasHeight}px` }}>
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
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        panOnScroll={false}
        panOnDrag={false}
        zoomOnDoubleClick={false}
        preventScrolling={true}
        proOptions={{ hideAttribution: true }}
      >
        <Background 
          color="#e5e7eb" 
          gap={20} 
          size={1}
          className="dark:opacity-30"
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
  agents,
  currentNodeId,
  onNodeClick,
  className = ''
}) => {
  if (!workflow?.nodes || workflow.nodes.length === 0) {
    return (
      <div className={`h-[200px] flex items-center justify-center border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 ${className}`}>
        <p className="text-gray-400 dark:text-gray-500 text-sm">No workflow nodes to display</p>
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <div className={className}>
        <FlowContent 
          workflow={workflow} 
          agents={agents}
          currentNodeId={currentNodeId} 
          onNodeClick={onNodeClick} 
        />
      </div>
    </ReactFlowProvider>
  );
};

export default WorkflowVisualization;