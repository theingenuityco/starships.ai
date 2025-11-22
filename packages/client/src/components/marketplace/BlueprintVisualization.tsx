'use client'

import Icon from '@/components/primitives/Icon'

import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { useTheme } from 'next-themes'
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
  OnNodesChange,
  OnEdgesChange,
  applyNodeChanges,
  applyEdgeChanges,
} from '@xyflow/react'
import type { ReactFlowInstance } from '@xyflow/react'
import ELK from 'elkjs/lib/elk.bundled.js'

import type { Blueprint, Edge as BlueprintEdge, Node as BlueprintNode } from '@starships/autopilot'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import Editor, { OnMount } from '@monaco-editor/react'

interface BlueprintVisualizationProps {
  blueprint: Blueprint
  className?: string
  transparent?: boolean
  nodesDraggable?: boolean
  borderless?: boolean
  // Applies to the inner container that holds the canvas (for transferring viewport styles)
  containerClassName?: string
  containerStyle?: React.CSSProperties
}

interface ReactFlowNode extends Node {
  data: {
    label: string
    type: string
    description?: string
    nodeType: string // Store node type instead of icon element
    outgoingEdges?: BlueprintEdge[]
    incomingEdges?: BlueprintEdge[]
    nodeId: string
  }
}

// Unified node type used across state, instance, and ReactFlow generics
type FlowNodeData = ReactFlowNode['data'] & { isSelected?: boolean }
type FlowNode = Node<FlowNodeData>

