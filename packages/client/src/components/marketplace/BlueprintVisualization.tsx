'use client'

import React, { useMemo } from 'react'
import { ReactFlow, Node, Edge, Background, ReactFlowProvider, MarkerType, Position, Handle, BackgroundVariant } from '@xyflow/react'
import { Play, CheckCircle2, Zap, User, AlertTriangle, Eye, Clock, Code, Globe, Settings, GitBranch, Database } from 'lucide-react'
import type { Blueprint, Edge as BlueprintEdge, Node as BlueprintNode } from '@starships/autopilot'

interface BlueprintVisualizationProps {
  blueprint: Blueprint
  className?: string
}

interface ReactFlowNode extends Node {
  data: {
    label: string
    type: string
    description?: string
    icon: React.ReactNode
    outgoingEdges?: BlueprintEdge[]
  }
}

// Get icon for node type with updated mapping
const getNodeIcon = (nodeType: string) => {
  switch (nodeType) {
    case 'start':
      return <Play className="w-4 h-4" />
    case 'end':
      return <CheckCircle2 className="w-4 h-4" />
    case 'agent':
      return <Zap className="w-4 h-4" />
    case 'user_prompt':
      return <User className="w-4 h-4" />
    case 'conditional':
      return <AlertTriangle className="w-4 h-4" />
    case 'output':
      return <Eye className="w-4 h-4" />
    case 'llm':
      return <Zap className="w-4 h-4" />
    case 'http_request':
      return <Globe className="w-4 h-4" />
    case 'code':
      return <Code className="w-4 h-4" />
    case 'tool':
      return <Settings className="w-4 h-4" />
    case 'workflow':
      return <GitBranch className="w-4 h-4" />
    case 'transform':
    case 'mutate':
      return <Database className="w-4 h-4" />
    default:
      return <Clock className="w-4 h-4" />
  }
}

// Get color scheme for node type
const getNodeColors = (nodeType: string) => {
  const colorSchemes = {
    start: {
      bg: 'bg-green-50 dark:bg-green-950/30',
      border: 'border-green-300 dark:border-green-700',
      text: 'text-green-700 dark:text-green-300',
      handle: '#22c55e',
    },
    end: {
      bg: 'bg-blue-50 dark:bg-blue-950/30',
      border: 'border-blue-300 dark:border-blue-700',
      text: 'text-blue-700 dark:text-blue-300',
      handle: '#3b82f6',
    },
    agent: {
      bg: 'bg-purple-50 dark:bg-purple-950/30',
      border: 'border-purple-300 dark:border-purple-700',
      text: 'text-purple-700 dark:text-purple-300',
      handle: '#a855f7',
    },
    llm: {
      bg: 'bg-purple-50 dark:bg-purple-950/30',
      border: 'border-purple-300 dark:border-purple-700',
      text: 'text-purple-700 dark:text-purple-300',
      handle: '#a855f7',
    },
    user_prompt: {
      bg: 'bg-amber-50 dark:bg-amber-950/30',
      border: 'border-amber-300 dark:border-amber-700',
      text: 'text-amber-700 dark:text-amber-300',
      handle: '#f59e0b',
    },
    conditional: {
      bg: 'bg-orange-50 dark:bg-orange-950/30',
      border: 'border-orange-300 dark:border-orange-700',
      text: 'text-orange-700 dark:text-orange-300',
      handle: '#f97316',
    },
    output: {
      bg: 'bg-indigo-50 dark:bg-indigo-950/30',
      border: 'border-indigo-300 dark:border-indigo-700',
      text: 'text-indigo-700 dark:text-indigo-300',
      handle: '#6366f1',
    },
    http_request: {
      bg: 'bg-cyan-50 dark:bg-cyan-950/30',
      border: 'border-cyan-300 dark:border-cyan-700',
      text: 'text-cyan-700 dark:text-cyan-300',
      handle: '#06b6d4',
    },
    code: {
      bg: 'bg-slate-50 dark:bg-slate-950/30',
      border: 'border-slate-300 dark:border-slate-700',
      text: 'text-slate-700 dark:text-slate-300',
      handle: '#64748b',
    },
    tool: {
      bg: 'bg-emerald-50 dark:bg-emerald-950/30',
      border: 'border-emerald-300 dark:border-emerald-700',
      text: 'text-emerald-700 dark:text-emerald-300',
      handle: '#10b981',
    },
    workflow: {
      bg: 'bg-rose-50 dark:bg-rose-950/30',
      border: 'border-rose-300 dark:border-rose-700',
      text: 'text-rose-700 dark:text-rose-300',
      handle: '#f43f5e',
    },
    transform: {
      bg: 'bg-teal-50 dark:bg-teal-950/30',
      border: 'border-teal-300 dark:border-teal-700',
      text: 'text-teal-700 dark:text-teal-300',
      handle: '#14b8a6',
    },
    mutate: {
      bg: 'bg-teal-50 dark:bg-teal-950/30',
      border: 'border-teal-300 dark:border-teal-700',
      text: 'text-teal-700 dark:text-teal-300',
      handle: '#14b8a6',
    },
    default: {
      bg: 'bg-gray-50 dark:bg-gray-950/30',
      border: 'border-gray-300 dark:border-gray-700',
      text: 'text-gray-700 dark:text-gray-300',
      handle: '#64748b',
    },
  }
  return colorSchemes[nodeType as keyof typeof colorSchemes] || colorSchemes.default
}

