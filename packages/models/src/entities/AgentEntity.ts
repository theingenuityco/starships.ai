/**
 * Agent Entity - Layer 2
 *
 * Bridges between database records and domain models with validation and transformation capabilities.
 * Follows the layered architecture pattern established by ConversationEntity and MessageEntity.
 */

import { LLMTransformers, Transformers } from '@/helpers/serializer';
import { AgentMemoryState } from '@starships/autopilot';
import { Blueprint } from '@starships/autopilot/src/types';
import type { AgentModel } from '@starships/protocol';
import { Expose, instanceToPlain, plainToInstance } from 'class-transformer';
import { IsISO8601, IsNumber, IsObject, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class AgentEntity implements AgentModel {
  // Core database fields
  @Expose()
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
  memory!: AgentMemoryState; // AgentMemoryState - keeping flexible for now

  @Expose()
  @Transformers.JsonTransform()
  @IsObject()
  blueprint!: Blueprint; // Blueprint - keeping flexible for now

  /**
   * Static factory method for creating AgentEntity from raw data
   */
  static deserialize(data: Record<string, unknown>): AgentEntity {
    return plainToInstance(AgentEntity, data, {
      strategy: 'excludeAll',
      excludeExtraneousValues: true,
    });
  }

  /**
   * Instance method for converting entity to plain object for storage
   */
  serialize(): Record<string, unknown> {
    return instanceToPlain(this, {
      strategy: 'excludeAll',
      excludeExtraneousValues: true,
    });
  }

  /**
   * Validation method for different contexts
   */
  static async validate(data: unknown, context: 'create' | 'update' = 'create'): Promise<void> {
    if (!data || typeof data !== 'object') {
      throw new Error('Data must be an object');
    }
    const entity = AgentEntity.deserialize(data as Record<string, unknown>);

    // Context-specific validation rules
    if (context === 'create') {
      // For creation, certain fields are required
      if (!entity.name) {
        throw new Error('Name is required for agent creation');
      }
      if (!entity.model) {
        throw new Error('Model is required for agent creation');
      }
    }

    // Business rule validations
    if (entity.name && entity.name.length > 100) {
      throw new Error('Agent name cannot exceed 100 characters');
    }

    if (entity.description && entity.description.length > 500) {
      throw new Error('Agent description cannot exceed 500 characters');
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
    if (entity.blueprint && typeof entity.blueprint === 'object') {
      if (!entity.blueprint.nodes || !Array.isArray(entity.blueprint.nodes)) {
        throw new Error('Blueprint must have a nodes array');
      }
      if (!entity.blueprint.edges || !Array.isArray(entity.blueprint.edges)) {
        throw new Error('Blueprint must have an edges array');
      }
    }

    // Validate memory structure if provided
    if (entity.memory && typeof entity.memory === 'object') {
      if (entity.memory.identity && typeof entity.memory.identity !== 'object') {
        throw new Error('Memory identity must be an object');
      }
    }
  }
}
