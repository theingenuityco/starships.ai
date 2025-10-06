'use client'

import React, { useMemo, useState, useCallback } from 'react'
import {
  ReactFlow,
  Node,
  Edge,
  Background,
  ReactFlowProvider,
  MarkerType,
  Position,
  Handle,
  BackgroundVariant,
  Panel,
  NodeProps,
  OnNodesChange,
  OnEdgesChange,
  applyNodeChanges,
  applyEdgeChanges,
  EdgeProps,
  getBezierPath,
  BaseEdge,
} from '@xyflow/react'
import ELK from 'elkjs/lib/elk.bundled.js'
import { Play, CheckCircle2, Zap, User, AlertTriangle, Eye, Clock, Code, Globe, Settings, GitBranch, Database, Wrench, Cog, X } from 'lucide-react'
import type { Blueprint, Edge as BlueprintEdge, Node as BlueprintNode } from '@starships/autopilot'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'

interface BlueprintVisualizationProps {
  blueprint: Blueprint
  className?: string
  transparent?: boolean
  title?: string
  nodesDraggable?: boolean
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
  const className = 'w-5 h-5'
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
      return <Cog className={className} />
    case 'mutate':
      return <Database className={className} />
    default:
      return <Clock className={className} />
  }
})
NodeIcon.displayName = 'NodeIcon'

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
const CustomConditionalNode: React.FC<{ data: ReactFlowNode['data'] & { outgoingEdges?: BlueprintEdge[]; isSelected?: boolean } }> = ({ data }) => {
  const colors = getNodeColors(data.type)
  const edges = data.outgoingEdges || []
  const isSelected = data.isSelected

  return (
    <>
      {/* Input handle */}
      <Handle type="target" position={Position.Left} className="!w-3 !h-3 !border-2 !border-white !bg-gray-500 hover:!bg-gray-700 !rounded-full !shadow-sm" style={{ left: -6 }} />

      <div className="relative">
        {/* Main node body */}
        <div
          className={`
            relative flex items-center gap-3 px-4 py-3 min-w-[180px] max-w-[220px]
            bg-white dark:bg-gray-800 border-2
            ${isSelected ? 'border-primary dark:border-primary ring-2 ring-primary/30' : 'border-gray-200 dark:border-gray-600'}
            rounded-xl shadow-lg hover:shadow-xl transition-all duration-300
            text-gray-900 dark:text-gray-100 cursor-move hover:border-gray-300
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
            <NodeIcon nodeType={data.nodeType} />
          </div>

          {/* Node content */}
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate leading-tight">{data.label}</div>
            {data.type && <div className="text-xs text-gray-500 dark:text-gray-400 capitalize font-medium mt-0.5">{data.type.replace('_', ' ')}</div>}
          </div>
        </div>

        {/* Vertical conditional sections on the right */}
        {edges.length > 1 && (
          <div className="flex flex-col ml-1">
            {edges.map((edge, index) => {
              const uniqueKey = edge?.ref ? `branch-${edge.ref}` : `edge-branch-${index}`
              return (
                <div
                  key={uniqueKey}
                  className="relative bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-r-md px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 mb-1 last:mb-0"
                  style={{ minHeight: '30px' }}
                >
                  <div className="truncate text-center">{edge?.label || `Branch ${index + 1}`}</div>
                  {/* Individual output handle for this branch */}
                  <Handle
                    type="source"
                    position={Position.Right}
                    id={edge?.ref}
                    className="!w-2.5 !h-2.5 !border-2 !border-white !bg-gray-500 hover:!bg-gray-700 !rounded-full !shadow-sm"
                    style={{
                      right: -5,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      position: 'absolute',
                    }}
                  />
                </div>
              )
            })}
          </div>
        )}

        {/* Single output handle for nodes with only one output */}
        {edges.length <= 1 && (
          <Handle type="source" position={Position.Right} className="!w-3 !h-3 !border-2 !border-white !bg-gray-500 hover:!bg-gray-700 !rounded-full !shadow-sm" style={{ right: -6 }} />
        )}
      </div>
    </>
  )
}

// Custom node component with professional design
const CustomBlueprintNode: React.FC<{ data: ReactFlowNode['data'] & { outgoingEdges?: BlueprintEdge[]; isSelected?: boolean } }> = ({ data }) => {
  const colors = getNodeColors(data.type)
  const isSelected = data.isSelected

  // Use conditional node for nodes with multiple outputs
  if (data.type === 'conditional' && data.outgoingEdges && data.outgoingEdges.length > 1) {
    return <CustomConditionalNode data={data} />
  }

  return (
    <>
      {/* Input handle - all nodes except start (horizontal layout: left) */}
      {data.type !== 'start' && (
        <Handle type="target" position={Position.Left} className="!w-3 !h-3 !border-2 !border-white !bg-gray-500 hover:!bg-gray-700 !rounded-full !shadow-sm" style={{ left: -6 }} />
      )}

      <div
        className={`
          relative flex items-center gap-3 px-4 py-3 min-w-[180px] max-w-[220px]
          bg-white dark:bg-gray-800 border-2
          ${isSelected ? 'border-primary dark:border-primary ring-2 ring-primary/30' : 'border-gray-200 dark:border-gray-600'}
          rounded-xl shadow-lg hover:shadow-xl transition-all duration-300
          text-gray-900 dark:text-gray-100 cursor-move hover:border-gray-300
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
          <NodeIcon nodeType={data.nodeType} />
        </div>

        {/* Node content with better typography */}
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate leading-tight">{data.label}</div>
          {data.type && <div className="text-xs text-gray-500 dark:text-gray-400 capitalize font-medium mt-0.5">{data.type.replace('_', ' ')}</div>}
        </div>
      </div>

      {/* Output handle - all nodes except end (horizontal layout: right) */}
      {data.type !== 'end' && (
        <Handle type="source" position={Position.Right} className="!w-3 !h-3 !border-2 !border-white !bg-gray-500 hover:!bg-gray-700 !rounded-full !shadow-sm" style={{ right: -6 }} />
      )}
    </>
  )
}

// Use ELK (Eclipse Layout Kernel) with SCC condensation
const elk = new ELK()

const getElkLayout = async (nodes: ReactFlowNode[], edges: Edge[]) => {
  const graph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered', // Layered algorithm
      'elk.direction': 'RIGHT', // Left to right layout

      // DO NOT BREAK CYCLES - Preserve them completely
      'elk.layered.cycleBreaking.strategy': 'DEPTH_FIRST', // Minimal cycle intervention
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',

      // Adjusted spacing: tighter horizontal, much more vertical room for loopback routing
      'elk.spacing.nodeNode': '350', // Much more vertical space between nodes at same level
      'elk.layered.spacing.nodeNodeBetweenLayers': '150', // Decreased horizontal layer spacing
      'elk.spacing.edgeNode': '80', // Sufficient edge routing space
      'elk.spacing.edgeEdge': '30', // Space between edges
      'elk.padding': '[top=40,left=40,bottom=40,right=40]', // Reasonable padding

      // Node Placement - Optimized for cycles
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
      'elk.layered.layering.strategy': 'MIN_WIDTH', // Minimize width, allow cycles

      // SPLINES routing - Better for cycles than orthogonal
      'elk.edgeRouting': 'SPLINES', // Smooth curves that route around
      'elk.layered.unnecessaryBendpoints': 'false',
      'elk.layered.wrapping.strategy': 'OFF',

      // Allow back edges to route naturally
      'elk.layered.allowNonFlowPortsToSwitchSides': 'true', // Flexible port routing
      'elk.layered.feedbackEdges': 'true', // Track but don't break back edges

      // Port flexibility for better cycle routing
      'elk.portConstraints': 'FREE', // Allow flexible port positioning

      // Quality settings
      'elk.layered.thoroughness': '100',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.crossingMinimization.greedySwitch': 'TWO_SIDED',

      // Compaction settings - Prevent edge overlap
      'elk.layered.compaction.postCompaction.strategy': 'EDGE_LENGTH',
      'elk.layered.compaction.connectedComponents': 'false', // Don't compact SCCs
    },
    children: nodes.map(node => ({
      id: node.id,
      width: 220,
      height: 80,
    })),
    edges: edges.map(edge => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  }

  const layoutedGraph = await elk.layout(graph)

  const layoutedNodes = nodes.map(node => {
    const layoutedNode = layoutedGraph.children?.find(n => n.id === node.id)
    return {
      ...node,
      position: {
        x: layoutedNode?.x ?? 0,
        y: layoutedNode?.y ?? 0,
      },
    }
  })

  return { nodes: layoutedNodes, edges }
}

