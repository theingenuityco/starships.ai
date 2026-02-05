/**
 * AutopilotAwait Entity - Layer 2
 *
 * Durable checkpoint for headless await/resume semantics.
 */

import type { AutopilotAwaitModel, AutopilotAwaitStatus } from '@starships/protocol';
import { Expose, Transform } from 'class-transformer';
import { IsISO8601, IsObject, IsOptional, IsString, Length, validate, ValidationError, IsIn } from 'class-validator';

export class AutopilotAwaitEntity implements AutopilotAwaitModel {
  @Expose()
  @IsString()
  @Length(1, 255)
  id!: string;

  @Expose()
  @IsString()
  @Length(1, 255)
  starshipId!: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  @Transform(({ value }) => value ?? null)
  ownerUserId?: string | null;

  @Expose()
  @IsString()
  @IsIn(['waiting', 'resuming', 'completed', 'cancelled', 'failed'])
  status!: AutopilotAwaitStatus;

  @Expose()
  @IsObject()
  specJson!: AutopilotAwaitModel['specJson'];

  @Expose()
  @IsObject()
  blueprintJson!: AutopilotAwaitModel['blueprintJson'];

  @Expose()
  @IsOptional()
  @IsObject()
  stateJson?: AutopilotAwaitModel['stateJson'];

  @Expose()
  @IsOptional()
  @IsISO8601()
  expiresAt?: string | null;

  @Expose()
  @IsOptional()
  @IsString()
  lastError?: string | null;

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
    const entity = new AutopilotAwaitEntity();

    if (operation === 'create') {
      const now = new Date().toISOString();
      Object.assign(entity, {
        id: dataRecord.id || 'temp-id',
        starshipId: dataRecord.starshipId || 'temp-starship-id',
        status: (dataRecord.status as AutopilotAwaitStatus) || 'waiting',
        specJson: (dataRecord.specJson as Record<string, unknown>) || {},
        blueprintJson: (dataRecord.blueprintJson as Record<string, unknown>) || {},
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

export default AutopilotAwaitEntity;

