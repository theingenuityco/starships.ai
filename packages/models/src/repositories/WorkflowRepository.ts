import { getConnection } from '../connection';
import {
  WorkflowDSL,
  WorkflowApprovalStatus,
  WorkflowValidationResult,
  ValidationError as WorkflowValidationError,
  ValidationWarning as WorkflowValidationWarning,
  ValidationSuggestion as WorkflowValidationSuggestion
} from '@starships/protocol';
import { v4 as uuidv4 } from 'uuid';
import { BaseRepository } from './BaseRepository';

/**
 * Neo4j-based workflow repository
 *
 * Handles all database operations for workflow DSL including CRUD operations,
 * approval status management, and validation.
 */
export class WorkflowRepository extends BaseRepository {
  
  constructor() {
    super('WorkflowRepository');
  }

  /**
   * Create a new workflow
   */
  async create(workflow: Omit<WorkflowDSL, 'id' | 'createdAt'>): Promise<WorkflowDSL> {
    try {
      this.validateRequired(workflow, ['expeditionId', 'nodes', 'edges'], 'create');
      
      const connection = getConnection();
      const workflowId = uuidv4();
      const createdAt = new Date().toISOString();

      const workflowData = {
        id: workflowId,
        expeditionId: workflow.expeditionId,
        nodes: JSON.stringify(workflow.nodes),
        edges: JSON.stringify(workflow.edges),
        visualization: workflow.visualization || '',
        approvalStatus: workflow.approvalStatus || 'pending',
        createdAt,
        approvedAt: workflow.approvedAt || null,
        rejectedAt: workflow.rejectedAt || null,
        metadata: JSON.stringify(workflow.metadata || {})
      };

      // Create workflow node
      const query = `
        CREATE (w:Workflow {
          id: $id,
          expeditionId: $expeditionId,
          nodes: $nodes,
          edges: $edges,
          visualization: $visualization,
          approvalStatus: $approvalStatus,
          createdAt: $createdAt,
          approvedAt: $approvedAt,
          rejectedAt: $rejectedAt,
          metadata: $metadata
        })
        RETURN w
      `;

      const result = await connection.executeQuery<{ w: any }>(query, workflowData);
      
      if (result.length === 0) {
        throw new Error('Failed to create workflow');
      }

      return this.parseWorkflowFromRecord(result[0].w);
    } catch (error) {
      throw this.handleDatabaseError(error, 'create', 'Workflow');
    }
  }

  /**
   * Find workflow by ID
   */
  async findById(id: string): Promise<WorkflowDSL | null> {
    try {
      this.validateRequired({ id }, ['id'], 'findById');
      
      const connection = getConnection();
      const query = 'MATCH (w:Workflow {id: $id}) RETURN w';
      const result = await connection.executeQuery<{ w: any }>(query, { id });
      
      if (result.length === 0) {
        return null;
      }

      return this.parseWorkflowFromRecord(result[0].w);
    } catch (error) {
      throw this.handleDatabaseError(error, 'findById', 'Workflow', id);
    }
  }

  /**
   * Find workflows by expedition ID
   */
  async findByExpeditionId(expeditionId: string): Promise<WorkflowDSL[]> {
    try {
      this.validateRequired({ expeditionId }, ['expeditionId'], 'findByExpeditionId');
      
      const connection = getConnection();
      const query = `
        MATCH (w:Workflow {expeditionId: $expeditionId}) 
        RETURN w 
        ORDER BY w.createdAt DESC
      `;
      const result = await connection.executeQuery<{ w: any }>(query, { expeditionId });
      
      return result.map(record => this.parseWorkflowFromRecord(record.w));
    } catch (error) {
      throw this.handleDatabaseError(error, 'findByExpeditionId', 'Workflow', expeditionId);
    }
  }

