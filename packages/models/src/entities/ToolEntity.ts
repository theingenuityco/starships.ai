/**
 * Tool Entity - Layer 2
 *
 * Bridges between database records and domain models with validation and transformation capabilities.
 * Follows the layered architecture pattern established by AgentEntity.
 */

import type { ToolModel } from '@starships/protocol';
import type { ToolParameterSchema, TransformOperation, Blueprint } from '@starships/autopilot';
import { Expose, Transform } from 'class-transformer';
import { IsISO8601, IsObject, IsOptional, IsString, Length, validate, ValidationError, IsBoolean, IsArray } from 'class-validator';

export class ToolEntity implements ToolModel {
  // Core database fields
  @Expose()
  @IsString()
  @Length(1, 255)
  id!: string;

  @Expose()
  @IsString()
  @Length(1, 100)
  slug!: string;

  @Expose()
  @IsISO8601()
  createdAt!: string;

  @Expose()
  @IsISO8601()
  updatedAt!: string;

  // Foreign key relationships
  @Expose()
  @IsString()
  @Length(1, 255)
  starshipId!: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  templateId?: string;

  // Core ToolParams fields
  @Expose()
  @IsString()
  @Length(1, 100)
  name!: string;

  @Expose()
  @IsString()
  @Length(0, 4000)
  description!: string;

  @Expose()
  @IsObject()
  @Transform(({ value }) => value, { toPlainOnly: true })
  parameters!: {
    type: 'object';
    properties: Record<string, ToolParameterSchema>;
    required?: string[];
  };

  @Expose()
  @IsObject()
  @Transform(({ value }) => value, { toPlainOnly: true })
  blueprint!: Blueprint;

  // BaseParams fields
  @Expose()
  @IsOptional()
  @IsArray()
  @Transform(({ value }) => value, { toPlainOnly: true })
  transforms?: TransformOperation[];

  @Expose()
  @IsOptional()
  @IsArray()
  @Transform(({ value }) => value, { toPlainOnly: true })
  mutations?: TransformOperation[];

  @Expose()
  @IsOptional()
  @IsString()
  condition?: string;

  // Tool-specific fields
  @Expose()
  @IsOptional()
  @IsObject()
  @Transform(({ value }) => value, { toPlainOnly: true })
  configuration?: Record<string, unknown>;

  @Expose()
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  /**
   * Simple validation function using class-validator
   * This replaces the manual validation approach with a decorator-based solution
   */
  static async validate(data: unknown, operation: 'create' | 'update' = 'create'): Promise<void> {
    if (!data || typeof data !== 'object') {
      throw new Error('Data must be an object');
    }
    const dataRecord = data as Record<string, unknown>;
    const entity = new ToolEntity();

    // For create operations, validate all required fields
    if (operation === 'create') {
      Object.assign(entity, {
        id: dataRecord.id || 'temp-id', // Will be replaced by auto-generated ID
        slug: dataRecord.slug || '',
        createdAt: dataRecord.createdAt || new Date().toISOString(),
        updatedAt: dataRecord.updatedAt || new Date().toISOString(),
        starshipId: dataRecord.starshipId || '',
        templateId: dataRecord.templateId,
        name: dataRecord.name || '',
        description: dataRecord.description || '',
        parameters: dataRecord.parameters || { type: 'object', properties: {} },
        blueprint: dataRecord.blueprint || { nodes: [], edges: [] },
        transforms: dataRecord.transforms,
        mutations: dataRecord.mutations,
        condition: dataRecord.condition,
        configuration: dataRecord.configuration || {},
        isEnabled: dataRecord.isEnabled ?? true,
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