// Convert blueprint to React Flow format with ELK layout
const convertBlueprintToFlow = async (blueprint: Blueprint, nodesDraggable: boolean = false) => {
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
    draggable: nodesDraggable,
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

  // Create edges with simple bezier - combines smoothstep routing with bezier curves
  const flowEdges: Edge[] = blueprintEdges.map((edge: BlueprintEdge) => {
    const sourceNode = blueprint.nodes.find(n => n.ref === edge.from)
    const isConditionalEdge = sourceNode?.type === 'conditional' && (outgoingEdgesMap.get(edge.from)?.length || 0) > 1

    return {
      id: edge.ref,
      source: edge.from,
      target: edge.to,
      sourceHandle: isConditionalEdge ? edge.ref : undefined,
      type: 'simplebezier', // Simple bezier combines smoothstep-style routing with bezier curves
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
      // Higher z-index for back edges will be set after layout
      data: {},
    }
  })

  // Apply ELK layout
  const layoutResult = await getElkLayout(initialNodes, flowEdges)

  // Detect back edges after layout and use custom smooth edges
  const edgesWithZIndex = layoutResult.edges.map(edge => {
    const sourceNode = layoutResult.nodes.find(n => n.id === edge.source)
    const targetNode = layoutResult.nodes.find(n => n.id === edge.target)

    // Back edge: target is to the left of source (going backwards)
    const isBackEdge = sourceNode && targetNode && targetNode.position.x < sourceNode.position.x

    return {
      ...edge,
      type: 'smooth', // Use custom smooth edge for all edges
      zIndex: -1, // All edges render behind nodes
      style: {
        ...edge.style,
        strokeWidth: 2, // Consistent width for all edges
      },
      data: {
        ...edge.data,
        isBackEdge, // Pass back edge flag to custom edge component
      },
    }
  })

  // Return layout with properly configured edges
  return { nodes: layoutResult.nodes, edges: edgesWithZIndex }
}

