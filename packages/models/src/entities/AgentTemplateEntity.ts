/**
 * Agent Template Entity - Layer 2
 *
 * Bridges between database records and domain models with validation and transformation capabilities.
 * Follows the layered architecture pattern established by ConversationEntity and AgentEntity.
 */

import { LLMTransformers, Transformers } from '@/helpers/serializer';
import type { AgentTemplateModel } from '@starships/protocol';
import { Expose, instanceToPlain, plainToInstance, Transform } from 'class-transformer';
import { IsEnum, IsISO8601, IsNumber, IsObject, IsOptional, IsString, Length, Max, Min } from 'class-validator';

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

  // Core AgentNodeParameters fields
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
  memory!: any; // AgentMemoryState - keeping flexible for now

  @Expose()
  @Transformers.JsonTransform()
  @IsObject()
  blueprint!: any; // Blueprint - keeping flexible for now

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
   * Static factory method for creating AgentTemplateEntity from raw data
   */
  static deserialize(data: Record<string, any>): AgentTemplateEntity {
    return plainToInstance(AgentTemplateEntity, data, {
      strategy: 'excludeAll',
      excludeExtraneousValues: true,
    });
  }

  /**
   * Instance method for converting entity to plain object for storage
   */
  serialize(): Record<string, any> {
    return instanceToPlain(this, {
      strategy: 'excludeAll',
      excludeExtraneousValues: true,
    });
  }

  /**
   * Validation method for different contexts
   */
  static async validate(data: any, context: 'create' | 'update' = 'create'): Promise<void> {
    const entity = AgentTemplateEntity.deserialize(data);

    // Context-specific validation rules
    if (context === 'create') {
      // For creation, certain fields are required
      if (!entity.name) {
        throw new Error('Name is required for agent template creation');
      }
      if (!entity.slug) {
        throw new Error('Slug is required for agent template creation');
      }
      if (!entity.model) {
        throw new Error('Model is required for agent template creation');
      }
      if (!entity.category) {
        throw new Error('Category is required for agent template creation');
      }
    }

    // Business rule validations
    if (entity.name && entity.name.length > 100) {
      throw new Error('Agent template name cannot exceed 100 characters');
    }

    if (entity.slug && entity.slug.length > 100) {
      throw new Error('Agent template slug cannot exceed 100 characters');
    }

    if (entity.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entity.slug)) {
      throw new Error('Agent template slug must contain only lowercase letters, numbers, and hyphens');
    }

    if (entity.description && entity.description.length > 500) {
      throw new Error('Agent template description cannot exceed 500 characters');
    }

    if (entity.temperature !== undefined && (entity.temperature < 0 || entity.temperature > 2)) {
      throw new Error('Temperature must be between 0 and 2');
    }

    if (entity.maxTokens !== undefined && (entity.maxTokens < 1 || entity.maxTokens > 100000)) {
      throw new Error('Max tokens must be between 1 and 100,000');
    }

    if (entity.timeout < 1000 || entity.timeout > 300000) {
      throw new Error('Timeout must be between 1,000ms (1s) and 300,000ms (5m)');
    }

    // Validate blueprint structure if provided
    if (entity.blueprint) {
      console.log('[AgentTemplateEntity] Blueprint validation - type:', typeof entity.blueprint);
      console.log(
        '[AgentTemplateEntity] Blueprint validation - keys:',
        entity.blueprint && typeof entity.blueprint === 'object' ? Object.keys(entity.blueprint) : 'N/A'
      );

      // Handle case where blueprint might be a JSON string that needs parsing
      let blueprintObj = entity.blueprint;
      if (typeof entity.blueprint === 'string') {
        try {
          blueprintObj = JSON.parse(entity.blueprint);
        } catch (error) {
          throw new Error('Blueprint must be a valid JSON object');
        }
      }

      if (typeof blueprintObj === 'object' && blueprintObj !== null) {
        console.log('[AgentTemplateEntity] Blueprint object keys:', Object.keys(blueprintObj));
        console.log('[AgentTemplateEntity] Has nodes?', 'nodes' in blueprintObj);
        console.log('[AgentTemplateEntity] Nodes is array?', Array.isArray(blueprintObj.nodes));

        if (!blueprintObj.nodes || !Array.isArray(blueprintObj.nodes)) {
          throw new Error('Blueprint must have a nodes array');
        }
        if (!blueprintObj.edges || !Array.isArray(blueprintObj.edges)) {
          throw new Error('Blueprint must have an edges array');
        }
      }
    }

    // Validate memory structure if provided
    if (entity.memory && typeof entity.memory === 'object') {
      if (entity.memory.identity && typeof entity.memory.identity !== 'object') {
        throw new Error('Memory identity must be an object');
      }
    }

    // Validate preview prompts
    if (entity.previewPrompts && entity.previewPrompts.length > 10) {
      throw new Error('Preview prompts cannot exceed 10 items');
    }
  }
}
