/**
 * Execution Entity with Validation and Serialization
 *
 * This class extends the ExecutionModel interface with professional validation and serialization capabilities
 * using class-transformer decorators and class-validator for lean validation.
 */

import { Transformers } from '@/helpers/serializer';
import type { ExecutionModel } from '@starships/protocol';
import { Expose, instanceToPlain, plainToInstance, Transform } from 'class-transformer';
import { IsIn, IsISO8601, IsOptional, IsString, Length, validate, ValidationError } from 'class-validator';

// Execution status type from autopilot
export type ExecutionStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

/**
 * Execution Entity with validation and serialization
 */
export class ExecutionEntity implements ExecutionModel {
  @Expose()
  @Transform(({ value }) => value)
  @IsString()
  @Length(1, 255)
  id!: string;

  @Expose()
  @Transform(({ value }) => value)
  @IsString()
  @Length(1, 255)
  workflowId!: string;

  @Expose()
  @Transformers.DateTransform()
  @IsISO8601()
  createdAt!: string;

  @Expose()
  @Transformers.DateTransform()
  @IsISO8601()
  updatedAt!: string;

  @Expose()
  @Transform(({ value }) => value || 'pending')
  @IsIn(['pending', 'running', 'paused', 'completed', 'failed', 'cancelled'])
  status!: any; // Use any to avoid type conflicts between different ExecutionStatus definitions

  @Expose()
  @Transform(({ value }) => value)
  @IsOptional()
  @IsString()
  currentNodeRef?: string;

  @Expose()
  @Transformers.JsonTransform()
  @IsOptional()
  executionData?: Record<string, unknown>;

  @Expose()
  @Transformers.JsonTransform()
  @IsOptional()
  error?: any; // Use any for flexibility in error handling

  @Expose()
  @Transformers.JsonTransform()
  @IsOptional()
  result?: Record<string, unknown>;

  @Expose()
  @Transformers.DateTransform()
  @IsOptional()
  @IsISO8601()
  startTime?: string;

  @Expose()
  @Transformers.DateTransform()
  @IsOptional()
  @IsISO8601()
  endTime?: string;

  @Expose()
  @Transformers.DateTransform()
  @IsOptional()
  @IsISO8601()
  pausedAt?: string;

  // Properties from the Execution interface that may not be persisted
  @Expose()
  @Transformers.JsonTransform()
  executionResults!: any; // Use any for flexibility since Map serialization can be complex

  @Expose()
  @Transformers.JsonTransform()
  agentMemory!: any;

  /**
   * Deserialize database record into ExecutionEntity
   * Converts raw database records to fully typed and validated ExecutionEntity instances
   */
  static deserialize(data: Record<string, any>): ExecutionEntity {
    return plainToInstance(ExecutionEntity, data, {
      strategy: 'excludeAll',
      excludeExtraneousValues: true,
    });
  }

  /**
   * Serialize ExecutionEntity to database record
   * Converts entity instance to plain object suitable for database storage
   */
  serialize(): Record<string, any> {
    return instanceToPlain(this, {
      strategy: 'excludeAll',
      excludeExtraneousValues: true,
    });
  }

  /**
   * Simple validation function using class-validator
   * This replaces complex validation classes with a lean solution
   */
  static async validate(data: any, operation: 'create' | 'update' = 'create'): Promise<void> {
    const entity = new ExecutionEntity();

    // For create operations, validate all required fields
    if (operation === 'create') {
      Object.assign(entity, {
        id: data.id || 'temp-id', // Will be replaced by auto-generated ID
        workflowId: data.workflowId,
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: data.updatedAt || new Date().toISOString(),
        status: data.status || 'pending',
        currentNodeRef: data.currentNodeRef,
        executionData: data.executionData,
        error: data.error,
        result: data.result,
        startTime: data.startTime,
        endTime: data.endTime,
        pausedAt: data.pausedAt,
        executionResults: data.executionResults,
        agentMemory: data.agentMemory,
        ...data,
      });
    } else {
      // For update operations, only validate provided fields
      Object.assign(entity, data);
    }

    const errors = await validate(entity, {
      skipMissingProperties: operation === 'update',
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    if (errors.length > 0) {
      const errorMessages = errors.map((error: ValidationError) => Object.values(error.constraints || {}).join(', ')).join('; ');
      throw new Error(`Validation failed: ${errorMessages}`);
    }
  }
}

export default ExecutionEntity;
