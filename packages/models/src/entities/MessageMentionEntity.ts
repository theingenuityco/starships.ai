/**
 * Message Mention Entity - Layer 2
 *
 * Represents a mention extracted from a message (supports users + agents).
 */

import type { MentionTargetType, MessageMentionModel } from '@starships/protocol';
import { Expose } from 'class-transformer';
import { IsEnum, IsISO8601, IsString, Length, validate, ValidationError } from 'class-validator';

export class MessageMentionEntity implements MessageMentionModel {
  @Expose()
  @IsString()
  @Length(1, 255)
  messageId!: string;

  @Expose()
  @IsString()
  @Length(1, 255)
  conversationId!: string;

  @Expose()
  @IsString()
  @Length(1, 255)
  starshipId!: string;

  @Expose()
  @IsEnum(['user', 'agent'])
  targetType!: MentionTargetType;

  @Expose()
  @IsString()
  @Length(1, 255)
  targetId!: string;

  @Expose()
  @IsISO8601()
  createdAt!: string;

  static async validate(data: unknown, operation: 'create' | 'update' = 'create'): Promise<void> {
    if (!data || typeof data !== 'object') throw new Error('Data must be an object');
    const rec = data as Record<string, unknown>;
    const entity = new MessageMentionEntity();

    if (operation === 'create') {
      Object.assign(entity, {
        messageId: rec.messageId || '',
        conversationId: rec.conversationId || '',
        starshipId: rec.starshipId || '',
        targetType: (rec.targetType as MentionTargetType) || 'user',
        targetId: rec.targetId || '',
        createdAt: (rec.createdAt as string | undefined) || new Date().toISOString(),
      });
    } else {
      Object.assign(entity, rec);
    }

    const errors = await validate(entity, {
      skipMissingProperties: operation === 'update',
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    if (errors.length > 0) {
      const msg = errors.map((e: ValidationError) => Object.values(e.constraints || {}).join(', ')).join('; ');
      throw new Error(`Validation failed: ${msg}`);
    }
  }
}

