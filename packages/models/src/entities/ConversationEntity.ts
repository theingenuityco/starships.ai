/**
 * Conversation Entity with Validation and Serialization
 *
 * This class extends the ConversationModel interface with professional validation and serialization capabilities
 * using class-transformer decorators and class-validator for lean validation.
 */

import { Transformers } from '@/helpers/serializer';
import type { ConversationModel } from '@starships/protocol';
import { Expose, instanceToPlain, plainToInstance, Transform } from 'class-transformer';
import { IsIn, IsISO8601, IsNumber, IsOptional, IsString, Length, Min, validate, ValidationError } from 'class-validator';

/**
 * Conversation Entity with validation and serialization
 */
export class ConversationEntity implements ConversationModel {
  @Expose()
  @Transform(({ value }) => value)
  @IsString()
  @Length(1, 255)
  id!: string;

  @Expose()
  @Transformers.DateTransform()
  @IsISO8601()
  createdAt!: string;

  @Expose()
  @Transformers.DateTransform()
  @IsOptional()
  @IsISO8601()
  updatedAt?: string;

  @Expose()
  @Transformers.DateTransform()
  @IsISO8601()
  lastActivityAt!: string;

  @Expose()
  @Transformers.NumberTransform(0)
  @IsNumber()
  @Min(0)
  messageCount!: number;

  @Expose()
  @Transformers.NumberTransform(0)
  @IsNumber()
  @Min(0)
  totalTokens!: number;

  @Expose()
  @Transform(({ value }) => value || 'active')
  @IsIn(['active', 'paused', 'completed', 'archived'])
  status!: 'active' | 'paused' | 'completed' | 'archived';

  @Expose()
  @Transformers.JsonTransform()
  @IsOptional()
  metadata?: Record<string, unknown>;

  // Add relationship fields
  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  starshipId?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  userId?: string;

  /**
   * Deserialize database record into ConversationEntity
   * Converts raw database records to fully typed and validated ConversationEntity instances
   */
  static deserialize(data: Record<string, any>): ConversationEntity {
    return plainToInstance(ConversationEntity, data, {
      strategy: 'excludeAll',
      excludeExtraneousValues: true,
    });
  }

  /**
   * Serialize ConversationEntity to database record
   * Converts entity instance to plain object suitable for database storage
   */
  serialize(): Record<string, any> {
    return instanceToPlain(this, {
      strategy: 'excludeAll',
      excludeExtraneousValues: true,
    });
  }

  /**
   * Simple validation function using class-validator
   * This replaces the complex ConversationValidation class with a lean solution
   */
  static async validateConversationData(data: any, operation: 'create' | 'update' = 'create'): Promise<void> {
    const entity = new ConversationEntity();

    // For create operations, validate all required fields
    if (operation === 'create') {
      Object.assign(entity, {
        id: data.id || 'temp-id', // Will be replaced by auto-generated ID
        createdAt: data.createdAt || new Date().toISOString(),
        lastActivityAt: data.lastActivityAt || new Date().toISOString(),
        messageCount: data.messageCount ?? 0,
        totalTokens: data.totalTokens ?? 0,
        status: data.status || 'active',
        ...data,
      });
    } else {
      // For update operations, only validate provided fields
      Object.assign(entity, data);
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

export default ConversationEntity;
