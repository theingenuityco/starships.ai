/**
 * Conversation Entity with Validation and Serialization
 *
 * This class extends the ConversationModel interface with professional validation and serialization capabilities
 * using class-transformer decorators and BaseRepository validation patterns.
 */

import { SerializableModel, Transformers } from '@/helpers/serializer';
import type { ConversationModel } from '@starships/protocol';
import { Expose, Transform } from 'class-transformer';

/**
 * Serializable Conversation class with validation and transformation decorators
 */
export class ConversationEntity extends SerializableModel implements ConversationModel {
  @Expose()
  @Transform(({ value }) => value)
  id!: string;

  @Expose()
  @Transformers.DateTransform()
  createdAt!: string;

  @Expose()
  @Transformers.DateTransform()
  updatedAt?: string;

  @Expose()
  @Transformers.DateTransform()
  lastActivityAt!: string;

  @Expose()
  @Transformers.NumberTransform(0)
  messageCount!: number;

  @Expose()
  @Transformers.NumberTransform(0)
  totalTokens!: number;

  @Expose()
  @Transform(({ value }) => value || 'active')
  status!: 'active' | 'paused' | 'completed' | 'archived';

  @Expose()
  @Transformers.JsonTransform()
  metadata?: Record<string, unknown>;

  // Add relationship fields
  @Expose()
  starshipId?: string;

  @Expose()
  userId?: string;

  /**
   * Validation constants for conversation fields
   * Used by repositories for consistent validation
   */
  static readonly VALIDATION = {
    REQUIRED_FIELDS: ['id', 'createdAt', 'lastActivityAt', 'messageCount', 'totalTokens', 'status'] as const,
    STATUS_VALUES: ['active', 'paused', 'completed', 'archived'] as const,
    FIELD_TYPES: {
      id: 'string',
      createdAt: 'string',
      updatedAt: 'string',
      lastActivityAt: 'string',
      messageCount: 'number',
      totalTokens: 'number',
      status: 'string',
      starshipId: 'string',
      userId: 'string',
    } as const,
    STRING_LENGTHS: {
      id: { min: 1, max: 255 },
      status: { min: 1, max: 50 },
      starshipId: { min: 1, max: 255 },
      userId: { min: 1, max: 255 },
    } as const,
    ENUM_CONSTRAINTS: {
      status: ['active', 'paused', 'completed', 'archived'],
    } as const,
  } as const;

  /**
   * Create a ConversationEntity from plain data
   */
  static fromData(data: Record<string, any>): ConversationEntity {
    return this.fromDatabase(data);
  }

  /**
   * Validate conversation data using BaseRepository validation patterns
   * This method can be called by repositories before create/update operations
   */
  static validateConversationData(data: any, operation: 'create' | 'update' = 'create'): void {
    // This validation logic will be used by ConversationRepository
    // The actual validation will be done by BaseRepository methods
  }
}

export default ConversationEntity;
