/**
 * Message Entity - Layer 2
 *
 * Bridges between database records and domain models with validation and transformation capabilities.
 * Follows the layered architecture pattern established by ConversationEntity.
 */

import { Transformers } from '@/helpers/serializer';
import type { MessageModel } from '@starships/protocol';
import { Expose, instanceToPlain, plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
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
 * Custom transformers for the MessageEntity
 */
export class MessageTransformers {
  /**
   * Transform content length calculation
   */
  static ContentLengthTransform() {
    return Transform(({ value, obj }) => {
      if (typeof value === 'number') return value;
      return obj.content ? obj.content.length : 0;
    });
  }
}

export class MessageEntity implements MessageModel {
  @Expose()
  @IsString()
  @Length(1, 255)
  id!: string;

  // Base Message interface fields
  @Expose()
  @Transformers.DateTransform()
  @IsISO8601()
  timestamp!: string;

  @Expose()
  @IsEnum(['system', 'user', 'assistant'])
  role!: 'system' | 'user' | 'assistant';

  @Expose()
  @IsString()
  @Length(1, 50000) // Reasonable content length limit
  content!: string;

  @Expose()
  @IsOptional()
  @Transformers.JsonTransform()
  @IsObject()
  metadata?: Record<string, unknown>;

  // Additional database fields
  @Expose()
  @Transformers.DateTransform()
  @IsISO8601()
  createdAt!: string;

  @Expose()
  @Transformers.DateTransform()
  @IsISO8601()
  updatedAt!: string;

  @Expose()
  @IsString()
  @Length(1, 20)
  version!: string;

  @Expose()
  @IsString()
  @Length(1, 255)
  starshipId!: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  agentId?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  memoryId?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  conversationId?: string;

  // Threading and hierarchy
  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  parentMessageId?: string;

  @Expose()
  @IsNumber()
  @Min(0)
  @Max(100) // Reasonable thread depth limit
  threadDepth!: number;

  // Processing status and metadata
  @Expose()
  @IsEnum(['pending', 'processing', 'completed', 'failed'])
  processingStatus!: 'pending' | 'processing' | 'completed' | 'failed';

  @Expose()
  @IsOptional()
  @Transformers.JsonTransform()
  @IsObject()
  processingMetadata?: Record<string, unknown>;

  // Message classification
  @Expose()
  @IsEnum(['user_input', 'agent_response', 'system_message', 'workflow_output'])
  messageType!: 'user_input' | 'agent_response' | 'system_message' | 'workflow_output';

  @Expose()
  @IsEnum(['low', 'medium', 'high', 'critical'])
  importance!: 'low' | 'medium' | 'high' | 'critical';

  // Content analysis
  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 128)
  contentHash?: string;

  @Expose()
  @MessageTransformers.ContentLengthTransform()
  @IsNumber()
  @Min(0)
  contentLength!: number;

  // Attachments and tokens
  @Expose()
  @IsBoolean()
  hasAttachments!: boolean;

  @Expose()
  @IsOptional()
  @IsNumber()
  @Min(0)
  tokenCount?: number;

  @Expose()
  @IsOptional()
  @IsNumber()
  @Min(0)
  processingTimeMs?: number;

  /**
   * Static factory method for creating MessageEntity from raw data
   */
  static deserialize(data: Record<string, unknown>): MessageEntity {
    return plainToInstance(MessageEntity, data, {
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
    const entity = new MessageEntity();

    // For create operations, validate all required fields
    if (operation === 'create') {
      Object.assign(entity, {
        id: dataRecord.id || 'temp-id', // Will be replaced by auto-generated ID
        timestamp: dataRecord.timestamp || new Date().toISOString(),
        role: dataRecord.role || 'user',
        content: dataRecord.content || '',
        metadata: dataRecord.metadata,
        createdAt: dataRecord.createdAt || new Date().toISOString(),
        updatedAt: dataRecord.updatedAt || new Date().toISOString(),
        version: dataRecord.version || '1.0.0',
        starshipId: dataRecord.starshipId || '',
        agentId: dataRecord.agentId,
        memoryId: dataRecord.memoryId,
        conversationId: dataRecord.conversationId,
        parentMessageId: dataRecord.parentMessageId,
        threadDepth: dataRecord.threadDepth ?? 0,
        processingStatus: dataRecord.processingStatus || 'pending',
        processingMetadata: dataRecord.processingMetadata,
        messageType: dataRecord.messageType || 'user_input',
        importance: dataRecord.importance || 'medium',
        contentHash: dataRecord.contentHash,
        contentLength: dataRecord.contentLength ?? 0,
        hasAttachments: dataRecord.hasAttachments ?? false,
        tokenCount: dataRecord.tokenCount,
        processingTimeMs: dataRecord.processingTimeMs,
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

  /**
   * Helper method to check if message is from a user
   */
  isUserMessage(): boolean {
    return this.role === 'user';
  }

  /**
   * Helper method to check if message is from an agent/assistant
   */
  isAgentMessage(): boolean {
    return this.role === 'assistant';
  }

  /**
   * Helper method to check if message is a system message
   */
  isSystemMessage(): boolean {
    return this.role === 'system';
  }

  /**
   * Helper method to check if message is part of a thread
   */
  isThreaded(): boolean {
    return !!(this.parentMessageId || this.threadDepth > 0);
  }

  /**
   * Helper method to check if message processing is complete
   */
  isProcessed(): boolean {
    return this.processingStatus === 'completed';
  }

  /**
   * Helper method to get message age in milliseconds
   */
  getAge(): number {
    return Date.now() - new Date(this.createdAt).getTime();
  }

  /**
   * Helper method to check if message has attachments
   */
  hasAttachedContent(): boolean {
    return this.hasAttachments;
  }
}
