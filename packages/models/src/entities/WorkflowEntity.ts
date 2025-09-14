/**
 * Workflow Entity with Validation and Serialization
 *
 * This class extends the WorkflowModel interface with professional validation and serialization capabilities
 * using class-transformer decorators and class-validator for lean validation.
 */

import { Transformers } from '@/helpers/serializer';
import type { Blueprint } from '@starships/autopilot';
import type { WorkflowModel } from '@starships/protocol';
import { Expose, instanceToPlain, plainToInstance, Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
  validate,
  ValidationError,
} from 'class-validator';

/**
 * Workflow Entity with validation and serialization
 */
export class WorkflowEntity implements WorkflowModel {
  [key: string]: unknown;
  @Expose()
  @Transform(({ value }) => value)
  @IsString()
  @Length(1, 255)
  id!: string;

  @Expose()
  @Transformers.DateTransform()
  @IsISO8601()
  createdAt!: string;

  @Expose()
  @Transformers.DateTransform()
  @IsISO8601()
  updatedAt!: string;

  @Expose()
  @Transform(({ value }) => value)
  @IsString()
  @Length(1, 255)
  name!: string;

  @Expose()
  @Transform(({ value }) => value)
  @IsString()
  @Length(1, 255)
  authorId!: string;

  @Expose()
  @Transform(({ value }) => value || '')
  @IsOptional()
  @IsString()
  description?: string;

  @Expose()
  @Transform(({ value }) => value || 'general')
  @IsString()
  @IsIn(['general', 'data-processing', 'automation', 'integration', 'analysis'])
  category!: string;

  @Expose()
  @Transform(({ value }) => value || '1.0.0')
  @IsString()
  version!: string;

  @Expose()
  @Transformers.NumberTransform(0)
  @IsNumber()
  @Min(0)
  usageCount!: number;

  @Expose()
  @Transform(({ value }) => (value !== undefined ? value : false))
  @IsBoolean()
  isPublic!: boolean;

  @Expose()
  @Transformers.JsonTransform()
  @IsArray()
  tags!: string[];

  @Expose()
  @Transformers.NumberTransform()
  @IsOptional()
  @IsNumber()
  @Min(0)
  rating?: number;

  @Expose()
  @Transform(({ value }) => value || 'workflow')
  @IsIn(['simple', 'workflow'])
  executionMode!: 'simple' | 'workflow';

  @Expose()
  @Transformers.JsonTransform()
  @IsOptional()
  @IsArray()
  allowedStarshipClasses?: string[];

  @Expose()
  @Transformers.NumberTransform(30000)
  @IsOptional()
  @IsNumber()
  @Min(1000)
  timeout?: number;

  @Expose()
  @Transformers.JsonTransform()
  blueprint!: Blueprint;

  @Expose()
  @Transform(({ value }) => value)
  @IsOptional()
  @IsString()
  @Length(1, 255)
  starshipId?: string;

  /**
   * Creates a validated entity from API request data
   * Use this when receiving data from API requests that need validation and transformation
   */
  static createFromRequest(data: Record<string, unknown>): WorkflowEntity {
    const entity = new WorkflowEntity();
    Object.assign(entity, data);
    return entity;
  }

  /**
   * Converts entity to database storage format
   * Transforms complex objects (blueprint) to JSON strings for Neo4j storage
   */
  toDatabaseFormat(): Record<string, unknown> {
    return instanceToPlain(this, {
      strategy: 'excludeAll',
      excludeExtraneousValues: true,
    });
  }

  /**
   * Creates entity from database record
   * Transforms JSON strings back to complex objects for API responses
   */
  static fromDatabaseRecord(data: Record<string, unknown>): WorkflowEntity {
    return plainToInstance(WorkflowEntity, data, {
      strategy: 'excludeAll',
      excludeExtraneousValues: true,
    });
  }

  /**
   * Simple validation function using class-validator
   * This replaces complex validation classes with a lean solution
   */
  static async validate(data: unknown, operation: 'create' | 'update' = 'create'): Promise<void> {
    if (!data || typeof data !== 'object') {
      throw new Error('Data must be an object');
    }
    const dataRecord = data as Record<string, unknown>;
    const entity = new WorkflowEntity();

    // For create operations, validate all required fields
    if (operation === 'create') {
      Object.assign(entity, {
        id: dataRecord.id || 'temp-id', // Will be replaced by auto-generated ID
        createdAt: dataRecord.createdAt || new Date().toISOString(),
        updatedAt: dataRecord.updatedAt || new Date().toISOString(),
        name: dataRecord.name,
        authorId: dataRecord.authorId,
        description: dataRecord.description || '',
        category: dataRecord.category || 'general',
        version: dataRecord.version || '1.0.0',
        usageCount: dataRecord.usageCount ?? 0,
        isPublic: dataRecord.isPublic ?? false,
        tags: dataRecord.tags || [],
        rating: dataRecord.rating,
        executionMode: dataRecord.executionMode || 'workflow',
        allowedStarshipClasses: dataRecord.allowedStarshipClasses || [],
        timeout: dataRecord.timeout ?? 30000,
        blueprint: dataRecord.blueprint,
        starshipId: dataRecord.starshipId,
        ...dataRecord,
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

export default WorkflowEntity;
