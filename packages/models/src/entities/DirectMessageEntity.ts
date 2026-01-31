/**
 * DirectMessage Entity - Layer 2
 *
 * Conversation-backed DM record (identity + participants).
 */

import type { DirectMessageModel } from '@starships/protocol';
import { Expose } from 'class-transformer';
import { IsISO8601, IsIn, IsOptional, IsString, Length, validate, ValidationError } from 'class-validator';

export class DirectMessageEntity implements DirectMessageModel {
  @Expose()
  @IsString()
  @Length(1, 255)
  conversationId!: string;

  @Expose()
  @IsString()
  @Length(1, 255)
  starshipId!: string;

  @Expose()
  @IsIn(['user_agent', 'user_user'])
  dmType!: 'user_agent' | 'user_user';

  // user↔agent
  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  userId?: string | null;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  agentId?: string | null;

  // user↔user
  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  userAId?: string | null;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  userBId?: string | null;

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
    const entity = new DirectMessageEntity();

    if (operation === 'create') {
      Object.assign(entity, {
        conversationId: dataRecord.conversationId || '',
        starshipId: dataRecord.starshipId || '',
        dmType: dataRecord.dmType || 'user_agent',
        userId: (dataRecord.userId as string | null | undefined) ?? null,
        agentId: (dataRecord.agentId as string | null | undefined) ?? null,
        userAId: (dataRecord.userAId as string | null | undefined) ?? null,
        userBId: (dataRecord.userBId as string | null | undefined) ?? null,
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
