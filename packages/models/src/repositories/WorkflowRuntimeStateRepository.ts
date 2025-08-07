import { getConnection } from '../connection';
import {
  WorkflowRuntimeState,
  WorkflowExecutionStatus,
  WorkflowNodeResult
} from '@starships/protocol';
import { v4 as uuidv4 } from 'uuid';
import { BaseRepository } from './BaseRepository';

/**
 * Neo4j-based workflow runtime state repository
 *
 * Handles all database operations for workflow execution state including
 * tracking current execution, node results, and runtime metadata.
 */
export class WorkflowRuntimeStateRepository extends BaseRepository {
  
  constructor() {
    super('WorkflowRuntimeStateRepository');
  }

  /**
   * Create a new workflow runtime state
   */
  async create(runtimeState: Omit<WorkflowRuntimeState, 'id' | 'createdAt' | 'updatedAt'>): Promise<WorkflowRuntimeState> {
    try {
      this.validateRequired(runtimeState, ['workflowId'], 'create');
      
      const connection = getConnection();
      const runtimeStateId = uuidv4();
      const now = new Date().toISOString();

      const stateData = {
        id: runtimeStateId,
        workflowId: runtimeState.workflowId,
        currentNodeId: runtimeState.currentNodeId || null,
        status: runtimeState.status || 'not_started',
        executionResults: JSON.stringify(this.serializeExecutionResults(runtimeState.executionResults)),
        startTime: runtimeState.startTime || null,
        endTime: runtimeState.endTime || null,
        pausedAt: runtimeState.pausedAt || null,
        error: runtimeState.error ? JSON.stringify(runtimeState.error) : null,
        createdAt: now,
        updatedAt: now
      };

      // Create runtime state node and connect to workflow
      const query = `
        MATCH (w:Workflow {id: $workflowId})
        CREATE (wrs:WorkflowRuntimeState {
          id: $id,
          workflowId: $workflowId,
          currentNodeId: $currentNodeId,
          status: $status,
          executionResults: $executionResults,
          startTime: $startTime,
          endTime: $endTime,
          pausedAt: $pausedAt,
          error: $error,
          createdAt: $createdAt,
          updatedAt: $updatedAt
        })
        CREATE (w)-[:HAS_RUNTIME_STATE]->(wrs)
        RETURN wrs
      `;

      const result = await connection.executeQuery<{ wrs: any }>(query, stateData);
      
      if (result.length === 0) {
        throw new Error('Failed to create workflow runtime state');
      }

      return this.parseRuntimeStateFromRecord(result[0].wrs);
    } catch (error) {
      throw this.handleDatabaseError(error, 'create', 'WorkflowRuntimeState');
    }
  }

  /**
   * Find runtime state by ID
   */
  async findById(id: string): Promise<WorkflowRuntimeState | null> {
    try {
      this.validateRequired({ id }, ['id'], 'findById');
      
      const connection = getConnection();
      const query = 'MATCH (wrs:WorkflowRuntimeState {id: $id}) RETURN wrs';
      const result = await connection.executeQuery<{ wrs: any }>(query, { id });
      
      if (result.length === 0) {
        return null;
      }

      return this.parseRuntimeStateFromRecord(result[0].wrs);
    } catch (error) {
      throw this.handleDatabaseError(error, 'findById', 'WorkflowRuntimeState', id);
    }
  }

  /**
   * Find runtime state by workflow ID
   */
  async findByWorkflowId(workflowId: string): Promise<WorkflowRuntimeState | null> {
    try {
      this.validateRequired({ workflowId }, ['workflowId'], 'findByWorkflowId');
      
      const connection = getConnection();
      const query = `
        MATCH (wrs:WorkflowRuntimeState {workflowId: $workflowId}) 
        RETURN wrs 
        ORDER BY wrs.createdAt DESC 
        LIMIT 1
      `;
      const result = await connection.executeQuery<{ wrs: any }>(query, { workflowId });
      
      if (result.length === 0) {
        return null;
      }

      return this.parseRuntimeStateFromRecord(result[0].wrs);
    } catch (error) {
      throw this.handleDatabaseError(error, 'findByWorkflowId', 'WorkflowRuntimeState', workflowId);
    }
  }

  /**
   * Update runtime state
   */
  async update(id: string, updates: Partial<WorkflowRuntimeState>): Promise<WorkflowRuntimeState | null> {
    try {
      this.validateRequired({ id }, ['id'], 'update');
      
      const connection = getConnection();
      
      // Build dynamic SET clause based on provided updates
      const setFields: string[] = ['wrs.updatedAt = $updatedAt'];
      const params: Record<string, any> = { 
        id, 
        updatedAt: new Date().toISOString() 
      };

      if (updates.currentNodeId !== undefined) {
        setFields.push('wrs.currentNodeId = $currentNodeId');
        params.currentNodeId = updates.currentNodeId;
      }
      
      if (updates.status) {
        setFields.push('wrs.status = $status');
        params.status = updates.status;
      }
      
      if (updates.executionResults) {
        setFields.push('wrs.executionResults = $executionResults');
        params.executionResults = JSON.stringify(this.serializeExecutionResults(updates.executionResults));
      }
      
      if (updates.startTime !== undefined) {
        setFields.push('wrs.startTime = $startTime');
        params.startTime = updates.startTime;
      }
      
      if (updates.endTime !== undefined) {
        setFields.push('wrs.endTime = $endTime');
        params.endTime = updates.endTime;
      }
      
      if (updates.pausedAt !== undefined) {
        setFields.push('wrs.pausedAt = $pausedAt');
        params.pausedAt = updates.pausedAt;
      }
      
      if (updates.error !== undefined) {
        setFields.push('wrs.error = $error');
        params.error = updates.error ? JSON.stringify(updates.error) : null;
      }

      const query = `
        MATCH (wrs:WorkflowRuntimeState {id: $id})
        SET ${setFields.join(', ')}
        RETURN wrs
      `;

      const result = await connection.executeQuery<{ wrs: any }>(query, params);
      
      if (result.length === 0) {
        return null;
      }

      return this.parseRuntimeStateFromRecord(result[0].wrs);
    } catch (error) {
      throw this.handleDatabaseError(error, 'update', 'WorkflowRuntimeState', id);
    }
  }

