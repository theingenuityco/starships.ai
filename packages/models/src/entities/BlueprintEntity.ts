/**
 * Blueprint Entity with Validation and Serialization
 *
 * This class extends the BlueprintModel interface with professional validation and serialization capabilities
 * using class-transformer decorators and class-validator for lean validation.
 */

import { Transformers } from '@/helpers/serializer';
import type { BlueprintModel } from '@starships/protocol';
import { Expose, instanceToPlain, plainToInstance, Transform } from 'class-transformer';
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
  nodes!: any[];

  @Expose()
  @Transformers.JsonTransform()
  @IsArray()
  edges!: any[];

  /**
   * Deserialize database record into BlueprintEntity
   * Converts raw database records to fully typed and validated BlueprintEntity instances
   */
  static deserialize(data: Record<string, any>): BlueprintEntity {
    return plainToInstance(BlueprintEntity, data, {
      strategy: 'excludeAll',
      excludeExtraneousValues: true,
    });
  }

  /**
   * Serialize BlueprintEntity to database record
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
    const entity = new BlueprintEntity();

    // For create operations, validate all required fields
    if (operation === 'create') {
      Object.assign(entity, {
        id: data.id || 'temp-id', // Will be replaced by auto-generated ID
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: data.updatedAt || new Date().toISOString(),
        name: data.name,
        description: data.description || '',
        category: data.category || 'general',
        usageCount: data.usageCount ?? 0,
        metadata: data.metadata || {},
        nodes: data.nodes || [],
        edges: data.edges || [],
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

export default BlueprintEntity;
