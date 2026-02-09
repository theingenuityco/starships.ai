/**
 * Channel Entity - Layer 2
 *
 * Conversation-backed channel record (identity + visibility).
 */

import type { ChannelModel } from '@starships/protocol';
import { Expose } from 'class-transformer';
import { IsBoolean, IsISO8601, IsIn, IsOptional, IsString, Length, Matches, validate, ValidationError } from 'class-validator';

export class ChannelEntity implements ChannelModel {
  @Expose()
  @IsString()
  @Length(1, 255)
  conversationId!: string;

  @Expose()
  @IsString()
  @Length(1, 255)
  starshipId!: string;

  @Expose()
  @IsString()
  @Length(1, 100)
  @Matches(/^\S(?:.*\S)?$/, { message: 'slug must not have leading/trailing whitespace' })
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'slug must be lowercase alphanumeric with hyphens' })
  slug!: string;

  @Expose()
  @IsString()
  @Length(1, 100)
  @Matches(/^\S(?:.*\S)?$/, { message: 'name must not have leading/trailing whitespace' })
  name!: string;

  @Expose()
  @IsBoolean()
  isPrivate!: boolean;

  @Expose()
  @IsString()
  @IsIn(['chat', 'forum'])
  channelType!: 'chat' | 'forum';

  @Expose()
  @IsOptional()
  @IsString()
  @Length(0, 2000)
  topic?: string | null;

  @Expose()
  @IsISO8601()
  createdAt!: string;

  @Expose()
  @IsISO8601()
  updatedAt!: string;

  static async validate(data: unknown, operation: 'create' | 'update' = 'create'): Promise<void> {
    if (!data || typeof data !== 'object') {
      throw new Error('Data must be an object');
    }
    const dataRecord = data as Record<string, unknown>;
    const entity = new ChannelEntity();

    if (operation === 'create') {
      Object.assign(entity, {
        conversationId: dataRecord.conversationId || '',
        starshipId: dataRecord.starshipId || '',
        slug: dataRecord.slug || '',
        name: dataRecord.name || '',
        isPrivate: Boolean(dataRecord.isPrivate),
        channelType: (dataRecord.channelType as 'chat' | 'forum' | undefined) ?? 'chat',
        topic: (dataRecord.topic as string | null | undefined) ?? null,
        createdAt: dataRecord.createdAt || new Date().toISOString(),
        updatedAt: dataRecord.updatedAt || new Date().toISOString(),
      });
    } else {
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
