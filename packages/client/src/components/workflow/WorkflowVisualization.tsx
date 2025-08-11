'use client'

import React from 'react'
import { motion } from 'motion/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Play,
  Pause,
  CheckCircle2,
  AlertTriangle,
  Clock,
  User,
  Zap,
  ArrowRight,
  Eye
} from 'lucide-react'
import type { WorkflowDSL, WorkflowDSLNode } from '@starships/protocol'

export interface WorkflowVisualizationProps {
  workflow: WorkflowDSL
  currentNodeId?: string
  onNodeClick?: (nodeId: string) => void
  showControls?: boolean
  className?: string
}

/**
 * Get appropriate icon for node type
 */
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
    default:
      return <Clock className="w-4 h-4" />
  }
}

/**
 * Get appropriate color for node type
 */
const getNodeColor = (nodeType: string, isActive: boolean) => {
  const baseColors = {
    start: 'bg-green-100 border-green-300 text-green-800',
    end: 'bg-blue-100 border-blue-300 text-blue-800',
    agent: 'bg-purple-100 border-purple-300 text-purple-800',
    user_prompt: 'bg-yellow-100 border-yellow-300 text-yellow-800',
    conditional: 'bg-orange-100 border-orange-300 text-orange-800',
    output: 'bg-indigo-100 border-indigo-300 text-indigo-800',
    default: 'bg-gray-100 border-gray-300 text-gray-800'
  }
  
  const activeColors = {
    start: 'bg-green-200 border-green-500 text-green-900 ring-2 ring-green-400',
    end: 'bg-blue-200 border-blue-500 text-blue-900 ring-2 ring-blue-400',
    agent: 'bg-purple-200 border-purple-500 text-purple-900 ring-2 ring-purple-400',
    user_prompt: 'bg-yellow-200 border-yellow-500 text-yellow-900 ring-2 ring-yellow-400',
    conditional: 'bg-orange-200 border-orange-500 text-orange-900 ring-2 ring-orange-400',
    output: 'bg-indigo-200 border-indigo-500 text-indigo-900 ring-2 ring-indigo-400',
    default: 'bg-gray-200 border-gray-500 text-gray-900 ring-2 ring-gray-400'
  }

  return isActive 
    ? (activeColors[nodeType as keyof typeof activeColors] || activeColors.default)
    : (baseColors[nodeType as keyof typeof baseColors] || baseColors.default)
}

/**
 * Render individual workflow node
 */
const WorkflowNode: React.FC<{
  node: WorkflowDSLNode
  isActive: boolean
  onClick?: () => void
}> = ({ node, isActive, onClick }) => {
  const colorClasses = getNodeColor(node.type, isActive)
  
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
      className={`relative p-3 rounded-lg border-2 cursor-pointer transition-all hover:shadow-md ${colorClasses}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-2 mb-2">
        {getNodeIcon(node.type)}
        <span className="font-medium text-sm">{node.name}</span>
        <Badge variant="outline" className="text-xs">
          {node.type}
        </Badge>
      </div>
      
      {node.description && (
        <p className="text-xs opacity-80 line-clamp-2">{node.description}</p>
      )}
      
      {node.estimatedTime && (
        <div className="flex items-center gap-1 mt-2">
          <Clock className="w-3 h-3" />
          <span className="text-xs opacity-75">{node.estimatedTime}min</span>
        </div>
      )}
      
      {isActive && (
        <motion.div
          className="absolute -top-1 -right-1 bg-green-500 rounded-full w-3 h-3"
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
        />
      )}
    </motion.div>
  )
}

/**
 * Render ASCII visualization fallback
 */
const AsciiVisualization: React.FC<{ 
  visualization: string 
  className?: string 
}> = ({ visualization, className }) => (
  <ScrollArea className={className}>
    <pre className="text-xs font-mono whitespace-pre-wrap p-4 bg-slate-50 rounded-lg border">
      {visualization || 'No visualization available'}
    </pre>
  </ScrollArea>
)

/**
 * Main workflow visualization component
 */
export const WorkflowVisualization: React.FC<WorkflowVisualizationProps> = ({
  workflow,
  currentNodeId,
  onNodeClick,
  showControls = false,
  className = ''
}) => {
  const [viewMode, setViewMode] = React.useState<'visual' | 'ascii'>('visual')
  
  // Sort nodes by position for proper layout
  const sortedNodes = [...workflow.nodes].sort((a, b) => {
    if (a.position && b.position) {
      return a.position.x - b.position.x
    }
    return 0
  })

  const handleNodeClick = (node: WorkflowDSLNode) => {
    if (onNodeClick) {
      onNodeClick(node.id)
    }
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Workflow Visualization</CardTitle>
            <CardDescription>
              {workflow.nodes.length} nodes • Estimated duration: {workflow.metadata?.estimatedDuration || 'Unknown'} minutes
            </CardDescription>
          </div>
          
          {showControls && (
            <div className="flex gap-2">
              <Button
                variant={viewMode === 'visual' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('visual')}
              >
                Visual
              </Button>
              <Button
                variant={viewMode === 'ascii' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('ascii')}
              >
                ASCII
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      
      <CardContent>
        {viewMode === 'visual' ? (
          <div className="space-y-4">
            {/* Workflow metadata */}
            <div className="flex flex-wrap gap-2 mb-4">
              <Badge variant="secondary">
                {workflow.metadata?.complexity || 'unknown'} complexity
              </Badge>
              <Badge variant="outline">
                {workflow.approvalStatus}
              </Badge>
              {workflow.metadata?.tags?.map((tag, index) => (
                <Badge key={index} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
            
            {/* Node flow visualization */}
            <div className="relative">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {sortedNodes.map((node, index) => (
                  <React.Fragment key={node.id}>
                    <WorkflowNode
                      node={node}
                      isActive={node.id === currentNodeId}
                      onClick={() => handleNodeClick(node)}
                    />
                    
                    {/* Arrow between nodes */}
                    {index < sortedNodes.length - 1 && (
                      <div className="hidden lg:flex items-center justify-center col-span-1">
                        <ArrowRight className="w-6 h-6 text-gray-400" />
                      </div>
                    )}
                  </React.Fragment>
                ))}
              </div>
              
              {/* Mobile flow arrows */}
              <div className="lg:hidden space-y-2 mt-4">
                {sortedNodes.slice(0, -1).map((_, index) => (
                  <div key={index} className="flex justify-center">
                    <ArrowRight className="w-5 h-5 text-gray-400 rotate-90" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <AsciiVisualization 
            visualization={workflow.visualization}
            className="h-64 md:h-96"
          />
        )}
        
        {/* Workflow statistics */}
        <div className="mt-6 pt-4 border-t grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div className="text-center">
            <div className="font-medium text-lg">{workflow.nodes.length}</div>
            <div className="text-gray-600">Total Nodes</div>
          </div>
          <div className="text-center">
            <div className="font-medium text-lg">{workflow.edges.length}</div>
            <div className="text-gray-600">Connections</div>
          </div>
          <div className="text-center">
            <div className="font-medium text-lg">
              {workflow.nodes.filter(n => n.type === 'agent').length}
            </div>
            <div className="text-gray-600">Agent Tasks</div>
          </div>
          <div className="text-center">
            <div className="font-medium text-lg">
              {workflow.nodes.filter(n => n.type === 'user_prompt').length}
            </div>
            <div className="text-gray-600">User Prompts</div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default WorkflowVisualization