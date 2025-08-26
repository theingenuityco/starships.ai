/**
 * Workflow Execution Service
 * 
 * Core service for executing workflow DSL graphs. Handles sequential execution,
 * state management, error recovery, and user interaction coordination.
 */

import {
  WorkflowDSL,
  WorkflowDSLNode,
  WorkflowDSLEdge,
  WorkflowNodeResult,
  WorkflowExecutionContext,
  WorkflowRuntimeState,
  WorkflowExecutionStatus,
  WorkflowExecutionError
} from '@starships/protocol';
import { workflowNodeRegistry, WorkflowNodeRegistry } from './WorkflowNodeRegistry';
import { AgentService } from './AgentService';
import { RepositoryFactory } from '@starships/models';
import { Logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

/**
 * Events that can be emitted during workflow execution
 */
export interface WorkflowExecutionEvent {
  type: 'workflow_started' | 'node_started' | 'node_completed' | 'node_failed' | 
        'workflow_paused' | 'workflow_resumed' | 'workflow_completed' | 'workflow_failed';
  workflowId: string;
  contextId: string; // Migration note: was expeditionId
  nodeId?: string;
  data?: any;
  timestamp: string;
}

/**
 * Callback for workflow execution events
 */
export type WorkflowExecutionEventCallback = (event: WorkflowExecutionEvent) => Promise<void>;

/**
 * Main workflow execution service
 */
export class WorkflowExecutionService {
  private static instance: WorkflowExecutionService;
  private logger = Logger.getInstance();
  private nodeRegistry: WorkflowNodeRegistry;
  private eventCallbacks: WorkflowExecutionEventCallback[] = [];
  private runningExecutions: Map<string, WorkflowRuntimeState> = new Map();

  constructor(nodeRegistry?: WorkflowNodeRegistry) {
    this.nodeRegistry = nodeRegistry || workflowNodeRegistry;
  }

  static getInstance(): WorkflowExecutionService {
    if (!WorkflowExecutionService.instance) {
      WorkflowExecutionService.instance = new WorkflowExecutionService();
    }
    return WorkflowExecutionService.instance;
  }

  /**
   * Execute a workflow from start to completion
   */
  async executeWorkflow(
    workflow: WorkflowDSL,
    context: Partial<WorkflowExecutionContext>
  ): Promise<WorkflowRuntimeState> {
    const executionId = uuidv4();
    const logContext = {
      workflowId: workflow.id,
      contextId: workflow.expeditionId, // Migration note: using expeditionId as contextId
      executionId
    };

    this.logger.info('Starting workflow execution', logContext);

    // Initialize runtime state
    const runtimeState: WorkflowRuntimeState = {
      id: executionId,
      workflowId: workflow.id,
      currentNodeId: undefined,
      status: 'not_started',
      executionResults: new Map(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Store in running executions
    this.runningExecutions.set(executionId, runtimeState);

    try {
      // Validate workflow before execution
      await this.validateWorkflowForExecution(workflow);

      // Find start node
      const startNode = this.getStartNode(workflow);
      if (!startNode) {
        throw new Error('No start node found in workflow');
      }

      // Emit start event
      await this.emitEvent({
        type: 'workflow_started',
        workflowId: workflow.id,
        contextId: workflow.expeditionId, // Migration note: using expeditionId as contextId
        timestamp: new Date().toISOString()
      });

      // Update runtime state
      runtimeState.status = 'running';
      runtimeState.startTime = new Date().toISOString();
      runtimeState.updatedAt = new Date().toISOString();

      // Execute workflow graph
      await this.executeWorkflowGraph(workflow, runtimeState, context);

      // Mark as completed if no errors
      if (runtimeState.status === 'running') {
        runtimeState.status = 'completed';
        runtimeState.endTime = new Date().toISOString();
        runtimeState.updatedAt = new Date().toISOString();

        await this.emitEvent({
          type: 'workflow_completed',
          workflowId: workflow.id,
          contextId: workflow.expeditionId, // Migration note: using expeditionId as contextId
          timestamp: new Date().toISOString()
        });
      }

      this.logger.info('Workflow execution completed', {
        ...logContext,
        status: runtimeState.status,
        nodesExecuted: runtimeState.executionResults.size
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      runtimeState.status = 'failed';
      runtimeState.endTime = new Date().toISOString();
      runtimeState.updatedAt = new Date().toISOString();
      runtimeState.error = {
        code: 'SYSTEM_ERROR',
        message: errorMessage,
        timestamp: new Date().toISOString(),
        recoverable: false
      };

      await this.emitEvent({
        type: 'workflow_failed',
        workflowId: workflow.id,
        contextId: workflow.expeditionId, // Migration note: using expeditionId as contextId
        data: { error: errorMessage },
        timestamp: new Date().toISOString()
      });

      this.logger.error('Workflow execution failed', {
        ...logContext,
        error: errorMessage
      });
    } finally {
      // Clean up running execution
      this.runningExecutions.delete(executionId);
    }

    return runtimeState;
  }

  /**
   * Execute the workflow graph node by node
   */
  private async executeWorkflowGraph(
    workflow: WorkflowDSL,
    runtimeState: WorkflowRuntimeState,
    contextData: Partial<WorkflowExecutionContext>
  ): Promise<void> {
    let currentNode = this.getStartNode(workflow);
    
    // Build execution context
    const context: WorkflowExecutionContext = {
      expeditionId: workflow.expeditionId, // Migration note: keeping for backward compatibility
      workflowId: workflow.id,
      userId: contextData.userId || 'system',
      previousResults: runtimeState.executionResults,
      expeditionState: contextData.expeditionState || {}, // Migration note: keeping for backward compatibility
      services: contextData.services || {}
    };

    while (currentNode && runtimeState.status === 'running') {
      try {
        // Update current node
        runtimeState.currentNodeId = currentNode.id;
        runtimeState.updatedAt = new Date().toISOString();

        this.logger.info('Executing workflow node', {
          workflowId: workflow.id,
          nodeId: currentNode.id,
          nodeName: currentNode.name,
          nodeType: currentNode.type
        });

        // Emit node start event
        await this.emitEvent({
          type: 'node_started',
          workflowId: workflow.id,
          contextId: workflow.expeditionId, // Migration note: using expeditionId as contextId
          nodeId: currentNode.id,
          data: { nodeName: currentNode.name, nodeType: currentNode.type },
          timestamp: new Date().toISOString()
        });

        // Execute the node
        const result = await this.executeNode(currentNode, context);
        
        // Store result
        runtimeState.executionResults.set(currentNode.id, result);

        if (result.success) {
          // Emit node completed event
          await this.emitEvent({
            type: 'node_completed',
            workflowId: workflow.id,
            contextId: workflow.expeditionId, // Migration note: using expeditionId as contextId
            nodeId: currentNode.id,
            data: { result: result.data },
            timestamp: new Date().toISOString()
          });

          // Find next node
          const nextNode = this.getNextNode(workflow, currentNode, result.nextEdgeCondition);
          
          if (!nextNode) {
            this.logger.info('No next node found, workflow complete', {
              workflowId: workflow.id,
              nodeId: currentNode.id
            });
            break;
          }

          currentNode = nextNode;

        } else {
          // Node execution failed
          await this.emitEvent({
            type: 'node_failed',
            workflowId: workflow.id,
            contextId: workflow.expeditionId, // Migration note: using expeditionId as contextId
            nodeId: currentNode.id,
            data: { error: result.error },
            timestamp: new Date().toISOString()
          });

          // For now, fail the entire workflow on node failure
          // In the future, this could support retry logic or error recovery
          throw new Error(`Node execution failed: ${result.error}`);
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Node execution failed';
        
        this.logger.error('Node execution error', {
          workflowId: workflow.id,
          nodeId: currentNode.id,
          error: errorMessage
        });

        // Store failed result
        const failedResult: WorkflowNodeResult = {
          nodeId: currentNode.id,
          success: false,
          error: errorMessage,
          executedAt: new Date().toISOString(),
          duration: 0
        };
        runtimeState.executionResults.set(currentNode.id, failedResult);

        throw error;
      }
    }

    // Clear current node when done
    runtimeState.currentNodeId = undefined;
    runtimeState.updatedAt = new Date().toISOString();
  }

  /**
   * Execute a single node
   */
  private async executeNode(
    node: WorkflowDSLNode,
    context: WorkflowExecutionContext
  ): Promise<WorkflowNodeResult> {
    // Get handler for node type
    const handler = this.nodeRegistry.getHandlerForNode(node);
    if (!handler) {
      throw new Error(`No handler found for node type: ${node.type}`);
    }

    this.logger.debug('Executing node with handler', {
      nodeId: node.id,
      handlerType: handler.type
    });

    // Execute the node
    const startTime = Date.now();
    const result = await handler.execute(node, context);
    const duration = Date.now() - startTime;

    // Update duration if not set by handler
    if (!result.duration) {
      result.duration = duration;
    }

    return result;
  }

  /**
   * Find the start node in the workflow
   */
  private getStartNode(workflow: WorkflowDSL): WorkflowDSLNode | null {
    return workflow.nodes.find(node => node.type === 'start') || null;
  }

  /**
   * Find the next node based on current node and edge condition
   */
  private getNextNode(
    workflow: WorkflowDSL,
    currentNode: WorkflowDSLNode,
    edgeCondition?: string
  ): WorkflowDSLNode | null {
    // Find edges from current node
    const outgoingEdges = workflow.edges.filter(edge => edge.from === currentNode.id);

    if (outgoingEdges.length === 0) {
      return null; // No outgoing edges, workflow complete
    }

    // If we have an edge condition, look for matching edge
    if (edgeCondition) {
      const matchingEdge = outgoingEdges.find(edge => edge.condition === edgeCondition);
      if (matchingEdge) {
        return workflow.nodes.find(node => node.id === matchingEdge.to) || null;
      }
    }

    // Look for default edge (no condition)
    const defaultEdge = outgoingEdges.find(edge => !edge.condition);
    if (defaultEdge) {
      return workflow.nodes.find(node => node.id === defaultEdge.to) || null;
    }

    // If no matching edge found and we have edges, take the first one
    if (outgoingEdges.length > 0) {
      this.logger.warn('No matching edge condition, using first available edge', {
        nodeId: currentNode.id,
        edgeCondition,
        availableEdges: outgoingEdges.map(e => ({ to: e.to, condition: e.condition }))
      });
      return workflow.nodes.find(node => node.id === outgoingEdges[0].to) || null;
    }

    return null;
  }

  /**
   * Validate workflow before execution
   */
  private async validateWorkflowForExecution(workflow: WorkflowDSL): Promise<void> {
    // Check for start node
    const startNode = this.getStartNode(workflow);
    if (!startNode) {
      throw new Error('Workflow must have a start node');
    }

    // Check that all node types have handlers
    const unsupportedNodes = [];
    for (const node of workflow.nodes) {
      const handler = this.nodeRegistry.getHandlerForNode(node);
      if (!handler) {
        unsupportedNodes.push({ id: node.id, type: node.type });
      }
    }

    if (unsupportedNodes.length > 0) {
      throw new Error(`Unsupported node types: ${unsupportedNodes.map(n => n.type).join(', ')}`);
    }

    // Validate graph connectivity (basic check)
    const reachableNodes = this.findReachableNodes(workflow, startNode.id);
    const unreachableNodes = workflow.nodes.filter(node => 
      !reachableNodes.has(node.id) && node.type !== 'start'
    );

    if (unreachableNodes.length > 0) {
      this.logger.warn('Found unreachable nodes in workflow', {
        workflowId: workflow.id,
        unreachableNodes: unreachableNodes.map(n => ({ id: n.id, name: n.name }))
      });
    }
  }

  /**
   * Find all nodes reachable from a starting node
   */
  private findReachableNodes(workflow: WorkflowDSL, startNodeId: string): Set<string> {
    const reachable = new Set<string>();
    const queue = [startNodeId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (reachable.has(currentId)) continue;

      reachable.add(currentId);

      // Find outgoing edges and add target nodes to queue
      workflow.edges
        .filter(edge => edge.from === currentId)
        .forEach(edge => queue.push(edge.to));
    }

    return reachable;
  }

  /**
   * Pause workflow execution
   */
  public pauseExecution(executionId: string): boolean {
    const runtimeState = this.runningExecutions.get(executionId);
    if (!runtimeState || runtimeState.status !== 'running') {
      return false;
    }

    runtimeState.status = 'paused';
    runtimeState.pausedAt = new Date().toISOString();
    runtimeState.updatedAt = new Date().toISOString();

    this.emitEvent({
      type: 'workflow_paused',
      workflowId: runtimeState.workflowId,
      contextId: '', // Migration note: Would need to get this from context
      timestamp: new Date().toISOString()
    });

    return true;
  }

  /**
   * Resume workflow execution
   */
  public resumeExecution(executionId: string): boolean {
    const runtimeState = this.runningExecutions.get(executionId);
    if (!runtimeState || runtimeState.status !== 'paused') {
      return false;
    }

    runtimeState.status = 'running';
    runtimeState.pausedAt = undefined;
    runtimeState.updatedAt = new Date().toISOString();

    this.emitEvent({
      type: 'workflow_resumed',
      workflowId: runtimeState.workflowId,
      contextId: '', // Migration note: Would need to get this from context
      timestamp: new Date().toISOString()
    });

    return true;
  }

  /**
   * Get execution status
   */
  public getExecutionStatus(executionId: string): WorkflowRuntimeState | null {
    return this.runningExecutions.get(executionId) || null;
  }

  /**
   * Get all running executions
   */
  public getRunningExecutions(): WorkflowRuntimeState[] {
    return Array.from(this.runningExecutions.values());
  }

  /**
   * Cancel workflow execution
   */
  public cancelExecution(executionId: string): boolean {
    const runtimeState = this.runningExecutions.get(executionId);
    if (!runtimeState || runtimeState.status === 'completed' || runtimeState.status === 'failed') {
      return false;
    }

    runtimeState.status = 'cancelled';
    runtimeState.endTime = new Date().toISOString();
    runtimeState.updatedAt = new Date().toISOString();

    this.runningExecutions.delete(executionId);

    this.logger.info('Workflow execution cancelled', {
      executionId,
      workflowId: runtimeState.workflowId
    });

    return true;
  }

  /**
   * Register event callback
   */
  public onEvent(callback: WorkflowExecutionEventCallback): void {
    this.eventCallbacks.push(callback);
  }

  /**
   * Remove event callback
   */
  public offEvent(callback: WorkflowExecutionEventCallback): void {
    const index = this.eventCallbacks.indexOf(callback);
    if (index > -1) {
      this.eventCallbacks.splice(index, 1);
    }
  }

  /**
   * Emit workflow execution event
   */
  private async emitEvent(event: WorkflowExecutionEvent): Promise<void> {
    this.logger.debug('Emitting workflow event', event);

    // Call all registered callbacks
    for (const callback of this.eventCallbacks) {
      try {
        await callback(event);
      } catch (error) {
        this.logger.error('Error in workflow event callback', {
          eventType: event.type,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }
}