/**
 * HeartbeatRun Entity - Layer 2
 *
 * Audit log entity for heartbeat executions. Tracks each run's status,
 * result, duration, and associated conversation.
 */

import type { HeartbeatRunModel } from '@starships/protocol';
import { Expose, Transform } from 'class-transformer';
import { IsISO8601, IsInt, IsOptional, IsString, Length, MaxLength, Min, validate, ValidationError } from 'class-validator';

export class HeartbeatRunEntity implements HeartbeatRunModel {
  @Expose()
  @IsString()
  @Length(1, 255)
  id!: string;

  @Expose()
  @IsString()
  @Length(1, 255)
  heartbeatConfigId!: string;

  @Expose()
  @IsString()
  @Length(1, 255)
  agentId!: string;

  @Expose()
  @IsString()
  @Length(1, 255)
  starshipId!: string;

  @Expose()
  @IsString()
  @MaxLength(50)
  status!: 'ran' | 'skipped' | 'failed';

  @Expose()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => value ?? null)
  result?: string | null;

  @Expose()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Transform(({ value }) => value ?? null)
  durationMs?: number | null;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  @Transform(({ value }) => value ?? null)
  conversationId?: string | null;

  @Expose()
  @IsISO8601()
  startedAt!: string;

  @Expose()
  @IsOptional()
  @IsISO8601()
  @Transform(({ value }) => value ?? null)
  completedAt?: string | null;

  static async validate(data: unknown, operation: 'create' | 'update' = 'create'): Promise<void> {
    if (!data || typeof data !== 'object') {
      throw new Error('Data must be an object');
    }

    const dataRecord = data as Record<string, unknown>;
    const entity = new HeartbeatRunEntity();

    if (operation === 'create') {
      const now = new Date().toISOString();
      Object.assign(entity, {
        id: dataRecord.id || 'temp-id',
        heartbeatConfigId: dataRecord.heartbeatConfigId || 'temp-config-id',
        agentId: dataRecord.agentId || 'temp-agent-id',
        starshipId: dataRecord.starshipId || 'temp-starship-id',
        status: dataRecord.status || 'ran',
        result: dataRecord.result ?? null,
        durationMs: dataRecord.durationMs ?? null,
        conversationId: dataRecord.conversationId ?? null,
        startedAt: dataRecord.startedAt || now,
        completedAt: dataRecord.completedAt ?? null,
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

export default HeartbeatRunEntity;
