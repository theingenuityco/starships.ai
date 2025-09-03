import { getConnection } from '../helpers/database';
import { BaseRepository } from './BaseRepository';
import { convertNeo4jIntsInArray, convertNeo4jIntsInObject } from '../helpers/database';

/**
 * Execution status types
 */
export type ExecutionStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

/**
 * Execution model for database operations
 */
export interface ExecutionModel {
  id: string;
  workflowId: string;
  status: ExecutionStatus;
  createdAt: string;
  startTime?: string;
  endTime?: string;
  currentNodeRef?: string;
  executionData?: Record<string, unknown>;
  error?: string;
  result?: Record<string, unknown>;
}

/**
 * Request to create a new execution
 */
export interface CreateExecutionRequest {
  workflowId: string;
  executionData?: Record<string, unknown>;
}

/**
 * Request to update execution
 */
export interface UpdateExecutionRequest {
  status?: ExecutionStatus;
  currentNodeRef?: string;
  executionData?: Record<string, unknown>;
  error?: string;
  result?: Record<string, unknown>;
}

/**
 * ExecutionRepository - Database operations for workflow executions
 */
export class ExecutionRepository extends BaseRepository {
  constructor() {
    super('ExecutionRepository');
  }

  /**
   * Serialize complex fields for Neo4j storage
   */
  private serializeComplexFields(execution: ExecutionModel): any {
    return {
      ...execution,
      executionData: execution.executionData ? JSON.stringify(execution.executionData) : null,
      result: execution.result ? JSON.stringify(execution.result) : null
    };
  }

  /**
   * Deserialize complex fields from Neo4j
   */
  private deserializeComplexFields(execution: any): ExecutionModel {
    try {
      return {
        ...execution,
        executionData: execution.executionData ? JSON.parse(execution.executionData) : undefined,
        result: execution.result ? JSON.parse(execution.result) : undefined
      };
    } catch (error) {
      console.warn('Failed to deserialize execution fields:', error);
      return execution;
    }
  }

  async create(request: CreateExecutionRequest): Promise<ExecutionModel> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired(request, ['workflowId'], 'create');

      const connection = getConnection();
      const now = new Date().toISOString();

      const executionData = {
        workflowId: request.workflowId,
        status: 'pending',
        createdAt: now,
        executionData: request.executionData
      };

      const executionForStorage = this.serializeComplexFields(executionData as ExecutionModel);

      const execution = await this.createEntityWithAutoId<ExecutionModel>('Execution', executionForStorage);

      // Create relationship with workflow
      await connection.executeWrite(
        `MATCH (w:Workflow {id: $workflowId}), (e:Execution {id: $executionId})
         CREATE (w)-[:HAS_EXECUTION]->(e)`,
        { workflowId: execution.workflowId, executionId: execution.id }
      );

      return convertNeo4jIntsInObject(execution);
    }, 'create', 'Execution');
  }

  async findById(id: string): Promise<ExecutionModel | null> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{ e: ExecutionModel }>(
        'MATCH (e:Execution) WHERE e.id = $id RETURN e',
        { id }
      );
      
      const execution = result[0]?.e || null;
      return execution ? convertNeo4jIntsInObject(this.deserializeComplexFields(execution)) : null;
    }, 'findById', 'Execution', id);
  }

  async findByWorkflowId(workflowId: string): Promise<ExecutionModel[]> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{ e: ExecutionModel }>(
        'MATCH (e:Execution) WHERE e.workflowId = $workflowId RETURN e ORDER BY e.createdAt DESC',
        { workflowId }
      );
      
      return convertNeo4jIntsInArray(result.map(record => this.deserializeComplexFields(record.e)));
    }, 'findByWorkflowId', 'Execution');
  }

  async update(id: string, updates: UpdateExecutionRequest): Promise<ExecutionModel | null> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const now = new Date().toISOString();
      
      // Handle status transitions
      const updateProps: any = { ...updates };
      if (updates.status === 'running' && !Object.prototype.hasOwnProperty.call(updates, 'startTime')) {
        updateProps.startTime = now;
      }
      if ((updates.status === 'completed' || updates.status === 'failed' || updates.status === 'cancelled') && !Object.prototype.hasOwnProperty.call(updates, 'endTime')) {
        updateProps.endTime = now;
      }

      const result = await connection.executeWrite<{ e: ExecutionModel }>(
        'MATCH (e:Execution) WHERE e.id = $id SET e += $updates RETURN e',
        { id, updates: updateProps }
      );

      const execution = result[0]?.e || null;
      return execution ? convertNeo4jIntsInObject(this.deserializeComplexFields(execution)) : null;
    }, 'update', 'Execution', id);
  }

  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeWrite<{ deletedCount: number }>(
        'MATCH (e:Execution) WHERE e.id = $id DETACH DELETE e RETURN count(e) as deletedCount',
        { id }
      );
      return result[0]?.deletedCount > 0;
    }, 'delete', 'Execution', id);
  }

  async findByStatus(status: ExecutionStatus): Promise<ExecutionModel[]> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{ e: ExecutionModel }>(
        'MATCH (e:Execution) WHERE e.status = $status RETURN e ORDER BY e.createdAt DESC',
        { status }
      );
      
      return convertNeo4jIntsInArray(result.map(record => this.deserializeComplexFields(record.e)));
    }, 'findByStatus', 'Execution');
  }

  async findActiveExecutions(): Promise<ExecutionModel[]> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{ e: ExecutionModel }>(
        'MATCH (e:Execution) WHERE e.status IN ["pending", "running", "paused"] RETURN e ORDER BY e.createdAt DESC'
      );
      
      return convertNeo4jIntsInArray(result.map(record => this.deserializeComplexFields(record.e)));
    }, 'findActiveExecutions', 'Execution');
  }

  async cancelExecution(id: string, reason?: string): Promise<ExecutionModel | null> {
    return this.update(id, {
      status: 'cancelled',
      error: reason || 'Execution cancelled by user'
    });
  }
}