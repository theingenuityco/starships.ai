/**
 * Topup Entity - Layer 2
 *
 * Bridges between database records and domain models with validation and transformation.
 * Uses camelCase properties; serialization-helper converts to/from snake_case for PostgreSQL.
 */

import type { TopupModel } from '@starships/protocol';
import { Expose } from 'class-transformer';
import { IsIn, IsISO8601, IsOptional, IsString, Length, Matches, validate, ValidationError } from 'class-validator';

export class TopupEntity implements TopupModel {
  @Expose()
  @IsString()
  @Length(1, 255)
  id!: string;

  @Expose()
  @IsString()
  @Length(1, 255)
  walletId!: string;

  @Expose()
  @IsString()
  // Match optional sign, digits, optional fractional up to 6 places
  @Matches(/^-?\d+(\.\d{1,6})?$/, { message: 'balance must be a decimal string with up to 6 decimal places' })
  amountUsd!: string;

  @Expose()
  @IsIn(['pending', 'completed', 'failed', 'cancelled'])
  status!: 'pending' | 'completed' | 'failed' | 'cancelled';

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  stripeSessionId?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  idempotencyKey?: string;

  @Expose()
  @IsISO8601()
  createdAt!: string;

  @Expose()
  @IsOptional()
  @IsISO8601()
  updatedAt?: string;

  /**
   * Simple validation function using class-validator
   */
  static async validate(data: unknown, operation: 'create' | 'update' = 'create'): Promise<void> {
    if (!data || typeof data !== 'object') {
      throw new Error('Data must be an object');
    }

    const dataRecord = data as Record<string, unknown>;
    const entity = new TopupEntity();

    if (operation === 'create') {
      Object.assign(entity, {
        id: dataRecord.id || 'temp-id',
        walletId: dataRecord.walletId || '',
        amountUsd: dataRecord.amountUsd || '0.000000',
        status: (dataRecord.status as 'pending') || 'pending',
        stripeSessionId: dataRecord.stripeSessionId,
        idempotencyKey: dataRecord.idempotencyKey,
        createdAt: dataRecord.createdAt || new Date().toISOString(),
        updatedAt: dataRecord.updatedAt,
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

export default TopupEntity;
