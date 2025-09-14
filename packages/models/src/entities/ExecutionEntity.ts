/**
 * Execution Entity with Validation and Serialization
 *
 * This class extends the ExecutionModel interface with professional validation and serialization capabilities
 * using class-transformer decorators and class-validator for lean validation.
 */

import { Transformers } from '@/helpers/serializer';
import type { ExecutionStatus, NodeResult } from '@starships/autopilot';
import type { ExecutionModel, ExecutionError } from '@starships/protocol';
import { Expose, Transform } from 'class-transformer';
import { IsIn, IsISO8601, IsOptional, IsString, Length, validate, ValidationError } from 'class-validator';

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
  status!: ExecutionStatus;

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
  error?: ExecutionError;

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
  @IsOptional()
  results?: NodeResult[];

  @Expose()
  @Transformers.JsonTransform()
  @IsOptional()
  state?: Record<string, unknown>;

  /**
   * Simple validation function using class-validator
   * This replaces complex validation classes with a lean solution
   */
  static async validate(data: unknown, operation: 'create' | 'update' = 'create'): Promise<void> {
    if (!data || typeof data !== 'object') {
      throw new Error('Data must be an object');
    }
    const dataRecord = data as Record<string, unknown>;
    const entity = new ExecutionEntity();

    // For create operations, validate all required fields
    if (operation === 'create') {
      Object.assign(entity, {
        id: dataRecord.id || 'temp-id', // Will be replaced by auto-generated ID
        workflowId: dataRecord.workflowId,
        createdAt: dataRecord.createdAt || new Date().toISOString(),
        updatedAt: dataRecord.updatedAt || new Date().toISOString(),
        status: dataRecord.status || 'pending',
        currentNodeRef: dataRecord.currentNodeRef,
        executionData: dataRecord.executionData,
        error: dataRecord.error,
        result: dataRecord.result,
        startTime: dataRecord.startTime,
        endTime: dataRecord.endTime,
        pausedAt: dataRecord.pausedAt,
        results: dataRecord.results || [],
        state: dataRecord.state || {},
      });
    } else {
      // For update operations, only validate provided fields
      Object.assign(entity, dataRecord);
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
