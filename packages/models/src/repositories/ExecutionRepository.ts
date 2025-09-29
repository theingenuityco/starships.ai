import { fromDatabase, fromDatabaseArray, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from '@/repositories/BaseRepository';
import type { CreateExecutionRequest, ExecutionModel } from '@starships/protocol';
import { ExecutionEntity } from '../entities/ExecutionEntity';

export class ExecutionRepository extends BaseRepository {
  constructor() {
    super('ExecutionRepository');
  }

  async findAll(): Promise<ExecutionModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const result = await super.findAllEntities<Record<string, unknown>>('executions', 'created_at DESC');
        return fromDatabaseArray(ExecutionEntity, result);
      },
      'findAll',
      'Execution'
    );
  }

  async findById(id: string): Promise<ExecutionModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const result = await super.findEntityById<Record<string, unknown>>('executions', id);
        return result ? fromDatabase(ExecutionEntity, result) : null;
      },
      'findById',
      'Execution',
      id
    );
  }

  async create(entity: CreateExecutionRequest): Promise<ExecutionModel> {
    return this.executeWithErrorHandling(
      async () => {
        const now = new Date().toISOString();

        // Prepare execution data with defaults and validation
        const executionData = {
          ...entity,
          createdAt: now,
          updatedAt: now,
          status: entity.status || 'pending',
        };

        // Use ExecutionEntity validation
        await ExecutionEntity.validate(executionData, 'create');

        // Convert entity to database format and create
        const databaseFormat = toDatabase(toEntityInstance(ExecutionEntity, executionData));
        const result = await this.createEntity<Record<string, unknown>>('executions', databaseFormat);

        return fromDatabase(ExecutionEntity, result);
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

        const now = new Date().toISOString();

        // Handle automatic timestamp updates for status transitions
        const finalUpdates = { ...updates };
        if (updates.status !== undefined) {
          if (updates.status === 'running' && !Object.prototype.hasOwnProperty.call(updates, 'startTime')) {
            finalUpdates.startTime = now;
          }
          if (
            (updates.status === 'completed' || updates.status === 'failed' || updates.status === 'cancelled') &&
            !Object.prototype.hasOwnProperty.call(updates, 'endTime')
          ) {
            finalUpdates.endTime = now;
          }
          if (updates.status === 'paused' && !Object.prototype.hasOwnProperty.call(updates, 'pausedAt')) {
            finalUpdates.pausedAt = now;
          }
        }

        const updateProps = {
          ...finalUpdates,
          updatedAt: now,
        };

        // Convert entity updates to database format
        const updateData = toDatabase(toEntityInstance(ExecutionEntity, updateProps));

        // Filter out protected fields (id, createdAt)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: _id, created_at: _createdAt, ...filteredUpdateData } = updateData;

        if (Object.keys(filteredUpdateData).length === 0) {
          return await this.findById(id);
        }

        const result = await this.updateEntity<Record<string, unknown>>('executions', id, filteredUpdateData);
        return result ? fromDatabase(ExecutionEntity, result) : null;
      },
      'update',
      'Execution',
      id
    );
  }

  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        return await this.deleteEntity('executions', id);
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
        const result = await connection.query<Record<string, unknown>>(
          'SELECT * FROM executions WHERE workflow_id = $1 ORDER BY created_at DESC',
          [workflowId]
        );
        return fromDatabaseArray(ExecutionEntity, result);
      },
      'findByWorkflowId',
      'Execution'
    );
  }

  async findByStatus(status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'): Promise<ExecutionModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>(
          'SELECT * FROM executions WHERE status = $1 ORDER BY created_at DESC',
          [status]
        );
        return fromDatabaseArray(ExecutionEntity, result);
      },
      'findByStatus',
      'Execution'
    );
  }

  async findActiveExecutions(): Promise<ExecutionModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>(
          "SELECT * FROM executions WHERE status IN ('pending', 'running', 'paused') ORDER BY created_at DESC"
        );
        return fromDatabaseArray(ExecutionEntity, result);
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
        const result = await connection.query<Record<string, unknown>>(
          'SELECT * FROM executions WHERE created_at >= $1 AND created_at <= $2 ORDER BY created_at DESC',
          [startDate, endDate]
        );
        return fromDatabaseArray(ExecutionEntity, result);
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
        let query = `SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
          SUM(CASE WHEN status = 'paused' THEN 1 ELSE 0 END) as paused,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
          FROM executions`;

        const params: unknown[] = [];
        if (workflowId) {
          query += ' WHERE workflow_id = $1';
          params.push(workflowId);
        }

        const result = await connection.queryOne<{
          total: string;
          pending: string;
          running: string;
          paused: string;
          completed: string;
          failed: string;
          cancelled: string;
        }>(query, params);

        return {
          total: parseInt(result?.total || '0', 10),
          pending: parseInt(result?.pending || '0', 10),
          running: parseInt(result?.running || '0', 10),
          paused: parseInt(result?.paused || '0', 10),
          completed: parseInt(result?.completed || '0', 10),
          failed: parseInt(result?.failed || '0', 10),
          cancelled: parseInt(result?.cancelled || '0', 10),
        };
      },
      'getExecutionStats',
      'Execution'
    );
  }
}