// Custom conditional node component with horizontal sections for each output
const CustomConditionalNode: React.FC<{ data: ReactFlowNode['data'] & { outgoingEdges?: BlueprintEdge[] } }> = ({ data }) => {
  const colors = getNodeColors(data.type)
  const edges = data.outgoingEdges || []

  return (
    <>
      {/* Input handle */}
      <Handle type="target" position={Position.Top} className="!w-3 !h-3 !border-2 !border-white !bg-gray-500 hover:!bg-gray-700 !rounded-full !shadow-sm" style={{ top: -6 }} />

      <div className="relative">
        {/* Main node body */}
        <div
          className={`
            relative flex items-center gap-3 px-4 py-3 min-w-[180px] max-w-[220px]
            bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-600
            rounded-xl shadow-lg hover:shadow-xl transition-all duration-300
            text-gray-900 dark:text-gray-100 cursor-pointer hover:border-gray-300
          `}
        >
          {/* Circular icon container */}
          <div
            className="flex items-center justify-center w-10 h-10 rounded-full flex-shrink-0 shadow-sm"
            style={{
              backgroundColor: colors.handle + '15',
              color: colors.handle,
              border: `2px solid ${colors.handle}30`,
            }}
          >
            <div className="w-5 h-5">{data.icon}</div>
          </div>

          {/* Node content */}
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate leading-tight">{data.label}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 capitalize font-medium mt-0.5">{data.type.replace('_', ' ')}</div>
          </div>
        </div>

        {/* Horizontal conditional sections at the bottom */}
        {edges.length > 1 && (
          <div className="flex mt-1">
            {edges.map((edge, index) => (
              <div
                key={edge.ref}
                className="relative bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-b-md px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 mr-1 last:mr-0"
                style={{ minWidth: '60px' }}
              >
                <div className="truncate text-center">{edge.label || `Branch ${index + 1}`}</div>
                {/* Individual output handle for this branch */}
                <Handle
                  type="source"
                  position={Position.Bottom}
                  id={edge.ref}
                  className="!w-2.5 !h-2.5 !border-2 !border-white !bg-gray-500 hover:!bg-gray-700 !rounded-full !shadow-sm"
                  style={{
                    bottom: -5,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    position: 'absolute',
                  }}
                />
              </div>
            ))}
          </div>
        )}

        {/* Single output handle for nodes with only one output */}
        {edges.length <= 1 && (
          <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !border-2 !border-white !bg-gray-500 hover:!bg-gray-700 !rounded-full !shadow-sm" style={{ bottom: -6 }} />
        )}
      </div>
    </>
  )
}

// Custom node component with professional design
const CustomBlueprintNode: React.FC<{ data: ReactFlowNode['data'] & { outgoingEdges?: BlueprintEdge[] } }> = ({ data }) => {
  const colors = getNodeColors(data.type)

  // Use conditional node for nodes with multiple outputs
  if (data.type === 'conditional' && data.outgoingEdges && data.outgoingEdges.length > 1) {
    return <CustomConditionalNode data={data} />
  }

  return (
    <>
      {/* Input handle - all nodes except start (vertical layout: top) */}
      {data.type !== 'start' && (
        <Handle type="target" position={Position.Top} className="!w-3 !h-3 !border-2 !border-white !bg-gray-500 hover:!bg-gray-700 !rounded-full !shadow-sm" style={{ top: -6 }} />
      )}

      <div
        className={`
          relative flex items-center gap-3 px-4 py-3 min-w-[180px] max-w-[220px]
          bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-600
          rounded-xl shadow-lg hover:shadow-xl transition-all duration-300
          text-gray-900 dark:text-gray-100 cursor-pointer hover:border-gray-300
        `}
      >
        {/* Circular icon container with better styling */}
        <div
          className="flex items-center justify-center w-10 h-10 rounded-full flex-shrink-0 shadow-sm"
          style={{
            backgroundColor: colors.handle + '15',
            color: colors.handle,
            border: `2px solid ${colors.handle}30`,
          }}
        >
          <div className="w-5 h-5">{data.icon}</div>
        </div>

        {/* Node content with better typography */}
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate leading-tight">{data.label}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 capitalize font-medium mt-0.5">{data.type.replace('_', ' ')}</div>
        </div>
      </div>

      {/* Output handle - all nodes except end (vertical layout: bottom) */}
      {data.type !== 'end' && (
        <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !border-2 !border-white !bg-gray-500 hover:!bg-gray-700 !rounded-full !shadow-sm" style={{ bottom: -6 }} />
      )}
    </>
  )
}

