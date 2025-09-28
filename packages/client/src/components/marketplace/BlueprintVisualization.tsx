'use client'

import React, { useMemo } from 'react'
import { ReactFlow, Node, Edge, Background, ReactFlowProvider, MarkerType, Position, Handle } from '@xyflow/react'
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

// Custom node component with n8n-style design
const CustomBlueprintNode: React.FC<{ data: ReactFlowNode['data'] }> = ({ data }) => {
  const colors = getNodeColors(data.type)

  return (
    <>
      {/* Input handle - all nodes except start */}
      {data.type !== 'start' && <Handle type="target" position={Position.Left} className="!w-2 !h-2 !border-0 !bg-gray-400 hover:!bg-gray-600 !rounded-full" />}

      <div
        className={`
        relative flex items-center gap-3 px-4 py-2 min-w-[160px] max-w-[200px]
        bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700
        rounded-lg shadow-sm hover:shadow-md transition-all duration-200
        text-gray-900 dark:text-gray-100
      `}
      >
        {/* Circular icon container */}
        <div className="flex items-center justify-center w-8 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: colors.handle + '20', color: colors.handle }}>
          <div className="w-4 h-4">{data.icon}</div>
        </div>

        {/* Node content */}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">{data.label}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 capitalize">{data.type.replace('_', ' ')}</div>
        </div>
      </div>

      {/* Output handle - all nodes except end */}
      {data.type !== 'end' && <Handle type="source" position={Position.Right} className="!w-2 !h-2 !border-0 !bg-gray-400 hover:!bg-gray-600 !rounded-full" />}
    </>
  )
}

// Convert blueprint to React Flow format with hierarchical layout
const convertBlueprintToFlow = (blueprint: Blueprint) => {
  const nodes: ReactFlowNode[] = []
  const edges: Edge[] = []

  // Build adjacency map for layout calculation
  const adjacencyMap = new Map<string, string[]>()
  const incomingEdges = new Map<string, string[]>()

  blueprint.edges.forEach((edge: BlueprintEdge) => {
    if (!adjacencyMap.has(edge.from)) {
      adjacencyMap.set(edge.from, [])
    }
    adjacencyMap.get(edge.from)!.push(edge.to)

    if (!incomingEdges.has(edge.to)) {
      incomingEdges.set(edge.to, [])
    }
    incomingEdges.get(edge.to)!.push(edge.from)
  })

  // Find start nodes (nodes with no incoming edges)
  const startNodes = blueprint.nodes.filter(node => !incomingEdges.has(node.ref))

  // Calculate node levels using BFS-like approach
  const nodeLevels = new Map<string, number>()
  const visited = new Set<string>()

  const calculateLevels = (nodeRefs: string[], level: number) => {
    const nextLevel: string[] = []

    nodeRefs.forEach(nodeRef => {
      if (!visited.has(nodeRef)) {
        visited.add(nodeRef)
        nodeLevels.set(nodeRef, level)

        const children = adjacencyMap.get(nodeRef) || []
        nextLevel.push(...children)
      }
    })

    if (nextLevel.length > 0) {
      calculateLevels(nextLevel, level + 1)
    }
  }

  // Start level calculation from start nodes
  if (startNodes.length > 0) {
    calculateLevels(
      startNodes.map(n => n.ref),
      0
    )
  }

  // Handle any remaining unvisited nodes (isolated nodes)
  blueprint.nodes.forEach(node => {
    if (!nodeLevels.has(node.ref)) {
      nodeLevels.set(node.ref, 0)
    }
  })

  // Group nodes by level for positioning
  const nodesByLevel = new Map<number, BlueprintNode[]>()
  blueprint.nodes.forEach(node => {
    const level = nodeLevels.get(node.ref) || 0
    if (!nodesByLevel.has(level)) {
      nodesByLevel.set(level, [])
    }
    nodesByLevel.get(level)!.push(node)
  })

  // Create nodes with horizontal positioning (n8n style)
  blueprint.nodes.forEach((node: BlueprintNode) => {
    const level = nodeLevels.get(node.ref) || 0
    const nodesAtLevel = nodesByLevel.get(level) || []
    const indexAtLevel = nodesAtLevel.indexOf(node)
    const totalAtLevel = nodesAtLevel.length

    // Calculate horizontal position (left to right flow)
    const levelHeight = Math.max(totalAtLevel * 180, 200) // Minimum height per level
    const nodeSpacing = levelHeight / Math.max(totalAtLevel, 1)
    const startY = -levelHeight / 2 + nodeSpacing / 2

    nodes.push({
      id: node.ref,
      type: 'custom',
      position: {
        x: level * 300 + 50, // Horizontal spacing between levels
        y: startY + indexAtLevel * nodeSpacing,
      },
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
    })
  })

  // Create edges with n8n-style appearance
  blueprint.edges.forEach((edge: BlueprintEdge) => {
    edges.push({
      id: edge.ref,
      source: edge.from,
      target: edge.to,
      type: 'smoothstep',
      animated: false,
      style: {
        stroke: '#9ca3af', // Gray-400 for subtle connections
        strokeWidth: 1.5,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: '#9ca3af',
        width: 12,
        height: 12,
      },
      label: edge.label,
      labelStyle: {
        fontSize: '11px',
        fontWeight: 500,
        fill: '#6b7280',
        background: 'transparent',
      },
      labelBgStyle: {
        fill: 'transparent',
      },
    })
  })

  return { nodes, edges }
}

// Node types for React Flow
const nodeTypes = {
  custom: CustomBlueprintNode,
}

function BlueprintFlow({ blueprint }: { blueprint: Blueprint }) {
  const { nodes, edges } = useMemo(() => convertBlueprintToFlow(blueprint), [blueprint])

  return (
    <div className="h-full w-full border border-muted-foreground/20 rounded-lg overflow-hidden bg-background">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{
          padding: 0.1,
          minZoom: 0.3,
          maxZoom: 2.0,
        }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnScroll={true}
        zoomOnPinch={true}
        panOnScroll={true}
        panOnDrag={true}
        zoomOnDoubleClick={true}
        preventScrolling={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="hsl(var(--muted-foreground))" gap={20} size={1} className="opacity-30" />
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
