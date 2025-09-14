/**
 * Message Entity - Layer 2
 *
 * Bridges between database records and domain models with validation and transformation capabilities.
 * Follows the layered architecture pattern established by ConversationEntity.
 */

import { Transformers } from '@/helpers/serializer';
import { createFromDatabaseRecord } from '@/helpers/serialization-helper';
import type { MessageModel, MessageType } from '@starships/protocol';
import { Expose, instanceToPlain } from 'class-transformer';
import { IsEnum, IsISO8601, IsString, Length, validate, ValidationError } from 'class-validator';

export class MessageEntity implements MessageModel {
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

  @Expose()
  @IsEnum(['system', 'user', 'assistant'])
  role!: 'system' | 'user' | 'assistant';

  @Expose()
  @IsString()
  @Length(1, 50000) // Reasonable content length limit
  content!: string;

  // Message classification
  @Expose()
  @IsEnum(['user_input', 'agent_response', 'system_message', 'workflow_output'])
  messageType!: MessageType;

  /**
   * Creates a validated entity from API request data
   * Use this when receiving data from API requests that need validation and transformation
   */
  static createFromRequest(data: Record<string, unknown>): MessageEntity {
    const entity = new MessageEntity();
    Object.assign(entity, data);
    return entity;
  }

  /**
   * Converts entity to database storage format
   * Transforms complex objects to JSON strings for Neo4j storage
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
  static fromDatabaseRecord(data: unknown): MessageEntity {
    return createFromDatabaseRecord(MessageEntity, data);
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
    const entity = new MessageEntity();

    // For create operations, validate all required fields
    if (operation === 'create') {
      Object.assign(entity, {
        id: dataRecord.id || 'temp-id', // Will be replaced by auto-generated ID
        createdAt: dataRecord.createdAt || new Date().toISOString(),
        updatedAt: dataRecord.updatedAt || new Date().toISOString(),
        role: dataRecord.role || 'user',
        content: dataRecord.content || '',
        messageType: dataRecord.messageType || 'user_input',
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
