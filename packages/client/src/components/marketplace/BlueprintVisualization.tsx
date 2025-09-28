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

// Custom node component
const CustomBlueprintNode: React.FC<{ data: ReactFlowNode['data'] }> = ({ data }) => {
  const colors = getNodeColors(data.type)

  return (
    <>
      {/* Input handle - all nodes except start */}
      {data.type !== 'start' && <Handle type="target" position={Position.Top} className="!w-3 !h-3 !border-2 !border-background" style={{ background: colors.handle }} />}

      <div
        className={`
        ${colors.bg} ${colors.border} ${colors.text}
        border-2 rounded-lg p-3 min-w-[200px] shadow-sm
        transition-all duration-200 hover:shadow-md
      `}
      >
        {/* Header with icon and title */}
        <div className="flex items-center gap-2 mb-2">
          <div className="flex-shrink-0">{data.icon}</div>
          <div className="font-medium text-sm leading-tight">{data.label}</div>
        </div>

        {/* Description if present */}
        {data.description && <div className="text-xs opacity-75 leading-relaxed">{data.description}</div>}

        {/* Node type badge */}
        <div className="mt-2">
          <span className="px-2 py-1 bg-current/10 rounded text-xs font-medium capitalize">{data.type.replace('_', ' ')}</span>
        </div>
      </div>

      {/* Output handle - all nodes except end */}
      {data.type !== 'end' && <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !border-2 !border-background" style={{ background: colors.handle }} />}
    </>
  )
}

// Convert blueprint to React Flow format
const convertBlueprintToFlow = (blueprint: Blueprint) => {
  const nodes: ReactFlowNode[] = []
  const edges: Edge[] = []

  // Create nodes in a simple vertical layout
  blueprint.nodes.forEach((node: BlueprintNode, index: number) => {
    const colors = getNodeColors(node.type)

    nodes.push({
      id: node.ref,
      type: 'custom',
      position: {
        x: 50 + (index % 2) * 250, // Simple 2-column layout
        y: 50 + Math.floor(index / 2) * 150,
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

  // Create edges
  blueprint.edges.forEach((edge: BlueprintEdge) => {
    const sourceColors = getNodeColors(blueprint.nodes.find((n: BlueprintNode) => n.ref === edge.from)?.type || 'default')

    edges.push({
      id: edge.ref,
      source: edge.from,
      target: edge.to,
      type: 'smoothstep',
      animated: true,
      style: {
        stroke: sourceColors.handle,
        strokeWidth: 2,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: sourceColors.handle,
        width: 16,
        height: 16,
      },
      label: edge.label,
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
