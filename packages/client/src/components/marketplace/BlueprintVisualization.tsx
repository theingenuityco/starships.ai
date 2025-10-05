'use client'

import React, { useMemo } from 'react'
import { ReactFlow, Node, Edge, Background, ReactFlowProvider, MarkerType, Position, Handle, BackgroundVariant, EdgeProps, BaseEdge, Panel } from '@xyflow/react'
import { Play, CheckCircle2, Zap, User, AlertTriangle, Eye, Clock, Code, Globe, Settings, GitBranch, Database, Wrench } from 'lucide-react'
import type { Blueprint, Edge as BlueprintEdge, Node as BlueprintNode } from '@starships/autopilot'

interface BlueprintVisualizationProps {
  blueprint: Blueprint
  className?: string
  transparent?: boolean
  title?: string
}

interface ReactFlowNode extends Node {
  data: {
    label: string
    type: string
    description?: string
    nodeType: string // Store node type instead of icon element
    outgoingEdges?: BlueprintEdge[]
  }
}

// Get icon component for node type
const NodeIcon: React.FC<{ nodeType: string }> = React.memo(({ nodeType }) => {
  const className = 'w-4 h-4'
  switch (nodeType) {
    case 'start':
      return <Play className={className} />
    case 'end':
      return <CheckCircle2 className={className} />
    case 'agent':
      return <Zap className={className} />
    case 'user_prompt':
      return <User className={className} />
    case 'conditional':
      return <AlertTriangle className={className} />
    case 'output':
      return <Eye className={className} />
    case 'llm':
      return <Zap className={className} />
    case 'http_request':
      return <Globe className={className} />
    case 'code':
      return <Code className={className} />
    case 'tool':
      return <Settings className={className} />
    case 'workflow':
      return <GitBranch className={className} />
    case 'transform':
    case 'mutate':
      return <Database className={className} />
    default:
      return <Clock className={className} />
  }
})

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

// Intelligent edge routing with obstacle avoidance
interface Point {
  x: number
  y: number
}

interface Rectangle {
  x: number
  y: number
  width: number
  height: number
}

// Check if a point is inside or near a rectangle
const isPointNearRectangle = (point: Point, rect: Rectangle, padding: number = 30): boolean => {
  return point.x >= rect.x - padding && point.x <= rect.x + rect.width + padding && point.y >= rect.y - padding && point.y <= rect.y + rect.height + padding
}

// Calculate intelligent control points for bezier curve that avoids obstacles
const calculateIntelligentBezierPath = (sourceX: number, sourceY: number, targetX: number, targetY: number, obstacles: Rectangle[]): string => {
  const dx = targetX - sourceX
  const dy = targetY - sourceY
  const distance = Math.sqrt(dx * dx + dy * dy)

  // Default control points for straight bezier
  let cp1x = sourceX + dx * 0.5
  let cp1y = sourceY + dy * 0.2
  let cp2x = targetX - dx * 0.5
  let cp2y = targetY - dy * 0.2

  // Find obstacles that intersect with our path
  const pathBounds = {
    minX: Math.min(sourceX, targetX) - 50,
    maxX: Math.max(sourceX, targetX) + 50,
    minY: Math.min(sourceY, targetY) - 50,
    maxY: Math.max(sourceY, targetY) + 50,
  }

  const relevantObstacles = obstacles.filter(obstacle => {
    const obstacleRight = obstacle.x + obstacle.width
    const obstacleBottom = obstacle.y + obstacle.height

    return !(obstacleRight < pathBounds.minX || obstacle.x > pathBounds.maxX || obstacleBottom < pathBounds.minY || obstacle.y > pathBounds.maxY)
  })

  // For each relevant obstacle, adjust control points to route around it
  for (const obstacle of relevantObstacles) {
    const obstacleCenterX = obstacle.x + obstacle.width / 2
    const obstacleCenterY = obstacle.y + obstacle.height / 2

    // Vector from source to obstacle center
    const toObstacleX = obstacleCenterX - sourceX
    const toObstacleY = obstacleCenterY - sourceY

    // Cross product to determine which side of the path the obstacle is on
    const crossProduct = dx * toObstacleY - dy * toObstacleX

    // Determine offset direction (perpendicular to path direction)
    const perpX = -dy / distance
    const perpY = dx / distance

    // Calculate offset amount based on obstacle size and distance
    const obstacleSize = Math.max(obstacle.width, obstacle.height)
    const offsetAmount = crossProduct > 0 ? -(obstacleSize + 60) : obstacleSize + 60

    // Check if our default control points are too close to the obstacle
    const cp1Near = isPointNearRectangle({ x: cp1x, y: cp1y }, obstacle, 40)
    const cp2Near = isPointNearRectangle({ x: cp2x, y: cp2y }, obstacle, 40)

    if (cp1Near || cp2Near) {
      // Adjust control points to curve around the obstacle
      cp1x = sourceX + dx * 0.3 + perpX * offsetAmount * 0.7
      cp1y = sourceY + dy * 0.3 + perpY * offsetAmount * 0.7
      cp2x = targetX - dx * 0.3 + perpX * offsetAmount * 0.7
      cp2y = targetY - dy * 0.3 + perpY * offsetAmount * 0.7
    }
  }

  // Generate smooth cubic bezier path
  return `M ${sourceX} ${sourceY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${targetX} ${targetY}`
}

