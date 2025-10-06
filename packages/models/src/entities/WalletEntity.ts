/**
 * Wallet Entity - Layer 2
 *
 * Bridges between database records and domain models with validation and transformation.
 * Uses camelCase properties; serialization-helper converts to/from snake_case for PostgreSQL.
 */

import type { WalletModel } from '@starships/protocol';
import { Expose } from 'class-transformer';
import { IsISO8601, IsIn, IsString, Length, Matches, validate, ValidationError } from 'class-validator';

export class WalletEntity implements WalletModel {
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
  @IsIn(['USD'])
  currency!: 'USD';

  // Stored as DECIMAL(18,6) in DB; represent as string in API to preserve precision
  @Expose()
  @IsString()
  // Match optional sign, digits, optional fractional up to 6 places
  @Matches(/^-?\d+(\.\d{1,6})?$/, { message: 'balance must be a decimal string with up to 6 decimal places' })
  balance!: string;

  @Expose()
  @IsISO8601()
  createdAt!: string;

  @Expose()
  @IsISO8601()
  updatedAt!: string;

  /**
   * Simple validation function using class-validator
   */
  static async validate(data: unknown, operation: 'create' | 'update' = 'create'): Promise<void> {
    if (!data || typeof data !== 'object') {
      throw new Error('Data must be an object');
    }

    const dataRecord = data as Record<string, unknown>;
    const entity = new WalletEntity();

    if (operation === 'create') {
      Object.assign(entity, {
        id: dataRecord.id || 'temp-id',
        starshipId: dataRecord.starshipId || '',
        currency: (dataRecord.currency as 'USD') || 'USD',
        balance: (dataRecord.balance as string) ?? '0.000000',
        createdAt: dataRecord.createdAt || new Date().toISOString(),
        updatedAt: dataRecord.updatedAt || new Date().toISOString(),
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

export default WalletEntity;
