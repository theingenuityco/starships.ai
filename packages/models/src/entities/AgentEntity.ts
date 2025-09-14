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
import { IsISO8601, IsNumber, IsObject, IsOptional, IsString, Length, Max, Min, validate, ValidationError } from 'class-validator';

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
  memoryState!: AgentMemoryState; // AgentMemoryState - keeping flexible for now

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
   * Simple validation function using class-validator
   * This replaces the manual validation approach with a decorator-based solution
   */
  static async validate(data: unknown, operation: 'create' | 'update' = 'create'): Promise<void> {
    if (!data || typeof data !== 'object') {
      throw new Error('Data must be an object');
    }
    const dataRecord = data as Record<string, unknown>;
    const entity = new AgentEntity();

    // For create operations, validate all required fields
    if (operation === 'create') {
      Object.assign(entity, {
        id: dataRecord.id || 'temp-id', // Will be replaced by auto-generated ID
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
