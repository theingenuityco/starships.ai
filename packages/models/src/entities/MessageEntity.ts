/**
 * Message Entity - Layer 2
 *
 * Bridges between database records and domain models with validation and transformation capabilities.
 * Follows the layered architecture pattern established by ConversationEntity.
 */

import { Transformers } from '@/helpers/serializer';
import type { MessageModel } from '@starships/protocol';
import { Expose, instanceToPlain, plainToInstance, Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsISO8601, IsNumber, IsObject, IsOptional, IsString, Length, Max, Min } from 'class-validator';

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

  // Processing status and metadata (enhanced for streaming)
  @Expose()
  @IsEnum(['pending', 'processing', 'streaming', 'completed', 'failed'])
  processingStatus!: 'pending' | 'processing' | 'streaming' | 'completed' | 'failed';

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

  // Streaming support fields
  @Expose()
  @IsOptional()
  @IsString()
  streamId?: string;

  @Expose()
  @IsOptional()
  @IsBoolean()
  isStreaming?: boolean;

  @Expose()
  @IsOptional()
  @IsBoolean()
  streamCompleted?: boolean;

  /**
   * Static factory method for creating MessageEntity from raw data
   */
  static deserialize(data: Record<string, any>): MessageEntity {
    return plainToInstance(MessageEntity, data, {
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
    const entity = MessageEntity.deserialize(data);

    // Context-specific validation rules
    if (context === 'create') {
      // For creation, certain fields are required
      if (!entity.role) {
        throw new Error('Role is required for message creation');
      }
      if (!entity.content) {
        throw new Error('Content is required for message creation');
      }
      if (!entity.starshipId) {
        throw new Error('Starship ID is required for message creation');
      }
    }

    // Additional business rule validations
    if (entity.threadDepth > 50) {
      throw new Error('Thread depth cannot exceed 50 levels');
    }

    if (entity.content && entity.content.length > 50000) {
      throw new Error('Message content cannot exceed 50,000 characters');
    }

    // Validate processing status consistency
    if (entity.processingStatus === 'completed' && entity.messageType === 'user_input') {
      // User input messages should not be marked as completed by default
      console.warn('User input message marked as completed - ensure this is intentional');
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

  /**
   * Helper method to check if message is currently streaming
   */
  isCurrentlyStreaming(): boolean {
    return this.isStreaming === true && this.streamCompleted !== true;
  }

  /**
   * Helper method to mark message as streaming
   */
  markAsStreaming(streamId: string): void {
    this.streamId = streamId;
    this.isStreaming = true;
    this.streamCompleted = false;
    this.processingStatus = 'streaming';
  }

  /**
   * Helper method to complete streaming
   */
  completeStreaming(): void {
    this.isStreaming = false;
    this.streamCompleted = true;
    this.processingStatus = 'completed';
  }
}
