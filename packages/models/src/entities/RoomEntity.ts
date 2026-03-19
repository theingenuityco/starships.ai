/**
 * Room Entity - Layer 2
 *
 * Conversation-backed room record (identity + visibility).
 */

import type { RoomModel } from '@starships/protocol';
import { Expose } from 'class-transformer';
import { IsBoolean, IsISO8601, IsOptional, IsString, Length, Matches, validate, ValidationError } from 'class-validator';

export class RoomEntity implements RoomModel {
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
  @IsOptional()
  @IsString()
  @Length(0, 2000)
  topic?: string | null;

  @Expose()
  @IsOptional()
  @IsString()
  provisionedByBundle?: string | null;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  managerAgentId?: string | null;

  @Expose()
  @IsOptional()
  @IsISO8601()
  managerAgentHeartbeatAt?: string | null;

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
    const entity = new RoomEntity();

    if (operation === 'create') {
      Object.assign(entity, {
        conversationId: dataRecord.conversationId || '',
        starshipId: dataRecord.starshipId || '',
        slug: dataRecord.slug || '',
        name: dataRecord.name || '',
        isPrivate: Boolean(dataRecord.isPrivate),
        topic: (dataRecord.topic as string | null | undefined) ?? null,
        provisionedByBundle: (dataRecord.provisionedByBundle as string | null | undefined) ?? null,
        managerAgentId: (dataRecord.managerAgentId as string | null | undefined) ?? null,
        managerAgentHeartbeatAt: (dataRecord.managerAgentHeartbeatAt as string | null | undefined) ?? null,
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
