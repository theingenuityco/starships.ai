/**
 * Agent Entity - Layer 2
 *
 * Bridges between database records and domain models with validation and transformation capabilities.
 * Follows the layered architecture pattern established by ConversationEntity and MessageEntity.
 */

import { AgentState } from '@starships/autopilot';
import { Blueprint } from '@starships/autopilot/src/types';
import type { AgentModel } from '@starships/protocol';
import { Expose, Transform } from 'class-transformer';
import { IsISO8601, IsNumber, IsObject, IsOptional, IsString, Length, Max, Min, validate, ValidationError } from 'class-validator';

export class AgentEntity implements AgentModel {
  // Core database fields
  @Expose()
  @IsString()
  @Length(1, 255)
  id!: string;

  @Expose()
  @IsISO8601()
  createdAt!: string;

  @Expose()
  @IsISO8601()
  updatedAt!: string;

  // Foreign key relationships
  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  starshipId?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  templateId?: string;

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
  systemPrompt?: string; // System prompt moved to root level

  @Expose()
  @IsObject()
  @Transform(({ value }) => value, { toPlainOnly: true })
  state!: AgentState; // Runtime state with messages and tools

  @Expose()
  @IsObject()
  @Transform(({ value }) => value, { toPlainOnly: true })
  blueprint!: Blueprint; // Blueprint - keeping flexible for now

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
        starshipId: dataRecord.starshipId,
        templateId: dataRecord.templateId,
        name: dataRecord.name || '',
        description: dataRecord.description,
        model: dataRecord.model || '',
        temperature: dataRecord.temperature,
        maxTokens: dataRecord.maxTokens,
        timeout: dataRecord.timeout ?? 30000,
        systemPrompt: dataRecord.systemPrompt,
        state: dataRecord.state || { messages: [], tools: [] },
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