// Custom intelligent edge component
const IntelligentEdge: React.FC<EdgeProps> = ({ id, sourceX, sourceY, targetX, targetY, style = {}, markerEnd, label, data }) => {
  const obstacles: Rectangle[] = (data?.obstacles as Rectangle[]) || []

  // Calculate intelligent path that routes around obstacles
  const pathData = calculateIntelligentBezierPath(sourceX, sourceY, targetX, targetY, obstacles)

  // Calculate label position (approximate midpoint of bezier curve)
  const labelX = (sourceX + targetX) / 2
  const labelY = (sourceY + targetY) / 2

  return (
    <>
      <path
        id={id}
        d={pathData}
        style={{
          ...style,
          fill: 'none',
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }}
        className="react-flow__edge-path"
        markerEnd={markerEnd}
      />
      {label && (
        <text
          x={labelX}
          y={labelY}
          textAnchor="middle"
          dominantBaseline="central"
          className="react-flow__edge-text"
          style={{
            fontSize: '11px',
            fontWeight: 500,
            fill: '#475569',
            pointerEvents: 'none',
          }}
        >
          <tspan
            x={labelX}
            y={labelY}
            style={{
              fill: 'rgba(255, 255, 255, 0.95)',
              stroke: 'rgba(255, 255, 255, 0.95)',
              strokeWidth: 3,
              paintOrder: 'stroke',
            }}
          >
            {label}
          </tspan>
          <tspan x={labelX} y={labelY}>
            {label}
          </tspan>
        </text>
      )}
    </>
  )
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
            <div className="w-5 h-5">
              <NodeIcon nodeType={data.nodeType} />
            </div>
          </div>

          {/* Node content */}
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate leading-tight">{data.label}</div>
            {data.type && <div className="text-xs text-gray-500 dark:text-gray-400 capitalize font-medium mt-0.5">{data.type.replace('_', ' ')}</div>}
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
          <div className="w-5 h-5">
            <NodeIcon nodeType={data.nodeType} />
          </div>
        </div>

        {/* Node content with better typography */}
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate leading-tight">{data.label}</div>
          {data.type && <div className="text-xs text-gray-500 dark:text-gray-400 capitalize font-medium mt-0.5">{data.type.replace('_', ' ')}</div>}
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

  // Handle incomplete blueprints during streaming - no start node yet
  if (!startNode) {
    // Return simple layout without execution order
    return {
      nodes: nodes.map((node, index) => ({
        ...node,
        position: { x: 600, y: index * 200 + 120 },
      })),
      edges,
    }
  }

  // Build edge maps for navigation
  const edgeMap = new Map<string, BlueprintEdge[]>()
  const incomingEdgeMap = new Map<string, BlueprintEdge[]>()

  // Safely handle edges - may be undefined during streaming
  const blueprintEdges = blueprint.edges || []

  blueprintEdges.forEach(edge => {
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

  // Position nodes to minimize edge crossings with extra wide spacing
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
    const y = level * 350 + 120

    // Horizontal distribution - extra wide to allow curves
    let x = 600 // Center position
    if (totalAtLevel > 1) {
      const spacing = Math.max(600, 1400 / totalAtLevel) // Very wide spacing
      x = (indexAtLevel - (totalAtLevel - 1) / 2) * spacing + 600
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

  // Safely handle edges - may be undefined during streaming
  const blueprintEdges = blueprint.edges || []

  // Build outgoing edges map for conditional nodes
  const outgoingEdgesMap = new Map<string, BlueprintEdge[]>()
  blueprintEdges.forEach(edge => {
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
      nodeType: node.type, // Store node type instead of icon element
      outgoingEdges: outgoingEdgesMap.get(node.ref) || [],
    },
    style: {
      background: 'transparent',
      border: 'none',
    },
  }))

  // First apply layout to get node positions
  const layoutResult = getExecutionOrderLayout(initialNodes, [], blueprint)

  // Create obstacles array from positioned nodes
  const obstacles: Rectangle[] = layoutResult.nodes.map(node => ({
    x: node.position.x - 110, // Node width/2 + padding
    y: node.position.y - 25, // Node height/2 + padding
    width: 220, // Node width + padding
    height: 50, // Node height + padding
  }))

  // Create edges with intelligent routing around nodes
  const intelligentEdges: Edge[] = blueprintEdges.map((edge: BlueprintEdge) => {
    const sourceNode = blueprint.nodes.find(n => n.ref === edge.from)
    const targetNode = blueprint.nodes.find(n => n.ref === edge.to)
    const isConditionalEdge = sourceNode?.type === 'conditional' && (outgoingEdgesMap.get(edge.from)?.length || 0) > 1

    return {
      id: edge.ref,
      source: edge.from,
      target: edge.to,
      sourceHandle: isConditionalEdge ? edge.ref : undefined,
      type: 'intelligent', // Use custom intelligent edge for obstacle avoidance
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
      data: {
        obstacles: obstacles,
      },
    }
  })

  // Return layout with intelligent edges
  return { nodes: layoutResult.nodes, edges: intelligentEdges }
}

// Node and edge types for React Flow
const nodeTypes = {
  custom: CustomBlueprintNode,
}

const edgeTypes = {
  intelligent: IntelligentEdge,
}

function BlueprintFlow({ blueprint, transparent, title }: { blueprint: Blueprint; transparent?: boolean; title?: string }) {
  const { nodes, edges } = useMemo(() => convertBlueprintToFlow(blueprint), [blueprint])

  return (
    <div
      className={`h-full w-full border border-muted-foreground/20 rounded-lg overflow-hidden ${transparent ? 'bg-transparent' : 'bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800'}`}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{
          padding: 0.2,
          minZoom: 0.4,
          maxZoom: 1.0,
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
        defaultViewport={{ x: 0, y: 0, zoom: 0.6 }}
      >
        <Background color="#9ca3af" gap={24} size={1.2} className="opacity-20 dark:opacity-10" variant={BackgroundVariant.Dots} />
        {title && (
          <Panel position="top-left" className="m-4">
            <div className="flex items-center gap-2 px-4 py-2 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg">
              <Wrench className="w-5 h-5 text-primary" />
              <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">{title}</span>
            </div>
          </Panel>
        )}
      </ReactFlow>
    </div>
  )
}

export function BlueprintVisualization({ blueprint, className = '', transparent = false, title }: BlueprintVisualizationProps) {
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
        <BlueprintFlow blueprint={blueprint} transparent={transparent} title={title} />
      </div>
    </ReactFlowProvider>
  )
}

export default BlueprintVisualization
