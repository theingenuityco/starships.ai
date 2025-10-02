/**
 * Usage Entity - Layer 2
 *
 * Persists provider-reported usage per assistant turn and links it to both
 * Starship and Conversation. This replaces message-level usage storage.
 * Uses camelCase properties - serialization-helper converts to/from snake_case for database.
 */

import type { UsageModel } from '@starships/protocol';
import { Expose } from 'class-transformer';
import { IsISO8601, IsNumber, IsOptional, IsString, Length, Min, validate, ValidationError } from 'class-validator';

export class UsageEntity implements UsageModel {
  @Expose()
  @IsString()
  @Length(1, 255)
  id!: string;

  // Foreign keys (string IDs)
  @Expose()
  @IsString()
  @Length(1, 255)
  starshipId!: string;

  @Expose()
  @IsString()
  @Length(1, 255)
  conversationId!: string;

  // Provider-reported usage (camelCase - serialization-helper handles DB conversion)
  @Expose()
  @IsNumber()
  @Min(0)
  promptTokens!: number;

  @Expose()
  @IsNumber()
  @Min(0)
  completionTokens!: number;

  @Expose()
  @IsNumber()
  @Min(0)
  totalTokens!: number;

  @Expose()
  @IsNumber()
  @Min(0)
  cost!: number;

  // Optional provider/model identifier
  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  model?: string;

  // Timestamp
  @Expose()
  @IsISO8601()
  createdAt!: string;

  /**
   * Validation method leveraging class-validator
   */
  static async validate(data: unknown, operation: 'create' | 'update' = 'create'): Promise<void> {
    if (!data || typeof data !== 'object') {
      throw new Error('Data must be an object');
    }

    const dataRecord = data as Record<string, unknown>;
    const entity = new UsageEntity();

    if (operation === 'create') {
      Object.assign(entity, {
        id: dataRecord.id || 'temp-id', // replaced by repository auto-id
        starshipId: dataRecord.starshipId,
        conversationId: dataRecord.conversationId,
        promptTokens: dataRecord.promptTokens,
        completionTokens: dataRecord.completionTokens,
        totalTokens: dataRecord.totalTokens,
        cost: dataRecord.cost,
        model: dataRecord.model,
        createdAt: dataRecord.createdAt || new Date().toISOString(),
        ...dataRecord,
      });
    } else {
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

export default UsageEntity;
