/**
 * Tool Template Entity - Layer 2
 *
 * Bridges between database records and domain models with validation and transformation capabilities.
 * Follows the layered architecture pattern established by ConversationEntity and AgentTemplateEntity.
 */

import { Transformers } from '@/helpers/serializer';
import { ToolParams } from '@starships/autopilot';
import type { Blueprint } from '@starships/autopilot';
import type { ToolTemplateModel, ToolTemplateCategory } from '@starships/protocol';
import { Expose } from 'class-transformer';
import { IsEnum, IsISO8601, IsNumber, IsObject, IsOptional, IsString, Length, Min, validate, ValidationError } from 'class-validator';

export class ToolTemplateEntity implements ToolTemplateModel {
  [key: string]: unknown;

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
  @Transformers.DateTransform()
  @IsISO8601()
  createdAt!: string;

  @Expose()
  @Transformers.DateTransform()
  @IsISO8601()
  updatedAt!: string;

  // Core ToolParams fields
  @Expose()
  @IsString()
  @Length(1, 100)
  name!: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(0, 500)
  description!: string;

  @Expose()
  @Transformers.JsonTransform()
  @IsObject()
  parameters!: ToolParams['parameters'];

  // Blueprint (execution logic)
  @Expose()
  @Transformers.JsonTransform()
  @IsObject()
  blueprint!: Blueprint;

  // Template metadata
  @Expose()
  @IsEnum(['general', 'api', 'utility', 'data', 'communication', 'automation'])
  category!: ToolTemplateCategory;

  @Expose()
  @IsNumber()
  @Min(0)
  usageCount!: number;

  // Template preview
  @Expose()
  @IsOptional()
  @IsString()
  @Length(0, 1000)
  exampleUsage?: string;

  @Expose()
  @IsOptional()
  @Transformers.JsonTransform()
  requiresApiKey?: boolean;

  @Expose()
  @IsOptional()
  @Transformers.JsonTransform()
  configurationFields?: Array<{
    name: string;
    type: 'string' | 'number' | 'boolean';
    description: string;
    required: boolean;
  }>;

  /**
   * Simple validation function using class-validator
   * This replaces the manual validation approach with a decorator-based solution
   */
  static async validate(data: unknown, operation: 'create' | 'update' = 'create'): Promise<void> {
    if (!data || typeof data !== 'object') {
      throw new Error('Data must be an object');
    }
    const dataRecord = data as Record<string, unknown>;
    const entity = new ToolTemplateEntity();

    // For create operations, validate all required fields
    if (operation === 'create') {
      Object.assign(entity, {
        id: dataRecord.id || 'temp-id', // Will be replaced by auto-generated ID
        slug: dataRecord.slug || '',
        createdAt: dataRecord.createdAt || new Date().toISOString(),
        updatedAt: dataRecord.updatedAt || new Date().toISOString(),
        name: dataRecord.name || '',
        description: dataRecord.description || '',
        parameters: dataRecord.parameters || { type: 'object', properties: {}, required: [] },
        blueprint: (dataRecord as { blueprint?: Blueprint }).blueprint || { nodes: [], edges: [], metadata: {} },
        category: dataRecord.category || 'general',
        usageCount: dataRecord.usageCount ?? 0,
        exampleUsage: dataRecord.exampleUsage,
        requiresApiKey: dataRecord.requiresApiKey ?? false,
        configurationFields: dataRecord.configurationFields || [],
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