  /**
   * Update execution status
   */
  async updateStatus(id: string, status: WorkflowExecutionStatus): Promise<boolean> {
    try {
      this.validateRequired({ id, status }, ['id', 'status'], 'updateStatus');
      
      const connection = getConnection();
      const now = new Date().toISOString();
      
      let setClause = 'wrs.status = $status, wrs.updatedAt = $updatedAt';
      let params: Record<string, any> = { id, status, updatedAt: now };

      // Set additional timestamps based on status
      if (status === 'running' && !params.startTime) {
        setClause += ', wrs.startTime = $startTime';
        params.startTime = now;
      } else if (status === 'completed' || status === 'failed' || status === 'cancelled') {
        setClause += ', wrs.endTime = $endTime';
        params.endTime = now;
      } else if (status === 'paused') {
        setClause += ', wrs.pausedAt = $pausedAt';
        params.pausedAt = now;
      }

      const query = `
        MATCH (wrs:WorkflowRuntimeState {id: $id})
        SET ${setClause}
        RETURN wrs
      `;

      const result = await connection.executeQuery<{ wrs: any }>(query, params);
      return result.length > 0;
    } catch (error) {
      throw this.handleDatabaseError(error, 'updateStatus', 'WorkflowRuntimeState', id);
    }
  }

  /**
   * Add or update node execution result
   */
  async updateNodeResult(id: string, nodeId: string, result: WorkflowNodeResult): Promise<boolean> {
    try {
      this.validateRequired({ id, nodeId, result }, ['id', 'nodeId', 'result'], 'updateNodeResult');
      
      const connection = getConnection();
      
      // First, get current execution results
      const currentState = await this.findById(id);
      if (!currentState) {
        throw new Error(`Runtime state not found: ${id}`);
      }

      // Update the execution results map
      const executionResults = new Map(currentState.executionResults || new Map());
      executionResults.set(nodeId, result);

      return this.update(id, { 
        executionResults,
        updatedAt: new Date().toISOString()
      }).then(updated => updated !== null);
    } catch (error) {
      throw this.handleDatabaseError(error, 'updateNodeResult', 'WorkflowRuntimeState', id);
    }
  }

  /**
   * Find runtime states by status
   */
  async findByStatus(status: WorkflowExecutionStatus): Promise<WorkflowRuntimeState[]> {
    try {
      this.validateRequired({ status }, ['status'], 'findByStatus');
      
      const connection = getConnection();
      const query = `
        MATCH (wrs:WorkflowRuntimeState {status: $status}) 
        RETURN wrs 
        ORDER BY wrs.updatedAt DESC
      `;
      const result = await connection.executeQuery<{ wrs: any }>(query, { status });
      
      return result.map(record => this.parseRuntimeStateFromRecord(record.wrs));
    } catch (error) {
      throw this.handleDatabaseError(error, 'findByStatus', 'WorkflowRuntimeState');
    }
  }

  /**
   * Delete runtime state
   */
  async delete(id: string): Promise<boolean> {
    try {
      this.validateRequired({ id }, ['id'], 'delete');
      
      const connection = getConnection();
      
      const query = `
        MATCH (wrs:WorkflowRuntimeState {id: $id})
        DETACH DELETE wrs
        RETURN COUNT(wrs) as deletedCount
      `;

      const result = await connection.executeQuery<{ deletedCount: number }>(query, { id });
      return result.length > 0 && result[0].deletedCount > 0;
    } catch (error) {
      throw this.handleDatabaseError(error, 'delete', 'WorkflowRuntimeState', id);
    }
  }

  /**
   * Parse runtime state from Neo4j record
   */
  private parseRuntimeStateFromRecord(record: any): WorkflowRuntimeState {
    return {
      id: record.id,
      workflowId: record.workflowId,
      currentNodeId: record.currentNodeId || undefined,
      status: record.status || 'not_started',
      executionResults: this.deserializeExecutionResults(record.executionResults),
      startTime: record.startTime || undefined,
      endTime: record.endTime || undefined,
      pausedAt: record.pausedAt || undefined,
      error: record.error ? this.parseJsonField(record.error, null) : undefined,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    };
  }

  /**
   * Serialize execution results Map for storage
   */
  private serializeExecutionResults(results: Map<string, WorkflowNodeResult> | undefined): Record<string, WorkflowNodeResult> {
    if (!results) return {};
    
    const serialized: Record<string, WorkflowNodeResult> = {};
    for (const [key, value] of results.entries()) {
      serialized[key] = value;
    }
    return serialized;
  }

  /**
   * Deserialize execution results from storage
   */
  private deserializeExecutionResults(data: string | any): Map<string, WorkflowNodeResult> {
    const results = new Map<string, WorkflowNodeResult>();
    
    let parsed: Record<string, WorkflowNodeResult>;
    if (typeof data === 'string') {
      try {
        parsed = JSON.parse(data);
      } catch {
        return results;
      }
    } else {
      parsed = data || {};
    }

    for (const [key, value] of Object.entries(parsed)) {
      results.set(key, value);
    }
    
    return results;
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