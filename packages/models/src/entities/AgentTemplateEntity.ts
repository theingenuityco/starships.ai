/**
 * Agent Template Entity - Layer 2
 *
 * Bridges between database records and domain models with validation and transformation capabilities.
 * Follows the layered architecture pattern established by ConversationEntity and AgentEntity.
 */

import type { AgentState, Blueprint } from '@starships/autopilot';
import type { AgentTemplateModel, TemplateCategory } from '@starships/protocol';
import { Expose, Transform } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsISO8601,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  validate,
  ValidationError,
} from 'class-validator';

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
  @IsISO8601()
  createdAt!: string;

  @Expose()
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
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @Expose()
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100000)
  maxTokens?: number;

  @Expose()
  @IsNumber()
  @Min(1000)
  @Max(300000)
  timeout!: number;

  @Expose()
  @IsOptional()
  @IsString()
  systemPrompt?: string;

  @Expose()
  @IsObject()
  @Transform(({ value }) => value, { toPlainOnly: true })
  state!: AgentState;

  @Expose()
  @IsObject()
  @Transform(({ value }) => value, { toPlainOnly: true })
  blueprint!: Blueprint;

  // Tool assignment - reference by slugs instead of embedding
  @Expose()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assignedToolSlugs?: string[];

  // Template metadata
  @Expose()
  @IsEnum(['general', 'coding', 'creative', 'analysis', 'support', 'utility', 'data', 'communication', 'automation'])
  category!: TemplateCategory;

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
  @IsArray()
  @IsString({ each: true })
  previewPrompts?: string[];

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
        systemPrompt: dataRecord.systemPrompt,
        state: dataRecord.state || { messages: [], tools: [] },
        blueprint: dataRecord.blueprint || { nodes: [], edges: [] },
        assignedToolSlugs: dataRecord.assignedToolSlugs || [],
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