  /**
   * Update workflow
   */
  async update(id: string, updates: Partial<WorkflowDSL>): Promise<WorkflowDSL | null> {
    try {
      this.validateRequired({ id }, ['id'], 'update');
      
      const connection = getConnection();
      
      // Build dynamic SET clause based on provided updates
      const setFields: string[] = [];
      const params: Record<string, any> = { id };

      if (updates.nodes) {
        setFields.push('w.nodes = $nodes');
        params.nodes = JSON.stringify(updates.nodes);
      }
      
      if (updates.edges) {
        setFields.push('w.edges = $edges');
        params.edges = JSON.stringify(updates.edges);
      }
      
      if (updates.visualization !== undefined) {
        setFields.push('w.visualization = $visualization');
        params.visualization = updates.visualization;
      }
      
      if (updates.approvalStatus) {
        setFields.push('w.approvalStatus = $approvalStatus');
        params.approvalStatus = updates.approvalStatus;
      }
      
      if (updates.approvedAt) {
        setFields.push('w.approvedAt = $approvedAt');
        params.approvedAt = updates.approvedAt;
      }
      
      if (updates.rejectedAt) {
        setFields.push('w.rejectedAt = $rejectedAt');
        params.rejectedAt = updates.rejectedAt;
      }
      
      if (updates.metadata) {
        setFields.push('w.metadata = $metadata');
        params.metadata = JSON.stringify(updates.metadata);
      }

      if (setFields.length === 0) {
        return this.findById(id);
      }

      const query = `
        MATCH (w:Workflow {id: $id})
        SET ${setFields.join(', ')}
        RETURN w
      `;

      const result = await connection.executeQuery<{ w: any }>(query, params);
      
      if (result.length === 0) {
        return null;
      }

      return this.parseWorkflowFromRecord(result[0].w);
    } catch (error) {
      throw this.handleDatabaseError(error, 'update', 'Workflow', id);
    }
  }

  /**
   * Update approval status
   */
  async updateApprovalStatus(
    id: string, 
    status: WorkflowApprovalStatus, 
    timestamp?: string
  ): Promise<boolean> {
    try {
      this.validateRequired({ id, status }, ['id', 'status'], 'updateApprovalStatus');
      
      const connection = getConnection();
      const now = timestamp || new Date().toISOString();
      
      let setClause = 'w.approvalStatus = $status';
      let params: Record<string, any> = { id, status };

      if (status === 'approved') {
        setClause += ', w.approvedAt = $timestamp';
        params.timestamp = now;
      } else if (status === 'rejected') {
        setClause += ', w.rejectedAt = $timestamp';
        params.timestamp = now;
      }

      const query = `
        MATCH (w:Workflow {id: $id})
        SET ${setClause}
        RETURN w
      `;

      const result = await connection.executeQuery<{ w: any }>(query, params);
      return result.length > 0;
    } catch (error) {
      throw this.handleDatabaseError(error, 'updateApprovalStatus', 'Workflow', id);
    }
  }

  /**
   * Delete workflow
   */
  async delete(id: string): Promise<boolean> {
    try {
      this.validateRequired({ id }, ['id'], 'delete');
      
      const connection = getConnection();
      
      // Delete workflow and any related runtime states
      const query = `
        MATCH (w:Workflow {id: $id})
        OPTIONAL MATCH (w)-[:HAS_RUNTIME_STATE]->(wrs:WorkflowRuntimeState)
        DETACH DELETE w, wrs
        RETURN COUNT(w) as deletedCount
      `;

      const result = await connection.executeQuery<{ deletedCount: number }>(query, { id });
      return result.length > 0 && result[0].deletedCount > 0;
    } catch (error) {
      throw this.handleDatabaseError(error, 'delete', 'Workflow', id);
    }
  }

  /**
   * Find workflows by approval status
   */
  async findByApprovalStatus(status: WorkflowApprovalStatus): Promise<WorkflowDSL[]> {
    try {
      this.validateRequired({ status }, ['status'], 'findByApprovalStatus');
      
      const connection = getConnection();
      const query = `
        MATCH (w:Workflow {approvalStatus: $status}) 
        RETURN w 
        ORDER BY w.createdAt DESC
      `;
      const result = await connection.executeQuery<{ w: any }>(query, { status });
      
      return result.map(record => this.parseWorkflowFromRecord(record.w));
    } catch (error) {
      throw this.handleDatabaseError(error, 'findByApprovalStatus', 'Workflow');
    }
  }