// Create execution-order based layout (vertical workflow)
const getExecutionOrderLayout = (nodes: ReactFlowNode[], edges: Edge[], blueprint: Blueprint) => {
  // Find start and end nodes
  const startNode = blueprint.nodes.find(node => node.type === 'start')
  const endNodes = blueprint.nodes.filter(node => node.type === 'end')

  if (!startNode) {
    throw new Error('No start node found')
  }

  // Build edge maps for navigation
  const edgeMap = new Map<string, BlueprintEdge[]>()
  const incomingEdgeMap = new Map<string, BlueprintEdge[]>()

  blueprint.edges.forEach(edge => {
    // Outgoing edges
    if (!edgeMap.has(edge.from)) {
      edgeMap.set(edge.from, [])
    }
    edgeMap.get(edge.from)!.push(edge)

    // Incoming edges
    if (!incomingEdgeMap.has(edge.to)) {
      incomingEdgeMap.set(edge.to, [])
    }
    incomingEdgeMap.get(edge.to)!.push(edge)
  })

  // Calculate execution levels with proper cycle and end node handling
  const executionLevels = new Map<string, number>()
  const processing = new Set<string>()
  const processed = new Set<string>()

  // Modified DFS that handles cycles and ensures end nodes are positioned last
  const calculateExecutionLevel = (nodeRef: string, currentLevel: number = 0): number => {
    // If already processed, return the stored level
    if (processed.has(nodeRef)) {
      return executionLevels.get(nodeRef) ?? currentLevel
    }

    // If currently processing (cycle detected), don't recurse further
    if (processing.has(nodeRef)) {
      return currentLevel
    }

    processing.add(nodeRef)

    // Set initial level
    let maxLevel = currentLevel
    executionLevels.set(nodeRef, maxLevel)

    // Process all outgoing edges
    const outgoingEdges = edgeMap.get(nodeRef) || []
    for (const edge of outgoingEdges) {
      const childLevel = calculateExecutionLevel(edge.to, maxLevel + 1)
      // Update our level if child requires higher level
      if (childLevel > maxLevel) {
        maxLevel = Math.max(maxLevel, childLevel - 1)
      }
    }

    // Update the level if it changed
    if (maxLevel > currentLevel) {
      executionLevels.set(nodeRef, maxLevel)
    }

    processing.delete(nodeRef)
    processed.add(nodeRef)

    return executionLevels.get(nodeRef) ?? currentLevel
  }

  // Start traversal from start node
  calculateExecutionLevel(startNode.ref, 0)

  // Ensure all nodes are processed (handle disconnected components)
  blueprint.nodes.forEach(node => {
    if (!processed.has(node.ref)) {
      calculateExecutionLevel(node.ref, 0)
    }
  })

  // Special handling for end nodes - ensure they're at the bottom
  const maxLevel = Math.max(...Array.from(executionLevels.values()))
  endNodes.forEach(endNode => {
    executionLevels.set(endNode.ref, maxLevel + 1)
  })

  // Group nodes by execution level
  const nodesByLevel = new Map<number, BlueprintNode[]>()
  blueprint.nodes.forEach(node => {
    const level = executionLevels.get(node.ref) ?? 0
    if (!nodesByLevel.has(level)) {
      nodesByLevel.set(level, [])
    }
    nodesByLevel.get(level)!.push(node)
  })

  // Position nodes to minimize edge crossings
  const layoutedNodes = nodes.map(node => {
    const level = executionLevels.get(node.id) ?? 0
    const nodesAtLevel = nodesByLevel.get(level) || []

    // Sort nodes at same level to minimize crossings
    const sortedNodes = [...nodesAtLevel].sort((a, b) => {
      // Prioritize nodes with incoming edges from left side
      const aIncoming = incomingEdgeMap.get(a.ref) || []
      const bIncoming = incomingEdgeMap.get(b.ref) || []

      if (aIncoming.length !== bIncoming.length) {
        return aIncoming.length - bIncoming.length
      }

      // Secondary sort by node type priority
      const typePriority = {
        start: 0,
        llm: 1,
        agent: 1,
        conditional: 2,
        code: 3,
        tool: 3,
        http_request: 3,
        transform: 4,
        mutate: 4,
        end: 5,
      }

      const aPriority = typePriority[a.type as keyof typeof typePriority] ?? 6
      const bPriority = typePriority[b.type as keyof typeof typePriority] ?? 6

      return aPriority - bPriority
    })

    const indexAtLevel = sortedNodes.findIndex(n => n.ref === node.id)
    const totalAtLevel = sortedNodes.length

    // Vertical positioning with more spacing
    const y = level * 180 + 60

    // Horizontal distribution for nodes at same level
    let x = 400 // Increased center position
    if (totalAtLevel > 1) {
      const spacing = Math.min(300, 800 / totalAtLevel) // Increased spacing
      x = (indexAtLevel - (totalAtLevel - 1) / 2) * spacing + 400
    }

    return {
      ...node,
      position: { x, y },
    }
  })

  return { nodes: layoutedNodes, edges }
}

