/**
 * AutopilotAwaitFiring Entity - Layer 2
 *
 * Idempotency + auditing for resuming awaits from connector events.
 */

import type { AutopilotAwaitFiringModel, AutopilotAwaitFiringStatus } from '@starships/protocol';
import { Expose, Transform } from 'class-transformer';
import { IsISO8601, IsIn, IsOptional, IsString, Length, validate, ValidationError } from 'class-validator';

export class AutopilotAwaitFiringEntity implements AutopilotAwaitFiringModel {
  @Expose()
  @IsString()
  @Length(1, 255)
  id!: string;

  @Expose()
  @IsString()
  @Length(1, 255)
  awaitId!: string;

  @Expose()
  @IsString()
  @Length(1, 255)
  connectorEventId!: string;

  @Expose()
  @IsString()
  @IsIn(['pending', 'running', 'completed', 'failed', 'cancelled'])
  status!: AutopilotAwaitFiringStatus;

  @Expose()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value ?? null)
  runRequestId?: string | null;

  @Expose()
  @IsOptional()
  @IsISO8601()
  startedAt?: string | null;

  @Expose()
  @IsOptional()
  @IsISO8601()
  completedAt?: string | null;

  @Expose()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value ?? null)
  error?: string | null;

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
    const entity = new AutopilotAwaitFiringEntity();

    if (operation === 'create') {
      const now = new Date().toISOString();
      Object.assign(entity, {
        id: dataRecord.id || 'temp-id',
        awaitId: dataRecord.awaitId || 'temp-await-id',
        connectorEventId: dataRecord.connectorEventId || 'temp-event-id',
        status: (dataRecord.status as AutopilotAwaitFiringStatus) || 'pending',
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

export default AutopilotAwaitFiringEntity;

