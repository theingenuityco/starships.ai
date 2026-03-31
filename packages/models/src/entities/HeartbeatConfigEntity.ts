/**
 * HeartbeatConfig Entity - Layer 2
 *
 * Bridges between database records and domain models with validation
 * and transformation capabilities, following the existing Entity pattern.
 */

import type { HeartbeatConfigModel } from '@starships/protocol';
import { Expose, Transform } from 'class-transformer';
import { IsBoolean, IsISO8601, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min, validate, ValidationError } from 'class-validator';

export class HeartbeatConfigEntity implements HeartbeatConfigModel {
  @Expose()
  @IsString()
  @Length(1, 255)
  id!: string;

  @Expose()
  @IsString()
  @Length(1, 255)
  agentId!: string;

  @Expose()
  @IsString()
  @Length(1, 255)
  roomConversationId!: string;

  @Expose()
  @IsString()
  @Length(1, 255)
  starshipId!: string;

  @Expose()
  @IsString()
  @Length(1, 255)
  ownerUserId!: string;

  @Expose()
  @IsBoolean()
  isEnabled!: boolean;

  @Expose()
  @IsInt()
  @Min(1)
  @Max(1440)
  intervalMinutes!: number;

  @Expose()
  @IsString()
  @MaxLength(10000)
  prompt!: string;

  @Expose()
  @IsInt()
  @Min(0)
  @Max(10000)
  ackMaxChars!: number;

  @Expose()
  @IsOptional()
  @IsString()
  @MaxLength(5)
  @Transform(({ value }) => value ?? null)
  activeHoursStart?: string | null;

  @Expose()
  @IsOptional()
  @IsString()
  @MaxLength(5)
  @Transform(({ value }) => value ?? null)
  activeHoursEnd?: string | null;

  @Expose()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => value ?? null)
  activeHoursTimezone?: string | null;

  @Expose()
  @IsOptional()
  @IsISO8601()
  @Transform(({ value }) => value ?? null)
  lastRunAt?: string | null;

  @Expose()
  @IsISO8601()
  nextRunAt!: string;

  @Expose()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Transform(({ value }) => value ?? null)
  lastRunStatus?: string | null;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  @Transform(({ value }) => value ?? null)
  lastConversationId?: string | null;

  @Expose()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value ?? null)
  lastAlertText?: string | null;

  @Expose()
  @IsOptional()
  @IsISO8601()
  @Transform(({ value }) => value ?? null)
  lastAlertAt?: string | null;

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
    const entity = new HeartbeatConfigEntity();

    if (operation === 'create') {
      const now = new Date().toISOString();
      Object.assign(entity, {
        id: dataRecord.id || 'temp-id',
        agentId: dataRecord.agentId || 'temp-agent-id',
        roomConversationId: dataRecord.roomConversationId || 'temp-room-conversation-id',
        starshipId: dataRecord.starshipId || 'temp-starship-id',
        ownerUserId: dataRecord.ownerUserId || 'temp-owner-user-id',
        isEnabled: typeof dataRecord.isEnabled === 'boolean' ? dataRecord.isEnabled : true,
        intervalMinutes: typeof dataRecord.intervalMinutes === 'number' ? dataRecord.intervalMinutes : 30,
        prompt: dataRecord.prompt || 'Check if everything is running smoothly. If all is well, reply HEARTBEAT_OK. Otherwise, describe any issues.',
        ackMaxChars: typeof dataRecord.ackMaxChars === 'number' ? dataRecord.ackMaxChars : 300,
        activeHoursStart: dataRecord.activeHoursStart ?? null,
        activeHoursEnd: dataRecord.activeHoursEnd ?? null,
        activeHoursTimezone: dataRecord.activeHoursTimezone ?? null,
        lastRunAt: dataRecord.lastRunAt ?? null,
        nextRunAt: dataRecord.nextRunAt || now,
        lastRunStatus: dataRecord.lastRunStatus ?? null,
        lastConversationId: dataRecord.lastConversationId ?? null,
        lastAlertText: dataRecord.lastAlertText ?? null,
        lastAlertAt: dataRecord.lastAlertAt ?? null,
        createdAt: dataRecord.createdAt || now,
        updatedAt: dataRecord.updatedAt || now,
        ...dataRecord,
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

export default HeartbeatConfigEntity;