// Convert blueprint to React Flow format with execution-aware layout
const convertBlueprintToFlow = (blueprint: Blueprint) => {
  if (!blueprint.nodes || blueprint.nodes.length === 0) {
    return { nodes: [], edges: [] }
  }

  // Build outgoing edges map for conditional nodes
  const outgoingEdgesMap = new Map<string, BlueprintEdge[]>()
  blueprint.edges.forEach(edge => {
    if (!outgoingEdgesMap.has(edge.from)) {
      outgoingEdgesMap.set(edge.from, [])
    }
    outgoingEdgesMap.get(edge.from)!.push(edge)
  })

  // Create initial nodes without positioning
  const initialNodes: ReactFlowNode[] = blueprint.nodes.map((node: BlueprintNode) => ({
    id: node.ref,
    type: 'custom',
    position: { x: 0, y: 0 }, // Will be overridden by layout
    data: {
      label: node.name,
      type: node.type,
      description: node.description,
      icon: getNodeIcon(node.type),
      outgoingEdges: outgoingEdgesMap.get(node.ref) || [],
    },
    style: {
      background: 'transparent',
      border: 'none',
    },
  }))

  // Create edges with curved styling for clean appearance
  const initialEdges: Edge[] = blueprint.edges.map((edge: BlueprintEdge) => {
    const sourceNode = blueprint.nodes.find(n => n.ref === edge.from)
    const isConditionalEdge = sourceNode?.type === 'conditional' && (outgoingEdgesMap.get(edge.from)?.length || 0) > 1

    return {
      id: edge.ref,
      source: edge.from,
      target: edge.to,
      sourceHandle: isConditionalEdge ? edge.ref : undefined, // Use edge ref as handle ID for conditional branches
      type: 'default', // Default curved edges
      animated: false,
      style: {
        stroke: '#64748b',
        strokeWidth: 2,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: '#64748b',
        width: 16,
        height: 16,
      },
      label: edge.label,
      labelStyle: {
        fontSize: '11px',
        fontWeight: 500,
        fill: '#475569',
        background: 'rgba(255, 255, 255, 0.95)',
        padding: '3px 6px',
        borderRadius: '4px',
        border: '1px solid #cbd5e1',
      },
      labelBgStyle: {
        fill: 'rgba(255, 255, 255, 0.95)',
        fillOpacity: 0.98,
        rx: 4,
        ry: 4,
      },
    }
  })

  // Apply execution-order layout
  return getExecutionOrderLayout(initialNodes, initialEdges, blueprint)
}

// Node types for React Flow
const nodeTypes = {
  custom: CustomBlueprintNode,
}

function BlueprintFlow({ blueprint }: { blueprint: Blueprint }) {
  const { nodes, edges } = useMemo(() => convertBlueprintToFlow(blueprint), [blueprint])

  return (
    <div className="h-full w-full border border-muted-foreground/20 rounded-lg overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{
          padding: 0.2,
          minZoom: 0.5,
          maxZoom: 1.2,
          includeHiddenNodes: true,
        }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
        selectNodesOnDrag={false}
        zoomOnScroll={true}
        zoomOnPinch={true}
        panOnScroll={true}
        panOnDrag={true}
        zoomOnDoubleClick={true}
        preventScrolling={false}
        proOptions={{ hideAttribution: true }}
        defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
      >
        <Background color="#9ca3af" gap={24} size={1.2} className="opacity-20 dark:opacity-10" variant={BackgroundVariant.Dots} />
      </ReactFlow>
    </div>
  )
}

export function BlueprintVisualization({ blueprint, className = '' }: BlueprintVisualizationProps) {
  if (!blueprint?.nodes || blueprint.nodes.length === 0) {
    return (
      <div className={`h-[200px] flex items-center justify-center border border-muted-foreground/20 rounded-lg bg-muted/10 ${className}`}>
        <p className="text-muted-foreground text-sm">No blueprint nodes to display</p>
      </div>
    )
  }

  return (
    <ReactFlowProvider>
      <div className={className}>
        <BlueprintFlow blueprint={blueprint} />
      </div>
    </ReactFlowProvider>
  )
}

export default BlueprintVisualization