// Get icon component for node type
const NodeIcon: React.FC<{ nodeType: string }> = React.memo(({ nodeType }) => {
  const className = 'w-6 h-6'
  switch (nodeType) {
    case 'start':
      return <Icon name="play" className={className} />
    case 'end':
      return <Icon name="check-circle" className={className} />
    case 'agent':
      return <Icon name="zap" className={className} />
    case 'user_prompt':
      return <Icon name="user" className={className} />
    case 'conditional':
      return <Icon name="split" className={className} />
    case 'output':
      return <Icon name="eye" className={className} />
    case 'llm':
      return <Icon name="zap" className={className} />
    case 'http_request':
      return <Icon name="globe" className={className} />
    case 'code':
      return <Icon name="code" className={className} />
    case 'tool':
      return <Icon name="settings" className={className} />
    case 'workflow':
      return <Icon name="git-branch" className={className} />
    case 'transform':
      return <Icon name="cog" className={className} />
    case 'mutate':
      return <Icon name="edit-3" className={className} />
    default:
      return <Icon name="clock" className={className} />
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
      bg: 'bg-amber-50 dark:bg-amber-950/30',
      border: 'border-amber-300 dark:border-amber-700',
      text: 'text-amber-700 dark:text-amber-300',
      handle: '#f59e0b',
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
      bg: 'bg-fuchsia-50 dark:bg-fuchsia-950/30',
      border: 'border-fuchsia-300 dark:border-fuchsia-700',
      text: 'text-fuchsia-700 dark:text-fuchsia-300',
      handle: '#d946ef',
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
  const { theme } = useTheme()
  const colors = getNodeColors(data.type)
  const incoming = data.incomingEdges || []
  const edges = data.outgoingEdges || []
  const isSelected = data.isSelected

  // Adjust opacity based on theme - darker in light mode for better visibility
  const primaryOpacity = theme === 'light' ? '15' : '15'
  const secondaryOpacity = theme === 'light' ? '08' : '08'
  const branchPrimaryOpacity = theme === 'light' ? '10' : '10'
  const branchSecondaryOpacity = theme === 'light' ? '05' : '05'

  return (
    <>
      <div className="relative">
        {/* Main node body */}
        <div
          className={`
            relative flex items-center gap-4 px-5 py-4 min-w-[220px] max-w-[280px]
            backdrop-blur-[20px] backdrop-saturate-[180%] border-2
            ${isSelected ? 'border-primary dark:border-primary ring-2 ring-primary/30' : 'border-border/40'}
            rounded-xl shadow-frosted-lg transition-all duration-300
            text-foreground cursor-move hover:border-border/60
          `}
          style={{
            background: `linear-gradient(135deg, ${colors.handle}${primaryOpacity} 0%, ${colors.handle}${secondaryOpacity} 100%)`,
          }}
        >
          {/* Target handles - distribute vertically around center when multiple incoming */}
          {(incoming.length || 0) <= 1 && (
            <Handle
              id={`${data.nodeId}-in-0`}
              type="target"
              position={Position.Left}
              className="!w-3 !h-3 !rounded-full"
              style={{ left: -6, top: '50%', transform: 'translateY(-50%)', backgroundColor: colors.handle, border: `2px solid ${colors.handle}`, zIndex: 10 }}
            />
          )}
          {incoming.length > 1 &&
            incoming.map((edge, i) => {
              const spacing = 16
              const offset = (i - (incoming.length - 1) / 2) * spacing
              return (
                <Handle
                  key={`in-${i}`}
                  id={`${data.nodeId}-in-${i}`}
                  type="target"
                  position={Position.Left}
                  className="!w-3 !h-3 !rounded-full"
                  style={{ left: -6, top: `calc(50% + ${offset}px)`, transform: 'translateY(-50%)', backgroundColor: colors.handle, border: `2px solid ${colors.handle}`, zIndex: 10 }}
                />
              )
            })}
          {/* Circular icon container */}
          <div
            className="flex items-center justify-center w-12 h-12 rounded-full flex-shrink-0 shadow-sm"
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
            <div className="font-semibold text-base text-foreground truncate leading-tight">{data.label}</div>
            {data.type && <div className="text-sm text-muted-foreground capitalize font-medium mt-0.5">{data.type.replace('_', ' ')}</div>}
          </div>
        </div>

        {/* Conditional branch sections below the main node */}
        {edges.length > 1 && (
          <div className="flex flex-col gap-1 mt-1">
            {edges.map((edge, index) => {
              const uniqueKey = edge?.ref ? `branch-${edge.ref}` : `edge-branch-${index}`

              // Safely render human-readable condition/label text
              const getBranchLabel = () => {
                const condition = (edge as any)?.condition

                if (condition === undefined || condition === null || condition === '') {
                  return edge?.label || `Branch ${index + 1}`
                }

                if (typeof condition === 'object') {
                  // Handle simple operator objects like { equals: true }
                  if ('equals' in condition) {
                    return String((condition as any).equals)
                  }
                  // Fallback to JSON for any other structured condition
                  try {
                    return JSON.stringify(condition)
                  } catch {
                    return String(condition)
                  }
                }

                return String(condition)
              }

              return (
                <div
                  key={uniqueKey}
                  className="relative backdrop-blur-[20px] backdrop-saturate-[180%] border-2 border-border/40 rounded-xl px-3.5 py-2.5 text-sm font-medium text-foreground shadow-frosted-lg hover:border-border/60 transition-all duration-300"
                  style={{
                    background: `linear-gradient(135deg, ${colors.handle}${branchPrimaryOpacity} 0%, ${colors.handle}${branchSecondaryOpacity} 100%)`,
                  }}
                >
                  <div className="truncate text-center">{getBranchLabel()}</div>
                  {/* Individual output handle for this branch */}
                  <Handle
                    type="source"
                    position={Position.Right}
                    id={edge?.ref}
                    className="!w-3 !h-3 !rounded-full"
                    style={{
                      right: -6,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      backgroundColor: colors.handle,
                      border: `2px solid ${colors.handle}`,
                      zIndex: 10,
                    }}
                  />
                </div>
              )
            })}
          </div>
        )}

        {/* Single output handle for nodes with only one output */}
        {edges.length <= 1 && (
          <Handle
            type="source"
            position={Position.Right}
            className="!w-3 !h-3 !rounded-full"
            style={{ right: -6, top: '50%', transform: 'translateY(-50%)', backgroundColor: colors.handle, border: `2px solid ${colors.handle}`, zIndex: 10 }}
          />
        )}
      </div>
    </>
  )
}

// Custom node component with professional design
const CustomBlueprintNode: React.FC<{ data: ReactFlowNode['data'] & { outgoingEdges?: BlueprintEdge[]; isSelected?: boolean } }> = ({ data }) => {
  const { theme } = useTheme()
  const colors = getNodeColors(data.type)
  const incoming = data.incomingEdges || []
  const isSelected = data.isSelected

  // Adjust opacity based on theme - darker in light mode for better visibility
  const primaryOpacity = theme === 'light' ? '15' : '15'
  const secondaryOpacity = theme === 'light' ? '08' : '08'

  // Use conditional node for nodes with multiple outputs
  if (data.type === 'conditional' && data.outgoingEdges && data.outgoingEdges.length > 1) {
    return <CustomConditionalNode data={data} />
  }

  return (
    <>
      {/* Input handle - all nodes except start (horizontal layout: left) */}
      {data.type !== 'start' && (incoming.length || 0) <= 1 && (
        <Handle
          id={`${data.nodeId}-in-0`}
          type="target"
          position={Position.Left}
          className="!w-3 !h-3 !rounded-full"
          style={{ left: -6, top: '50%', transform: 'translateY(-50%)', backgroundColor: colors.handle, border: `2px solid ${colors.handle}`, zIndex: 10 }}
        />
      )}
      {data.type !== 'start' &&
        incoming.length > 1 &&
        incoming.map((edge, i) => {
          const spacing = 16
          const offset = (i - (incoming.length - 1) / 2) * spacing
          return (
            <Handle
              key={`in-${i}`}
              id={`${data.nodeId}-in-${i}`}
              type="target"
              position={Position.Left}
              className="!w-3 !h-3 !rounded-full"
              style={{ left: -6, top: `calc(50% + ${offset}px)`, transform: 'translateY(-50%)', backgroundColor: colors.handle, border: `2px solid ${colors.handle}`, zIndex: 10 }}
            />
          )
        })}

      <div
        className={`
          relative flex items-center gap-4 px-5 py-4 min-w-[220px] max-w-[280px]
          backdrop-blur-[20px] backdrop-saturate-[180%] border-2
          ${isSelected ? 'border-primary dark:border-primary ring-2 ring-primary/30' : 'border-border/40'}
          rounded-xl shadow-frosted-lg transition-all duration-300
          text-foreground cursor-move hover:border-border/60
        `}
        style={{
          background: `linear-gradient(135deg, ${colors.handle}${primaryOpacity} 0%, ${colors.handle}${secondaryOpacity} 100%)`,
        }}
      >
        {/* Circular icon container with better styling */}
        <div
          className="flex items-center justify-center w-12 h-12 rounded-full flex-shrink-0 shadow-sm"
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
          <div className="font-semibold text-base text-foreground truncate leading-tight">{data.label}</div>
          {data.type && <div className="text-sm text-muted-foreground capitalize font-medium mt-0.5">{data.type.replace('_', ' ')}</div>}
        </div>
      </div>

      {/* Output handle - all nodes except end (horizontal layout: right) */}
      {data.type !== 'end' && (
        <Handle
          type="source"
          position={Position.Right}
          className="!w-3 !h-3 !rounded-full"
          style={{ right: -6, top: '50%', transform: 'translateY(-50%)', backgroundColor: colors.handle, border: `2px solid ${colors.handle}`, zIndex: 10 }}
        />
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
      'elk.layered.considerModelOrder': 'true', // honor model order when possible

      // Adjusted spacing: tighter horizontal, much more vertical room for loopback routing
      'elk.spacing.nodeNode': '350', // Much more vertical space between nodes at same level
      'elk.layered.spacing.nodeNodeBetweenLayers': '150', // Decreased horizontal layer spacing
      'elk.spacing.edgeNode': '100', // More space between edges and nodes
      'elk.spacing.edgeEdge': '40', // More space between edges
      'elk.spacing.portPort': '14', // space between ports
      'elk.padding': '[top=40,left=40,bottom=40,right=40]', // Reasonable padding

      // Node Placement - Optimized for cycles
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.nodePlacement.bk.fixedAlignment': 'LEFTUP', // Deterministic alignment
      'elk.layered.nodePlacement.favorStraightEdges': 'true',
      'elk.layered.layering.strategy': 'LONGEST_PATH', // Often cleaner for DAG-like flows

      // SPLINES routing - Better for cycles than orthogonal
      'elk.edgeRouting': 'SPLINES', // Smooth curves that route around
      'elk.layered.unnecessaryBendpoints': 'false',
      'elk.layered.wrapping.strategy': 'OFF',
      'elk.layered.edgeStraightening': 'true',
      'elk.layered.mergeEdges': 'false',

      // Allow back edges to route naturally
      'elk.layered.allowNonFlowPortsToSwitchSides': 'true', // Flexible port routing
      'elk.layered.feedbackEdges': 'true', // Track but don't break back edges

      // Port flexibility for better cycle routing
      'elk.portConstraints': 'FIXED_SIDE', // Respect port sides for cleaner attachments

      // Quality settings
      'elk.layered.thoroughness': '100',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.crossingMinimization.greedySwitch': 'TWO_SIDED',

      // Compaction settings - Prevent edge overlap
      'elk.layered.compaction.postCompaction.strategy': 'EDGE_LENGTH',
      'elk.layered.compaction.connectedComponents': 'false', // Don't compact SCCs
    },
    children: nodes.map(node => {
      const data: any = (node as any).data || {}
      const incoming: any[] = Array.isArray(data.incomingEdges) ? data.incomingEdges : []
      const outgoing: any[] = Array.isArray(data.outgoingEdges) ? data.outgoingEdges : []

      // Define ports matching React Flow handle ids
      const targetPorts: any[] = []
      const incomingCount = Math.max(1, incoming.length)
      for (let i = 0; i < incomingCount; i++) {
        targetPorts.push({
          id: `${node.id}-in-${i}`,
          layoutOptions: {
            'elk.port.side': 'WEST',
            'elk.port.index': String(i),
          },
        })
      }

      const sourcePorts: any[] = []
      if (data.type === 'conditional' && outgoing.length > 1) {
        // One port per branch, id is the branch edge.ref (matches sourceHandle)
        outgoing.forEach((be: any, i: number) => {
          if (be && be.ref) {
            sourcePorts.push({
              id: String(be.ref),
              layoutOptions: {
                'elk.port.side': 'EAST',
                'elk.port.index': String(i),
              },
            })
          }
        })
      } else {
        // Default single output port
        sourcePorts.push({
          id: `${node.id}-out-0`,
          layoutOptions: {
            'elk.port.side': 'EAST',
            'elk.port.index': '0',
          },
        })
      }

      return {
        id: node.id,
        width: 280,
        height: 96,
        ports: [...targetPorts, ...sourcePorts],
      }
    }),
    edges: edges.map(edge => {
      const srcPort = edge.sourceHandle ? String(edge.sourceHandle) : `${edge.source}-out-0`
      const tgtPort = edge.targetHandle ? String(edge.targetHandle) : `${edge.target}-in-0`
      return {
        id: edge.id,
        sources: [srcPort],
        targets: [tgtPort],
      }
    }),
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

  // Filter out nodes with null/undefined refs during streaming
  const validNodes = blueprint.nodes.filter(node => node.ref != null && node.ref !== '')

  if (validNodes.length === 0) {
    return { nodes: [], edges: [] }
  }

  // Safely handle edges - may be undefined during streaming
  const blueprintEdges = blueprint.edges || []

  // Create a set of valid node IDs for quick lookup
  const validNodeIds = new Set(validNodes.map(node => node.ref))

  // Filter edges to only include those with valid IDs and both nodes present (important for streaming)
  const validEdges = blueprintEdges.filter(
    edge => edge.ref != null && edge.ref !== '' && edge.from != null && edge.from !== '' && edge.to != null && edge.to !== '' && validNodeIds.has(edge.from) && validNodeIds.has(edge.to)
  )

  // Build outgoing edges map for conditional nodes
  const outgoingEdgesMap = new Map<string, BlueprintEdge[]>()
  validEdges.forEach(edge => {
    if (!outgoingEdgesMap.has(edge.from)) {
      outgoingEdgesMap.set(edge.from, [])
    }
    outgoingEdgesMap.get(edge.from)!.push(edge)
  })

  // Build incoming edges map for target handle distribution
  const incomingEdgesMap = new Map<string, BlueprintEdge[]>()
  validEdges.forEach(edge => {
    if (!incomingEdgesMap.has(edge.to)) {
      incomingEdgesMap.set(edge.to, [])
    }
    incomingEdgesMap.get(edge.to)!.push(edge)
  })

  // Create initial nodes without positioning
  const initialNodes: ReactFlowNode[] = validNodes.map((node: BlueprintNode) => ({
    id: node.ref,
    type: 'custom',
    position: { x: 0, y: 0 }, // Will be overridden by layout
    draggable: nodesDraggable,
    data: {
      nodeId: node.ref,
      label: node.name,
      type: node.type,
      description: node.description,
      nodeType: node.type, // Store node type instead of icon element
      outgoingEdges: outgoingEdgesMap.get(node.ref) || [],
      incomingEdges: incomingEdgesMap.get(node.ref) || [],
    },
    style: {
      background: 'transparent',
      border: 'none',
    },
  }))

  // Create edges using built-in bezier; loop-backs updated later
  const flowEdges: Edge[] = validEdges.map((edge: BlueprintEdge) => {
    const sourceNode = blueprint.nodes.find(n => n.ref === edge.from)
    const isConditionalEdge = sourceNode?.type === 'conditional' && (outgoingEdgesMap.get(edge.from)?.length || 0) > 1

    // Determine target handle index for the target node based on ordering of incoming edges
    const incomingList = incomingEdgesMap.get(edge.to) || []
    const targetIndex = Math.max(
      0,
      incomingList.findIndex(e => e.ref === edge.ref)
    )
    const targetHandle = `${edge.to}-in-${targetIndex}`

    return {
      id: edge.ref,
      source: edge.from,
      target: edge.to,
      sourceHandle: isConditionalEdge ? edge.ref : undefined,
      targetHandle,
      type: 'bezier',
      animated: false,
      style: {
        stroke: '#94a3b8',
        strokeWidth: 1.25,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: '#94a3b8',
        width: 10,
        height: 10,
      },
      label: edge.label,
      // Higher z-index for back edges will be set after layout
      data: {},
    }
  })

  // Apply ELK layout
  const layoutResult = await getElkLayout(initialNodes, flowEdges)

  // Post-layout refinement: reassign target handles so incoming edges attach
  // top-to-bottom on the target side based on source Y to reduce crossings
  const nodeYById = new Map(layoutResult.nodes.map(n => [n.id, n.position.y]))
  const edgesByTarget = new Map<string, Edge[]>()
  layoutResult.edges.forEach(edge => {
    const arr = edgesByTarget.get(edge.target) || []
    arr.push(edge)
    edgesByTarget.set(edge.target, arr)
  })

  const edgesWithOrderedHandles: Edge[] = []
  edgesByTarget.forEach((edgesForTarget, targetId) => {
    const sorted = [...edgesForTarget].sort((a, b) => {
      const ay = nodeYById.get(a.source) ?? 0
      const by = nodeYById.get(b.source) ?? 0
      return ay - by
    })
    sorted.forEach((e, idx) => {
      edgesWithOrderedHandles.push({
        ...e,
        targetHandle: `${targetId}-in-${idx}`,
      })
    })
  })

  // Post-layout branch refinement: reorder outgoing branch handles (conditional nodes)
  // so that branch rows (and their right-side handles) are ordered by their targets' Y
  const edgesBySource = new Map<string, Edge[]>()
  edgesWithOrderedHandles.forEach(edge => {
    const arr = edgesBySource.get(edge.source) || []
    arr.push(edge)
    edgesBySource.set(edge.source, arr)
  })

  const blueprintEdgeByRef = new Map(validEdges.map(be => [be.ref, be]))

  const nodesWithSortedBranches = layoutResult.nodes.map(node => {
    const data: any = (node as any).data
    if (!data || data.type !== 'conditional' || !Array.isArray(data.outgoingEdges) || data.outgoingEdges.length <= 1) {
      return node
    }
    const edgesForSource = edgesBySource.get(node.id) || []
    if (edgesForSource.length === 0) return node

    const sortedByTargetY = [...edgesForSource].sort((a, b) => {
      const ay = nodeYById.get(a.target) ?? 0
      const by = nodeYById.get(b.target) ?? 0
      return ay - by
    })

    const sortedBlueprintEdges: BlueprintEdge[] = []
    sortedByTargetY.forEach(e => {
      const be = blueprintEdgeByRef.get(e.id)
      if (be) sortedBlueprintEdges.push(be)
    })

    // Include any missing edges in original order as fallback
    const existingRefs = new Set(sortedBlueprintEdges.map(e => e.ref))
    data.outgoingEdges.forEach((be: BlueprintEdge) => {
      if (!existingRefs.has(be.ref)) sortedBlueprintEdges.push(be)
    })

    return {
      ...node,
      data: {
        ...data,
        outgoingEdges: sortedBlueprintEdges,
      },
    }
  })

  // Detect back edges after layout and assign built-in types
  const edgesWithZIndex = edgesWithOrderedHandles.map(edge => {
    const sourceNode = layoutResult.nodes.find(n => n.id === edge.source)
    const targetNode = layoutResult.nodes.find(n => n.id === edge.target)

    // Back edge: target is to the left of source (going backwards)
    const isBackEdge = sourceNode && targetNode && targetNode.position.x < sourceNode.position.x

    return {
      ...edge,
      // Use built-in smoothstep for back edges; others as bezier
      type: isBackEdge ? 'smoothstep' : 'bezier',
      zIndex: -1, // All edges render behind nodes
      style: {
        ...edge.style,
        strokeWidth: 1.25, // Consistent thinner width for all edges
      },
      data: {
        ...edge.data,
        isBackEdge, // Pass back edge flag (not used by built-ins but harmless)
      },
    }
  })

  // Return layout with properly configured edges and sorted branch rows
  return { nodes: nodesWithSortedBranches, edges: edgesWithZIndex }
}

// Node types for React Flow
const nodeTypes = {
  custom: CustomBlueprintNode,
}

// Node details panel component
const NodeDetailsPanel: React.FC<{
  node: BlueprintNode
  onClose: () => void
}> = ({ node, onClose }) => {
  const colors = getNodeColors(node.type)
  const { theme } = useTheme()
  const [editorHeight, setEditorHeight] = useState<number>(0)
  const handleCodeEditorMount: OnMount = (editor, monaco) => {
    try {
      monaco.editor.defineTheme('starships-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [
          { token: 'string.key.json', foreground: '9cdcfe' },
          { token: 'string.value.json', foreground: 'ce9178' },
          { token: 'number', foreground: 'b5cea8' },
          { token: 'keyword', foreground: '569cd6' },
          { token: 'comment', foreground: '6a9955' },
          { token: 'delimiter', foreground: 'd4d4d4' },
        ],
        colors: {
          // Match app background (dark): black
          'editor.background': '#000000',
          'editor.foreground': '#f2f2f2',
          'editorLineNumber.foreground': '#4a5568', // dim line numbers
          'editorLineNumber.activeForeground': '#9aa4b2', // active line number slightly brighter
          'editor.selectionBackground': '#2e3541',
          'editor.inactiveSelectionBackground': '#171a20',
          'editorCursor.foreground': '#3b82f6',
          'editor.lineHighlightBackground': '#ffffff08',
          // Match widgets to app background for seamless look
          'editorWidget.background': '#000000',
          'editorSuggestWidget.background': '#000000',
          'editorHoverWidget.background': '#000000',
          // Sticky header background equals app background
          'editorStickyScroll.background': '#000000',
          'editorStickyScrollHover.background': '#000000',
          'editorStickyScroll.shadow': '#00000000', // remove 1px shadow/border line
          // Remove top scrollbar shadow line that can appear above content
          'scrollbar.shadow': '#00000000',
          contrastBorder: '#00000000',
          contrastActiveBorder: '#00000000',
          focusBorder: '#00000000',
        },
      })
      monaco.editor.defineTheme('starships-light', {
        base: 'vs',
        inherit: true,
        rules: [
          { token: 'string.key.json', foreground: '0070c1' },
          { token: 'string.value.json', foreground: 'a31515' },
          { token: 'number', foreground: '098658' },
          { token: 'keyword', foreground: '0000ff' },
          { token: 'comment', foreground: '008000' },
          { token: 'delimiter', foreground: '000000' },
        ],
        colors: {
          // Match app background (light): hsl(0 0% 98%) ~ #fafafa
          'editor.background': '#fafafa',
          'editor.foreground': '#141414',
          'editorLineNumber.foreground': '#999999', // dim line numbers
          'editorLineNumber.activeForeground': '#666666', // active line number darker
          'editor.selectionBackground': '#add6ff',
          'editor.inactiveSelectionBackground': '#e5ebf1',
          'editorCursor.foreground': '#3b82f6',
          'editor.lineHighlightBackground': '#00000008',
          // Match widgets to app background
          'editorWidget.background': '#fafafa',
          'editorSuggestWidget.background': '#fafafa',
          'editorHoverWidget.background': '#fafafa',
          // Sticky header background equals app background
          'editorStickyScroll.background': '#fafafa',
          'editorStickyScrollHover.background': '#fafafa',
          'editorStickyScroll.shadow': '#00000000', // remove 1px shadow/border line
          // Remove top scrollbar shadow line that can appear above content
          'scrollbar.shadow': '#00000000',
          contrastBorder: '#00000000',
          contrastActiveBorder: '#00000000',
          focusBorder: '#00000000',
        },
      })
      monaco.editor.setTheme(theme === 'dark' ? 'starships-dark' : 'starships-light')
    } catch {}

    // Auto-resize editor height to fit content and remove inner scrollbars
    const updateHeight = () => {
      const contentHeight = editor.getContentHeight()
      const container = editor.getContainerDomNode()
      const width = container.clientWidth
      const nextHeight = contentHeight
      setEditorHeight(nextHeight)
      editor.layout({ width, height: nextHeight })
    }

    // Hide internal scrollbars
    editor.updateOptions({
      scrollbar: {
        vertical: 'hidden',
        horizontal: 'hidden',
        useShadows: false,
        alwaysConsumeMouseWheel: false,
      },
      scrollBeyondLastLine: false,
    })

    // Initial height
    updateHeight()
    // React to content size changes
    const disposable = editor.onDidContentSizeChange(() => {
      updateHeight()
    })
    // React to container resize
    const resizeObserver = new ResizeObserver(() => {
      updateHeight()
    })
    resizeObserver.observe(editor.getContainerDomNode())

    // Cleanup
    return () => {
      disposable.dispose()
      resizeObserver.disconnect()
    }
  }

  return (
    <Card className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[calc(100vh-6rem)] z-50 frosted-glass-card rounded-xl shadow-frosted-lg flex flex-col overflow-hidden">
      <div className="flex items-center justify-between p-3 border-b border-border/40">
        <div className="flex items-center gap-2.5">
          <div
            className="flex items-center justify-center w-10 h-10 rounded-lg"
            style={{
              backgroundColor: colors.handle + '15',
              color: colors.handle,
              border: `2px solid ${colors.handle}30`,
            }}
          >
            <div className="scale-125">
              <NodeIcon nodeType={node.type} />
            </div>
          </div>
          <div>
            <h3 className="font-semibold text-sm">{node.name}</h3>
            <Badge variant="outline" className="text-xs capitalize mt-0.5">
              {node.type.replace('_', ' ')}
            </Badge>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
          <Icon name="x" className="h-3.5 w-3.5" />
        </Button>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-3 space-y-3">
          {/* Code (for code nodes) */}
          {node.type === 'code' && typeof (node as any)?.parameters?.code === 'string' && (node as any).parameters.code.trim().length > 0 && (
            <div className="space-y-1.5">
              <h4 className="text-xs font-medium text-muted-foreground uppercase">Code</h4>
              <div className="rounded-lg border bg-background overflow-hidden">
                <Editor
                  height={editorHeight ? `${editorHeight}px` : '200px'}
                  defaultLanguage="javascript"
                  value={(node as any).parameters.code as string}
                  onMount={handleCodeEditorMount}
                  theme={theme === 'dark' ? 'starships-dark' : 'starships-light'}
                  options={{
                    readOnly: true,
                    domReadOnly: true,
                    minimap: { enabled: false },
                    fontSize: 13,
                    lineNumbers: 'on',
                    glyphMargin: false,
                    lineNumbersMinChars: 4,
                    lineDecorationsWidth: 20,
                    scrollBeyondLastLine: false,
                    wordWrap: 'on',
                    wrappingIndent: 'indent',
                    automaticLayout: true,
                    tabSize: 2,
                    insertSpaces: true,
                    folding: false,
                    overviewRulerLanes: 0,
                    hideCursorInOverviewRuler: true,
                    overviewRulerBorder: false,
                    stickyScroll: { enabled: true },
                    padding: { top: 12, bottom: 12 },
                    scrollbar: {
                      vertical: 'hidden',
                      horizontal: 'hidden',
                      useShadows: false,
                      alwaysConsumeMouseWheel: false,
                    },
                    guides: {
                      indentation: false,
                      bracketPairs: false,
                      bracketPairsHorizontal: false,
                      highlightActiveBracketPair: false,
                    },
                  }}
                />
              </div>
            </div>
          )}

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
          {node.parameters && Object.keys(node.parameters).filter(k => k !== 'code').length > 0 && (
            <div className="space-y-1.5">
              <h4 className="text-xs font-medium text-muted-foreground uppercase">Parameters</h4>
              <div className="space-y-1.5">
                {Object.entries(node.parameters)
                  .filter(([key]) => key !== 'code')
                  .map(([key, value]) => (
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

function BlueprintFlow({
  blueprint,
  transparent,
  nodesDraggable = false,
  borderless = false,
  containerClassName = '',
  containerStyle,
}: {
  blueprint: Blueprint
  transparent?: boolean
  nodesDraggable?: boolean
  borderless?: boolean
  containerClassName?: string
  containerStyle?: React.CSSProperties
}) {
  const [selectedNode, setSelectedNode] = useState<BlueprintNode | null>(null)

  const [nodes, setNodes] = useState<FlowNode[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const layoutVersion = useRef(0)
  const reactFlowInstanceRef = useRef<ReactFlowInstance<FlowNode, Edge> | null>(null)

  // Convert blueprint and apply layout (async)
  // Use serialized blueprint to detect changes during streaming
  useEffect(() => {
    // Increment version to track this layout request
    const currentVersion = ++layoutVersion.current

    convertBlueprintToFlow(blueprint, nodesDraggable).then(flowData => {
      // Only apply if this is still the latest layout request
      if (currentVersion === layoutVersion.current) {
        setNodes(flowData.nodes)
        setEdges(flowData.edges)
      }
    })
  }, [JSON.stringify(blueprint.nodes), JSON.stringify(blueprint.edges), nodesDraggable])

  // Add selection state to node data
  const nodesWithSelection: FlowNode[] = useMemo(() => {
    return nodes.map(node => ({
      ...node,
      data: {
        ...node.data,
        isSelected: selectedNode?.ref === node.id,
      },
    }))
  }, [nodes, selectedNode])

  // Handle node position changes for dragging
  const onNodesChange: OnNodesChange<FlowNode> = useCallback(changes => {
    setNodes(nds => applyNodeChanges(changes, nds))
  }, [])

  const onEdgesChange: OnEdgesChange = useCallback(changes => {
    setEdges(eds => applyEdgeChanges(changes, eds))
  }, [])

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: FlowNode) => {
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

  // Fit the view once nodes are rendered, clamped to zoom bounds
  useEffect(() => {
    if (!reactFlowInstanceRef.current) return
    if (nodesWithSelection.length === 0) return
    // Allow the DOM to paint nodes before fitting
    requestAnimationFrame(() => {
      reactFlowInstanceRef.current?.fitView({
        padding: 0.25,
        includeHiddenNodes: true,
        minZoom: 0.35,
        maxZoom: 1.2,
      })
    })
  }, [nodesWithSelection.length])

  // Default amber-suited gradient if no explicit background is provided and not transparent
  const computedContainerStyle: React.CSSProperties | undefined = useMemo(() => {
    if (transparent) return containerStyle
    const hasCustomBackground = containerStyle && typeof containerStyle.background === 'string' && containerStyle.background.length > 0
    if (hasCustomBackground) return containerStyle
    return containerStyle
  }, [transparent, containerStyle])

  return (
    <div
      className={`h-full w-full ${borderless ? '' : 'border border-muted-foreground/20'} rounded-lg relative ${transparent ? 'bg-transparent' : 'blueprint-container-bg'} ${containerClassName}`}
      style={computedContainerStyle}
    >
      <ReactFlow<FlowNode, Edge>
        nodes={nodesWithSelection}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        minZoom={0.35}
        maxZoom={1.2}
        onInit={instance => {
          reactFlowInstanceRef.current = instance
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
        // Initial viewport is set by programmatic fitView above
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={2} color="rgba(156, 163, 175, 0.4)" />
      </ReactFlow>

      {/* Node Details Panel */}
      {selectedNode && (
        <>
          <div className="absolute inset-0 z-40 bg-background/50 backdrop-blur-sm" onClick={() => setSelectedNode(null)} aria-hidden />
          <NodeDetailsPanel node={selectedNode} onClose={() => setSelectedNode(null)} />
        </>
      )}
    </div>
  )
}

export function BlueprintVisualization({
  blueprint,
  className = '',
  transparent = false,
  nodesDraggable = false,
  borderless = false,
  containerClassName = '',
  containerStyle,
}: BlueprintVisualizationProps) {
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
        <BlueprintFlow
          blueprint={blueprint}
          transparent={transparent}
          nodesDraggable={nodesDraggable}
          borderless={borderless}
          containerClassName={containerClassName}
          containerStyle={containerStyle}
        />
      </div>
    </ReactFlowProvider>
  )
}

export default BlueprintVisualization
