/**
 * Notification Entity - Layer 2
 *
 * Durable notification rows for inbox + badge counts.
 */

import type { NotificationModel, NotificationType } from '@starships/protocol';
import { Expose } from 'class-transformer';
import { IsEnum, IsISO8601, IsOptional, IsString, Length, validate, ValidationError } from 'class-validator';

export class NotificationEntity implements NotificationModel {
  @Expose()
  @IsString()
  @Length(1, 255)
  id!: string;

  @Expose()
  @IsString()
  @Length(1, 255)
  starshipId!: string;

  @Expose()
  @IsString()
  @Length(1, 255)
  userId!: string;

  @Expose()
  @IsEnum(['dm', 'mention', 'reaction', 'channel'])
  type!: NotificationType;

  @Expose()
  @IsString()
  @Length(1, 255)
  conversationId!: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  messageId?: string | null;

  @Expose()
  @IsISO8601()
  createdAt!: string;

  @Expose()
  @IsOptional()
  @IsISO8601()
  seenAt?: string | null;

  @Expose()
  @IsOptional()
  @IsISO8601()
  readAt?: string | null;

  static async validate(data: unknown, operation: 'create' | 'update' = 'create'): Promise<void> {
    if (!data || typeof data !== 'object') throw new Error('Data must be an object');
    const rec = data as Record<string, unknown>;
    const entity = new NotificationEntity();

    if (operation === 'create') {
      Object.assign(entity, {
        id: rec.id || 'temp-id',
        starshipId: rec.starshipId || '',
        userId: rec.userId || '',
        type: (rec.type as NotificationType) || 'mention',
        conversationId: rec.conversationId || '',
        messageId: (rec.messageId as string | null | undefined) ?? null,
        createdAt: (rec.createdAt as string | undefined) || new Date().toISOString(),
        seenAt: (rec.seenAt as string | null | undefined) ?? null,
        readAt: (rec.readAt as string | null | undefined) ?? null,
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
