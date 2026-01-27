/**
 * Marketing Content Entity - Layer 2
 *
 * Bridges between database records and domain models with validation and transformation capabilities.
 * Follows the layered architecture pattern established by other entities.
 */

import type {
  MarketingContentModel,
  MarketingContentEntityType,
  MarketingContentType,
  MarketingContentFormat,
  MarketingContentTextFormat,
  MarketingContentGenerationStatus,
} from '@starships/protocol';
import { Expose } from 'class-transformer';
import {
  IsString,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsObject,
  Length,
  Min,
  Max,
  validate,
  ValidationError,
} from 'class-validator';

export class MarketingContentEntity implements MarketingContentModel {
  @Expose()
  @IsString()
  @Length(1, 255)
  id!: string;

  @Expose()
  @IsEnum(['agent_template', 'tool_template', 'connector_template'])
  entityType!: MarketingContentEntityType;

  @Expose()
  @IsString()
  @Length(1, 255)
  entityId!: string;

  @Expose()
  @IsString()
  @Length(1, 50)
  contentType!: MarketingContentType;

  @Expose()
  @IsEnum(['image', 'text', 'video', 'other'])
  contentFormat!: MarketingContentFormat;

  // Storage (for images/videos)
  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 1000)
  s3Key?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 100)
  mimeType?: string;

  // Text content (for text format)
  @Expose()
  @IsOptional()
  @IsString()
  textContent?: string;

  @Expose()
  @IsOptional()
  @IsEnum(['json', 'markdown', 'html', 'plain'])
  textFormat?: MarketingContentTextFormat;

  // Generation pipeline tracking
  @Expose()
  @IsEnum(['pending', 'generating', 'completed', 'failed', 'skipped'])
  generationStatus!: MarketingContentGenerationStatus;

  @Expose()
  @IsOptional()
  @IsISO8601()
  generationRequestedAt?: string;

  @Expose()
  @IsOptional()
  @IsISO8601()
  generationStartedAt?: string;

  @Expose()
  @IsOptional()
  @IsISO8601()
  generationCompletedAt?: string;

  @Expose()
  @IsOptional()
  @IsString()
  generationError?: string;

  // Generation metadata
  @Expose()
  @IsOptional()
  @IsObject()
  generationMetadata?: Record<string, unknown>;

  // Display metadata
  @Expose()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  // Versioning
  @Expose()
  @IsNumber()
  @Min(1)
  version!: number;

  @Expose()
  @IsBoolean()
  isActive!: boolean;

  // Timestamps
  @Expose()
  @IsISO8601()
  createdAt!: string;

  @Expose()
  @IsISO8601()
  updatedAt!: string;

  /**
   * Simple validation function using class-validator
   */
  static async validate(data: unknown, operation: 'create' | 'update' = 'create'): Promise<void> {
    if (!data || typeof data !== 'object') {
      throw new Error('Data must be an object');
    }

    const dataRecord = data as Record<string, unknown>;
    const entity = new MarketingContentEntity();

    // For create operations, validate all required fields
    if (operation === 'create') {
      Object.assign(entity, {
        id: dataRecord.id || 'temp-id',
        entityType: dataRecord.entityType,
        entityId: dataRecord.entityId,
        contentType: dataRecord.contentType,
        contentFormat: dataRecord.contentFormat,
        generationStatus: dataRecord.generationStatus || 'pending',
        version: dataRecord.version || 1,
        isActive: dataRecord.isActive !== undefined ? dataRecord.isActive : true,
        createdAt: dataRecord.createdAt || new Date().toISOString(),
        updatedAt: dataRecord.updatedAt || new Date().toISOString(),
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
      const errorMessages = errors
        .map((error: ValidationError) => Object.values(error.constraints || {}).join(', '))
        .join('; ');
      throw new Error(`Validation failed: ${errorMessages}`);
    }
  }
}