  /**
   * Validate workflow structure
   */
  async validateWorkflow(workflow: WorkflowDSL): Promise<WorkflowValidationResult> {
    const errors: any[] = [];
    const warnings: any[] = [];
    const suggestions: any[] = [];

    // Check for required fields
    if (!workflow.nodes || workflow.nodes.length === 0) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Workflow must have at least one node',
        severity: 'error'
      });
    }

    // Check for start and end nodes
    const startNodes = workflow.nodes.filter((node: any) => node.type === 'start');
    const endNodes = workflow.nodes.filter((node: any) => node.type === 'end');
    
    if (startNodes.length === 0) {
      errors.push({
        code: 'MISSING_START_NODE',
        message: 'Workflow must have a start node',
        severity: 'error'
      });
    }
    
    if (endNodes.length === 0) {
      errors.push({
        code: 'MISSING_END_NODE',
        message: 'Workflow must have an end node',
        severity: 'error'
      });
    }

    // Check for duplicate node IDs
    const nodeIds = new Set();
    for (const node of workflow.nodes) {
      if (nodeIds.has(node.id)) {
        errors.push({
          code: 'DUPLICATE_NODE_ID',
          message: `Duplicate node ID found: ${node.id}`,
          nodeId: node.id,
          severity: 'error'
        });
      }
      nodeIds.add(node.id);
    }

    // Check for duplicate edge IDs
    const edgeIds = new Set();
    for (const edge of workflow.edges) {
      if (edgeIds.has(edge.id)) {
        errors.push({
          code: 'DUPLICATE_EDGE_ID',
          message: `Duplicate edge ID found: ${edge.id}`,
          edgeId: edge.id,
          severity: 'error'
        });
      }
      edgeIds.add(edge.id);
    }

    // Check for unreachable nodes
    const reachableNodes = new Set<string>();
    const nodeMap = new Map(workflow.nodes.map((node: any) => [node.id, node]));
    const edgeMap = new Map(workflow.edges.map((edge: any) => [edge.from, edge.to]));
    
    if (startNodes.length > 0) {
      const queue = [startNodes[0].id];
      while (queue.length > 0) {
        const currentId = queue.shift()!;
        if (reachableNodes.has(currentId)) continue;
        
        reachableNodes.add(currentId);
        
        // Find all edges from this node
        workflow.edges
          .filter((edge: any) => edge.from === currentId)
          .forEach((edge: any) => queue.push(edge.to));
      }
      
      // Check for unreachable nodes
      for (const node of workflow.nodes) {
        if (!reachableNodes.has(node.id)) {
          warnings.push({
            code: 'UNBALANCED_WORKLOAD',
            message: `Node ${node.name} is unreachable`,
            nodeId: node.id,
            suggestion: 'Ensure all nodes are connected to the workflow graph'
          });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      suggestions
    };
  }

  /**
   * Parse workflow from Neo4j record
   */
  private parseWorkflowFromRecord(record: any): WorkflowDSL {
    return {
      id: record.id,
      expeditionId: record.expeditionId,
      nodes: this.parseJsonField(record.nodes, []),
      edges: this.parseJsonField(record.edges, []),
      visualization: record.visualization || '',
      approvalStatus: record.approvalStatus || 'pending',
      createdAt: record.createdAt,
      approvedAt: record.approvedAt || undefined,
      rejectedAt: record.rejectedAt || undefined,
      metadata: this.parseJsonField(record.metadata, {})
    };
  }

  /**
   * Parse JSON field with error handling
   */
  private parseJsonField(value: string | any, defaultValue: any): any {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch (error) {
        console.error('Failed to parse JSON field:', error, 'value:', value);
        return defaultValue;
      }
    }
    return value || defaultValue;
  }
}