// Custom edge component with smooth curves for loopback edges
const CustomSmoothEdge: React.FC<EdgeProps> = ({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style = {}, markerEnd, data }) => {
  // Check if this is a back edge (loopback)
  const isBackEdge = data?.isBackEdge === true

  let edgePath: string

  if (isBackEdge) {
    // For back edges, create a custom path with very smooth curves
    // Simulate a stiff steel rope that maintains large bend radius

    // Calculate distance and direction
    const dx = targetX - sourceX
    const dy = targetY - sourceY
    const distance = Math.sqrt(dx * dx + dy * dy)

    // Create control points for smoother curves with reduced intensity
    // Lower multiplier = gentler, wider curves
    const controlPointOffset = Math.max(distance * 0.4, 100) // Reduced curvature for more natural flow

    // Control points positioned to create smooth "C" shape
    const controlPoint1X = sourceX + controlPointOffset
    const controlPoint1Y = sourceY
    const controlPoint2X = targetX - controlPointOffset
    const controlPoint2Y = targetY

    // Create cubic bezier path with custom control points
    edgePath = `M ${sourceX},${sourceY} C ${controlPoint1X},${controlPoint1Y} ${controlPoint2X},${controlPoint2Y} ${targetX},${targetY}`
  } else {
    // For normal edges, use standard bezier with moderate curvature
    ;[edgePath] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      curvature: 0.25,
    })
  }

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      markerEnd={markerEnd}
      style={{
        ...style,
        // Ensure smooth rendering
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      }}
    />
  )
}

// Node types for React Flow
const nodeTypes = {
  custom: CustomBlueprintNode,
}

// Edge types for React Flow
const edgeTypes = {
  smooth: CustomSmoothEdge,
}

