/**
 * Workflow Entity with Validation and Serialization
 *
 * This class extends the WorkflowModel interface with professional validation and serialization capabilities
 * using class-transformer decorators and class-validator for lean validation.
 */

import { Transformers } from '@/helpers/serializer';
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
  blueprint!: any; // Blueprint interface from autopilot package

  @Expose()
  @Transform(({ value }) => value)
  @IsOptional()
  @IsString()
  @Length(1, 255)
  starshipId?: string;

  /**
   * Deserialize database record into WorkflowEntity
   * Converts raw database records to fully typed and validated WorkflowEntity instances
   */
  static deserialize(data: Record<string, any>): WorkflowEntity {
    return plainToInstance(WorkflowEntity, data, {
      strategy: 'excludeAll',
      excludeExtraneousValues: true,
    });
  }

  /**
   * Serialize WorkflowEntity to database record
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
    const entity = new WorkflowEntity();

    // For create operations, validate all required fields
    if (operation === 'create') {
      Object.assign(entity, {
        id: data.id || 'temp-id', // Will be replaced by auto-generated ID
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: data.updatedAt || new Date().toISOString(),
        name: data.name,
        authorId: data.authorId,
        description: data.description || '',
        category: data.category || 'general',
        version: data.version || '1.0.0',
        usageCount: data.usageCount ?? 0,
        isPublic: data.isPublic ?? false,
        tags: data.tags || [],
        rating: data.rating,
        executionMode: data.executionMode || 'workflow',
        allowedStarshipClasses: data.allowedStarshipClasses || [],
        timeout: data.timeout ?? 30000,
        blueprint: data.blueprint,
        starshipId: data.starshipId,
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

export default WorkflowEntity;
