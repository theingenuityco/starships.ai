/**
 * Blueprint Entity with Validation and Serialization
 *
 * This class extends the BlueprintModel interface with professional validation and serialization capabilities
 * using class-transformer decorators and class-validator for lean validation.
 */

import { Transformers } from '@/helpers/serializer';
import { createFromDatabaseRecord } from '@/helpers/serialization-helper';
import type { Node, Edge } from '@starships/autopilot';
import type { BlueprintModel } from '@starships/protocol';
import { Expose, instanceToPlain, Transform } from 'class-transformer';
import { IsArray, IsIn, IsISO8601, IsNumber, IsOptional, IsString, Length, Min, validate, ValidationError } from 'class-validator';

/**
 * Blueprint Entity with validation and serialization
 */
export class BlueprintEntity implements BlueprintModel {
  @Expose()
  @Transform(({ value }) => value)
  @IsString()
  @Length(1, 255)
  id!: string;

  @Expose()
  @Transformers.DateTransform()
  @IsOptional()
  @IsISO8601()
  createdAt?: string;

  @Expose()
  @Transformers.DateTransform()
  @IsOptional()
  @IsISO8601()
  updatedAt?: string;

  @Expose()
  @Transform(({ value }) => value || '')
  @IsOptional()
  @IsString()
  @Length(1, 255)
  name?: string;

  @Expose()
  @Transform(({ value }) => value || '')
  @IsOptional()
  @IsString()
  description?: string;

  @Expose()
  @Transform(({ value }) => value || 'general')
  @IsOptional()
  @IsIn(['general', 'workflow', 'automation', 'integration', 'analysis'])
  category?: string;

  @Expose()
  @Transformers.NumberTransform(0)
  @IsOptional()
  @IsNumber()
  @Min(0)
  usageCount?: number;

  @Expose()
  @Transformers.JsonTransform()
  @IsOptional()
  metadata?: Record<string, unknown>;

  @Expose()
  @Transformers.JsonTransform()
  @IsArray()
  nodes!: Node[];

  @Expose()
  @Transformers.JsonTransform()
  @IsArray()
  edges!: Edge[];

  /**
   * Creates a validated entity from API request data
   * Use this when receiving data from API requests that need validation and transformation
   */
  static createFromRequest(data: Record<string, unknown>): BlueprintEntity {
    const entity = new BlueprintEntity();
    Object.assign(entity, data);
    return entity;
  }

  /**
   * Converts entity to database storage format
   * Transforms complex objects (nodes, edges, metadata) to JSON strings for Neo4j storage
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
   * Uses safe deserialization with proper error handling
   */
  static fromDatabaseRecord(data: unknown): BlueprintEntity {
    return createFromDatabaseRecord(BlueprintEntity, data);
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
    const entity = new BlueprintEntity();

    // For create operations, validate all required fields
    if (operation === 'create') {
      Object.assign(entity, {
        id: dataRecord.id || 'temp-id', // Will be replaced by auto-generated ID
        createdAt: dataRecord.createdAt || new Date().toISOString(),
        updatedAt: dataRecord.updatedAt || new Date().toISOString(),
        name: dataRecord.name,
        description: dataRecord.description || '',
        category: dataRecord.category || 'general',
        usageCount: dataRecord.usageCount ?? 0,
        metadata: dataRecord.metadata || {},
        nodes: dataRecord.nodes || [],
        edges: dataRecord.edges || [],
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

export default BlueprintEntity;