// Node details panel component
const NodeDetailsPanel: React.FC<{
  node: BlueprintNode
  onClose: () => void
}> = ({ node, onClose }) => {
  const colors = getNodeColors(node.type)

  return (
    <Card className="absolute top-4 right-4 w-[420px] max-h-[calc(100vh-8rem)] z-50 frosted-glass-card rounded-xl shadow-frosted-lg">
      <div className="flex items-center justify-between p-3 border-b border-border/40">
        <div className="flex items-center gap-2.5">
          <div
            className="flex items-center justify-center w-8 h-8 rounded-lg"
            style={{
              backgroundColor: colors.handle + '15',
              color: colors.handle,
              border: `2px solid ${colors.handle}30`,
            }}
          >
            <NodeIcon nodeType={node.type} />
          </div>
          <div>
            <h3 className="font-semibold text-sm">{node.name}</h3>
            <Badge variant="outline" className="text-xs capitalize mt-0.5">
              {node.type.replace('_', ' ')}
            </Badge>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <ScrollArea className="max-h-[calc(100vh-14rem)]">
        <div className="p-3 space-y-3">
          {/* Description */}
          {node.description && (
            <div className="space-y-1.5">
              <h4 className="text-xs font-medium text-muted-foreground uppercase">Description</h4>
              <p className="text-sm text-foreground">{node.description}</p>
            </div>
          )}

          {/* Reference */}
          <div className="space-y-1.5">
            <h4 className="text-xs font-medium text-muted-foreground uppercase">Reference</h4>
            <code className="text-xs bg-muted px-2 py-1 rounded font-mono">{node.ref}</code>
          </div>

          {/* Parameters */}
          {node.parameters && Object.keys(node.parameters).length > 0 && (
            <div className="space-y-1.5">
              <h4 className="text-xs font-medium text-muted-foreground uppercase">Parameters</h4>
              <div className="space-y-1.5">
                {Object.entries(node.parameters).map(([key, value]) => (
                  <div key={key} className="space-y-1">
                    <div className="text-xs font-medium text-foreground">{key}</div>
                    <pre className="text-xs bg-muted p-2 rounded overflow-x-auto font-mono">{typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}</pre>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Metadata */}
          {node.metadata && Object.keys(node.metadata).length > 0 && (
            <div className="space-y-1.5">
              <h4 className="text-xs font-medium text-muted-foreground uppercase">Metadata</h4>
              <pre className="text-xs bg-muted p-2 rounded overflow-x-auto font-mono">{JSON.stringify(node.metadata, null, 2)}</pre>
            </div>
          )}
        </div>
      </ScrollArea>
    </Card>
  )
}

function BlueprintFlow({ blueprint, transparent, title, nodesDraggable = false }: { blueprint: Blueprint; transparent?: boolean; title?: string; nodesDraggable?: boolean }) {
  const [selectedNode, setSelectedNode] = useState<BlueprintNode | null>(null)

  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<Edge[]>([])

  // Convert blueprint and apply layout (async)
  useMemo(() => {
    convertBlueprintToFlow(blueprint, nodesDraggable).then(flowData => {
      setNodes(flowData.nodes)
      setEdges(flowData.edges)
    })
  }, [blueprint, nodesDraggable])

  // Add selection state to node data
  const nodesWithSelection = useMemo(() => {
    return nodes.map(node => ({
      ...node,
      data: {
        ...node.data,
        isSelected: selectedNode?.ref === node.id,
      },
    }))
  }, [nodes, selectedNode])

  // Handle node position changes for dragging
  const onNodesChange: OnNodesChange = useCallback(changes => {
    setNodes(nds => applyNodeChanges(changes, nds))
  }, [])

  const onEdgesChange: OnEdgesChange = useCallback(changes => {
    setEdges(eds => applyEdgeChanges(changes, eds))
  }, [])

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const blueprintNode = blueprint.nodes.find(n => n.ref === node.id)
      if (blueprintNode) {
        setSelectedNode(blueprintNode)
      }
    },
    [blueprint.nodes]
  )

  const handlePaneClick = useCallback(() => {
    setSelectedNode(null)
  }, [])

  return (
    <div
      className={`h-full w-full border border-muted-foreground/20 rounded-lg overflow-hidden relative ${transparent ? 'bg-transparent' : 'bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800'}`}
      style={
        !transparent
          ? {
              backgroundImage: `radial-gradient(circle, #9ca3af 1.2px, transparent 1.2px)`,
              backgroundSize: '24px 24px',
              backgroundPosition: '0 0',
            }
          : undefined
      }
    >
      <ReactFlow
        nodes={nodesWithSelection}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        fitView
        fitViewOptions={{
          padding: 0.2,
          minZoom: 0.4,
          maxZoom: 1.0,
          includeHiddenNodes: true,
        }}
        nodesDraggable={nodesDraggable}
        nodesConnectable={false}
        elementsSelectable={true}
        selectNodesOnDrag={true}
        zoomOnScroll={true}
        zoomOnPinch={true}
        panOnScroll={true}
        panOnDrag={true}
        zoomOnDoubleClick={true}
        preventScrolling={false}
        proOptions={{ hideAttribution: true }}
        defaultViewport={{ x: 0, y: 0, zoom: 0.6 }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={2} color="rgba(156, 163, 175, 0.4)" />
        {title && (
          <Panel position="top-left" className="m-4">
            <div className="flex items-center gap-2 px-4 py-2 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg">
              <Wrench className="w-5 h-5 text-primary" />
              <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">{title}</span>
            </div>
          </Panel>
        )}
      </ReactFlow>

      {/* Node Details Panel */}
      {selectedNode && <NodeDetailsPanel node={selectedNode} onClose={() => setSelectedNode(null)} />}
    </div>
  )
}

export function BlueprintVisualization({ blueprint, className = '', transparent = false, title, nodesDraggable = false }: BlueprintVisualizationProps) {
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
        <BlueprintFlow blueprint={blueprint} transparent={transparent} title={title} nodesDraggable={nodesDraggable} />
      </div>
    </ReactFlowProvider>
  )
}

export default BlueprintVisualization
