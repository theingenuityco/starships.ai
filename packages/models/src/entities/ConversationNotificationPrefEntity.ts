/**
 * Conversation Notification Pref Entity - Layer 2
 *
 * Per-user preference for notifications in a conversation (channels).
 */

import { Expose } from 'class-transformer';
import { IsEnum, IsISO8601, IsString, Length, validate, ValidationError } from 'class-validator';

export type ConversationNotificationLevel = 'all' | 'mentions' | 'mute';

export interface ConversationNotificationPrefModel {
  conversationId: string;
  userId: string;
  level: ConversationNotificationLevel;
  createdAt: string;
  updatedAt: string;
}

export class ConversationNotificationPrefEntity implements ConversationNotificationPrefModel {
  @Expose()
  @IsString()
  @Length(1, 255)
  conversationId!: string;

  @Expose()
  @IsString()
  @Length(1, 255)
  userId!: string;

  @Expose()
  @IsEnum(['all', 'mentions', 'mute'])
  level!: ConversationNotificationLevel;

  @Expose()
  @IsISO8601()
  createdAt!: string;

  @Expose()
  @IsISO8601()
  updatedAt!: string;

  static async validate(data: unknown, operation: 'create' | 'update' = 'create'): Promise<void> {
    if (!data || typeof data !== 'object') throw new Error('Data must be an object');
    const rec = data as Record<string, unknown>;
    const entity = new ConversationNotificationPrefEntity();

    if (operation === 'create') {
      Object.assign(entity, {
        conversationId: rec.conversationId || '',
        userId: rec.userId || '',
        level: (rec.level as ConversationNotificationLevel) || 'mentions',
        createdAt: (rec.createdAt as string | undefined) || new Date().toISOString(),
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

