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

// Custom node component with professional design
const CustomBlueprintNode: React.FC<{ data: ReactFlowNode['data'] }> = ({ data }) => {
  const colors = getNodeColors(data.type)

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
  // Find start node
  const startNode = blueprint.nodes.find(node => node.type === 'start')
  if (!startNode) {
    throw new Error('No start node found')
  }

  // Build edge maps for navigation
  const edgeMap = new Map<string, BlueprintEdge[]>()
  blueprint.edges.forEach(edge => {
    if (!edgeMap.has(edge.from)) {
      edgeMap.set(edge.from, [])
    }
    edgeMap.get(edge.from)!.push(edge)
  })

  // Calculate execution levels following the actual execution flow
  const executionLevels = new Map<string, number>()
  const visited = new Set<string>()

  // Traverse execution path starting from start node
  const calculateExecutionLevel = (nodeRef: string, level: number = 0) => {
    if (visited.has(nodeRef)) {
      // Handle cycles - don't increase level for revisited nodes
      return
    }

    visited.add(nodeRef)
    executionLevels.set(nodeRef, level)

    const outgoingEdges = edgeMap.get(nodeRef) || []
    outgoingEdges.forEach(edge => {
      calculateExecutionLevel(edge.to, level + 1)
    })
  }

  calculateExecutionLevel(startNode.ref)

  // Group nodes by execution level
  const nodesByLevel = new Map<number, BlueprintNode[]>()
  blueprint.nodes.forEach(node => {
    const level = executionLevels.get(node.ref) ?? 0
    if (!nodesByLevel.has(level)) {
      nodesByLevel.set(level, [])
    }
    nodesByLevel.get(level)!.push(node)
  })

  // Position nodes based on execution levels (vertical layout)
  const layoutedNodes = nodes.map(node => {
    const level = executionLevels.get(node.id) ?? 0
    const nodesAtLevel = nodesByLevel.get(level) || []
    const indexAtLevel = nodesAtLevel.findIndex(n => n.ref === node.id)
    const totalAtLevel = nodesAtLevel.length

    // Vertical positioning
    const y = level * 150 + 50 // Vertical spacing between execution levels

    // Horizontal distribution for nodes at same level
    let x = 250 // Default center position
    if (totalAtLevel > 1) {
      const spacing = Math.min(200, 600 / totalAtLevel)
      x = (indexAtLevel - (totalAtLevel - 1) / 2) * spacing + 250
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
    },
    style: {
      background: 'transparent',
      border: 'none',
    },
  }))

  // Create edges with improved styling for vertical layout
  const initialEdges: Edge[] = blueprint.edges.map((edge: BlueprintEdge) => ({
    id: edge.ref,
    source: edge.from,
    target: edge.to,
    type: 'smoothstep',
    animated: false,
    style: {
      stroke: '#9ca3af',
      strokeWidth: 2,
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: '#9ca3af',
      width: 16,
      height: 16,
    },
    label: edge.label,
    labelStyle: {
      fontSize: '12px',
      fontWeight: 500,
      fill: '#6b7280',
      background: 'rgba(255, 255, 255, 0.9)',
      padding: '4px 8px',
      borderRadius: '4px',
      border: '1px solid #e5e7eb',
    },
    labelBgStyle: {
      fill: 'rgba(255, 255, 255, 0.9)',
      fillOpacity: 0.95,
      rx: 4,
      ry: 4,
    },
  }))

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
