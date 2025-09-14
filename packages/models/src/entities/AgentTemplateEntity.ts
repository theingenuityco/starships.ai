/**
 * Agent Template Entity - Layer 2
 *
 * Bridges between database records and domain models with validation and transformation capabilities.
 * Follows the layered architecture pattern established by ConversationEntity and AgentEntity.
 */

import { LLMTransformers, Transformers } from '@/helpers/serializer';
import { createFromDatabaseRecord } from '@/helpers/serialization-helper';
import type { AgentMemoryState, Blueprint } from '@starships/autopilot';
import type { AgentTemplateModel } from '@starships/protocol';
import { Expose, instanceToPlain, Transform } from 'class-transformer';
import { IsEnum, IsISO8601, IsNumber, IsObject, IsOptional, IsString, Length, Max, Min, validate, ValidationError } from 'class-validator';

/**
 * Custom transformers for the AgentTemplateEntity
 */
export class AgentTemplateTransformers {
  /**
   * Transform preview prompts array
   */
  static PreviewPromptsTransform() {
    return Transform(({ value }) => {
      if (!value) return [];
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [value];
        }
      }
      return [];
    });
  }
}

export class AgentTemplateEntity implements AgentTemplateModel {
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

  // Core AgentParams fields
  @Expose()
  @IsString()
  @Length(1, 100)
  name!: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @Expose()
  @IsString()
  @Length(1, 100)
  model!: string;

  @Expose()
  @IsOptional()
  @LLMTransformers.TemperatureTransform()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @Expose()
  @IsOptional()
  @LLMTransformers.MaxTokensTransform()
  @IsNumber()
  @Min(1)
  @Max(100000)
  maxTokens?: number;

  @Expose()
  @LLMTransformers.TimeoutTransform()
  @IsNumber()
  @Min(1000)
  @Max(300000)
  timeout!: number;

  @Expose()
  @Transformers.JsonTransform()
  @IsObject()
  memoryState!: AgentMemoryState;

  @Expose()
  @Transformers.JsonTransform()
  @IsObject()
  blueprint!: Blueprint;

  // Template metadata
  @Expose()
  @IsEnum(['general', 'coding', 'creative', 'analysis', 'support'])
  category!: 'general' | 'coding' | 'creative' | 'analysis' | 'support';

  @Expose()
  @IsNumber()
  @Min(0)
  usageCount!: number;

  // Template preview
  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 10)
  icon?: string;

  @Expose()
  @IsOptional()
  @AgentTemplateTransformers.PreviewPromptsTransform()
  previewPrompts?: string[];

  /**
   * Creates a validated entity from API request data
   * Use this when receiving data from API requests that need validation and transformation
   */
  static createFromRequest(data: Record<string, unknown>): AgentTemplateEntity {
    const entity = new AgentTemplateEntity();
    Object.assign(entity, data);
    return entity;
  }

  /**
   * Converts entity to database storage format
   * Transforms complex objects (blueprint, memoryState) to JSON strings for Neo4j storage
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
  static fromDatabaseRecord(data: unknown): AgentTemplateEntity {
    return createFromDatabaseRecord(AgentTemplateEntity, data);
  }

  /**
   * Simple validation function using class-validator
   * This replaces the manual validation approach with a decorator-based solution
   */
  static async validate(data: unknown, operation: 'create' | 'update' = 'create'): Promise<void> {
    if (!data || typeof data !== 'object') {
      throw new Error('Data must be an object');
    }
    const dataRecord = data as Record<string, unknown>;
    const entity = new AgentTemplateEntity();

    // For create operations, validate all required fields
    if (operation === 'create') {
      Object.assign(entity, {
        id: dataRecord.id || 'temp-id', // Will be replaced by auto-generated ID
        slug: dataRecord.slug || '',
        createdAt: dataRecord.createdAt || new Date().toISOString(),
        updatedAt: dataRecord.updatedAt || new Date().toISOString(),
        name: dataRecord.name || '',
        description: dataRecord.description,
        model: dataRecord.model || '',
        temperature: dataRecord.temperature,
        maxTokens: dataRecord.maxTokens,
        timeout: dataRecord.timeout ?? 30000,
        memoryState: dataRecord.memoryState || {},
        blueprint: dataRecord.blueprint || { nodes: [], edges: [] },
        category: dataRecord.category || 'general',
        usageCount: dataRecord.usageCount ?? 0,
        icon: dataRecord.icon,
        previewPrompts: dataRecord.previewPrompts || [],
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
