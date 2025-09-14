/**
 * Blueprint Entity with Validation and Serialization
 *
 * This class extends the BlueprintModel interface with professional validation and serialization capabilities
 * using class-transformer decorators and class-validator for lean validation.
 */

import { Transformers } from '@/helpers/serializer';
import type { Node, Edge } from '@starships/autopilot';
import type { BlueprintModel } from '@starships/protocol';
import { Expose, Transform } from 'class-transformer';
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
  @IsIn(['general', 'workflow', 'automation', 'integration', 'analysis', 'test'])
  category?: string;

  @Expose()
  @Transform(({ value }) => value ?? 0)
  @Transformers.NumberTransform()
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
        // Don't provide defaults for required arrays - let validation fail if missing
        nodes: dataRecord.nodes,
        edges: dataRecord.edges,
        ...dataRecord,
      });
    } else {
      // For update operations, only validate provided fields
      Object.assign(entity, dataRecord);
    }

    const errors = await validate(entity, {
      skipMissingProperties: operation === 'update',
      whitelist: true,
      forbidNonWhitelisted: true, // Maintain strict validation
    });

    if (errors.length > 0) {
      const errorMessages = errors.map((error: ValidationError) => Object.values(error.constraints || {}).join(', ')).join('; ');
      throw new Error(`Validation failed: ${errorMessages}`);
    }
  }
}

export default BlueprintEntity;
