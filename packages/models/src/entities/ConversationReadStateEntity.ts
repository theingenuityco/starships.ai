/**
 * Conversation Read State Entity - Layer 2
 *
 * Tracks a user's read cursor in a conversation for unread indicators.
 */

import type { ConversationReadStateModel } from '@starships/protocol';
import { Expose } from 'class-transformer';
import { IsISO8601, IsOptional, IsString, Length, validate, ValidationError } from 'class-validator';

export class ConversationReadStateEntity implements ConversationReadStateModel {
  @Expose()
  @IsString()
  @Length(1, 255)
  conversationId!: string;

  @Expose()
  @IsString()
  @Length(1, 255)
  userId!: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  lastReadMessageId?: string | null;

  @Expose()
  @IsOptional()
  @IsISO8601()
  lastReadAt?: string | null;

  @Expose()
  @IsISO8601()
  updatedAt!: string;

  static async validate(data: unknown, operation: 'create' | 'update' = 'create'): Promise<void> {
    if (!data || typeof data !== 'object') throw new Error('Data must be an object');
    const rec = data as Record<string, unknown>;
    const entity = new ConversationReadStateEntity();

    if (operation === 'create') {
      Object.assign(entity, {
        conversationId: rec.conversationId || '',
        userId: rec.userId || '',
        lastReadMessageId: (rec.lastReadMessageId as string | null | undefined) ?? null,
        lastReadAt: (rec.lastReadAt as string | null | undefined) ?? null,
        updatedAt: (rec.updatedAt as string | undefined) || new Date().toISOString(),
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

