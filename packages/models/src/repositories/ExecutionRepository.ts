import { Neo4jConnection } from '@/helpers/database';
import { BaseRepository } from '@/repositories/BaseRepository';
import type { CreateExecutionRequest, ExecutionModel } from '@starships/protocol';
import { ExecutionEntity } from '../entities/ExecutionEntity';

export class ExecutionRepository extends BaseRepository {
  constructor(connection?: Neo4jConnection) {
    super('ExecutionRepository', connection);
  }

  async findAll(): Promise<ExecutionModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ e: ExecutionModel }>('MATCH (e:Execution) RETURN e ORDER BY e.createdAt DESC');
        return result.map((record) => ExecutionEntity.fromDatabaseRecord(record.e));
      },
      'findAll',
      'Execution'
    );
  }

  async findById(id: string): Promise<ExecutionModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ e: ExecutionModel }>('MATCH (e:Execution) WHERE e.id = $id RETURN e', { id });
        return result.length > 0 ? ExecutionEntity.fromDatabaseRecord(result[0].e) : null;
      },
      'findById',
      'Execution',
      id
    );
  }

  async create(entity: CreateExecutionRequest): Promise<ExecutionModel> {
    return this.executeWithErrorHandling(
      async () => {
        // Use ExecutionEntity validation
        await ExecutionEntity.validate(entity, 'create');

        const connection = this.getConnection();
        const now = new Date().toISOString();

        // Prepare execution data with defaults and validation
        const executionEntity = ExecutionEntity.createFromRequest({
          ...entity,
          createdAt: now,
          updatedAt: now,
          status: entity.status || 'pending',
        });

        const executionData = executionEntity.toDatabaseFormat();
        // Remove id since it will be auto-generated
        delete (executionData as { id?: string }).id;

        // Use BaseRepository serialization
        const result = await this.createEntityWithAutoId<ExecutionModel>('Execution', executionData);

        // Create relationship with workflow
        await connection.executeWrite(
          `MATCH (w:Workflow {id: $workflowId}), (e:Execution {id: $executionId})
           CREATE (w)-[:HAS_EXECUTION]->(e)`,
          { workflowId: result.workflowId, executionId: result.id }
        );

        // Use ExecutionEntity for consistent mapping
        return ExecutionEntity.fromDatabaseRecord(result);
      },
      'create',
      'Execution'
    );
  }

  async update(
    id: string,
    updates: Partial<ExecutionModel & { executionData?: Record<string, unknown>; result?: Record<string, unknown> }>
  ): Promise<ExecutionModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        // Use ExecutionEntity validation for updates
        await ExecutionEntity.validate(updates, 'update');

        const connection = this.getConnection();
        const setFields = [];
        const params: Record<string, unknown> = { id };
        const now = new Date().toISOString();

        // Handle updatable fields with proper serialization
        if (updates.status !== undefined) {
          setFields.push('e.status = $status');
          params.status = updates.status;

          // Handle automatic timestamp updates for status transitions
          if (updates.status === 'running' && !Object.prototype.hasOwnProperty.call(updates, 'startTime')) {
            setFields.push('e.startTime = $startTime');
            params.startTime = now;
          }
          if (
            (updates.status === 'completed' || updates.status === 'failed' || updates.status === 'cancelled') &&
            !Object.prototype.hasOwnProperty.call(updates, 'endTime')
          ) {
            setFields.push('e.endTime = $endTime');
            params.endTime = now;
          }
          if (updates.status === 'paused' && !Object.prototype.hasOwnProperty.call(updates, 'pausedAt')) {
            setFields.push('e.pausedAt = $pausedAt');
            params.pausedAt = now;
          }
        }
        if (updates.currentNodeRef !== undefined) {
          setFields.push('e.currentNodeRef = $currentNodeRef');
          params.currentNodeRef = updates.currentNodeRef;
        }
        if (updates.executionData !== undefined) {
          setFields.push('e.executionData = $executionData');
          // Use ExecutionEntity to handle executionData serialization
          const tempEntity = ExecutionEntity.createFromRequest({ executionData: updates.executionData });
          const serialized = tempEntity.toDatabaseFormat();
          params.executionData = serialized.executionData;
        }
        if (updates.error !== undefined) {
          setFields.push('e.error = $error');
          params.error = updates.error;
        }
        if (updates.result !== undefined) {
          setFields.push('e.result = $result');
          // Use ExecutionEntity to handle result serialization
          const tempEntity = ExecutionEntity.createFromRequest({ result: updates.result });
          const serialized = tempEntity.toDatabaseFormat();
          params.result = serialized.result;
        }
        if (updates.startTime !== undefined) {
          setFields.push('e.startTime = $startTime');
          params.startTime = updates.startTime;
        }
        if (updates.endTime !== undefined) {
          setFields.push('e.endTime = $endTime');
          params.endTime = updates.endTime;
        }
        if (updates.pausedAt !== undefined) {
          setFields.push('e.pausedAt = $pausedAt');
          params.pausedAt = updates.pausedAt;
        }

        if (setFields.length === 0) {
          return this.findById(id);
        }

        // Always update the updatedAt field
        setFields.push('e.updatedAt = $updatedAt');
        params.updatedAt = now;

        const result = await connection.executeWrite<{ e: ExecutionModel }>(
          `MATCH (e:Execution) WHERE e.id = $id
           SET ${setFields.join(', ')}
           RETURN e`,
          params
        );

        if (result.length === 0) {
          this.handleNotFound('Execution', id);
        }

        // Use ExecutionEntity for consistent mapping
        return ExecutionEntity.fromDatabaseRecord(result[0].e);
      },
      'update',
      'Execution',
      id
    );
  }

  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeWrite<{ deletedCount: number }>(
          'MATCH (e:Execution) WHERE e.id = $id DETACH DELETE e RETURN count(e) as deletedCount',
          { id }
        );

        return result[0]?.deletedCount > 0;
      },
      'delete',
      'Execution',
      id
    );
  }

  async findByWorkflowId(workflowId: string): Promise<ExecutionModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ e: ExecutionModel }>(
          'MATCH (e:Execution) WHERE e.workflowId = $workflowId RETURN e ORDER BY e.createdAt DESC',
          { workflowId }
        );
        return result.map((record) => ExecutionEntity.fromDatabaseRecord(record.e));
      },
      'findByWorkflowId',
      'Execution'
    );
  }

  async findByStatus(status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'): Promise<ExecutionModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ e: ExecutionModel }>(
          'MATCH (e:Execution) WHERE e.status = $status RETURN e ORDER BY e.createdAt DESC',
          { status }
        );
        return result.map((record) => ExecutionEntity.fromDatabaseRecord(record.e));
      },
      'findByStatus',
      'Execution'
    );
  }

  async findActiveExecutions(): Promise<ExecutionModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ e: ExecutionModel }>(
          'MATCH (e:Execution) WHERE e.status IN ["pending", "running", "paused"] RETURN e ORDER BY e.createdAt DESC'
        );
        return result.map((record) => ExecutionEntity.fromDatabaseRecord(record.e));
      },
      'findActiveExecutions',
      'Execution'
    );
  }

  async cancelExecution(id: string, reason?: string): Promise<ExecutionModel | null> {
    return this.update(id, {
      status: 'cancelled',
      error: reason || 'Execution cancelled by user',
    } as unknown as Partial<ExecutionModel>);
  }

  /**
   * Find executions within a date range
   */
  async findByDateRange(startDate: string, endDate: string): Promise<ExecutionModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ e: ExecutionModel }>(
          'MATCH (e:Execution) WHERE e.createdAt >= $startDate AND e.createdAt <= $endDate RETURN e ORDER BY e.createdAt DESC',
          { startDate, endDate }
        );
        return result.map((record) => ExecutionEntity.fromDatabaseRecord(record.e));
      },
      'findByDateRange',
      'Execution'
    );
  }

  /**
   * Get execution statistics
   */
  async getExecutionStats(workflowId?: string): Promise<{
    total: number;
    pending: number;
    running: number;
    paused: number;
    completed: number;
    failed: number;
    cancelled: number;
  }> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        let query = 'MATCH (e:Execution)';
        const params: Record<string, unknown> = {};

        if (workflowId) {
          query += ' WHERE e.workflowId = $workflowId';
          params.workflowId = workflowId;
        }

        query += ` RETURN 
          count(e) as total,
          sum(CASE WHEN e.status = 'pending' THEN 1 ELSE 0 END) as pending,
          sum(CASE WHEN e.status = 'running' THEN 1 ELSE 0 END) as running,
          sum(CASE WHEN e.status = 'paused' THEN 1 ELSE 0 END) as paused,
          sum(CASE WHEN e.status = 'completed' THEN 1 ELSE 0 END) as completed,
          sum(CASE WHEN e.status = 'failed' THEN 1 ELSE 0 END) as failed,
          sum(CASE WHEN e.status = 'cancelled' THEN 1 ELSE 0 END) as cancelled`;

        const result = await connection.executeQuery<{
          total: number;
          pending: number;
          running: number;
          paused: number;
          completed: number;
          failed: number;
          cancelled: number;
        }>(query, params);

        return (
          result[0] || {
            total: 0,
            pending: 0,
            running: 0,
            paused: 0,
            completed: 0,
            failed: 0,
            cancelled: 0,
          }
        );
      },
      'getExecutionStats',
      'Execution'
    );
  }
}
