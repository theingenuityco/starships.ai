/**
 * Ledger Entry Entity - Layer 2
 * Immutable append-only record of wallet mutations
 * Uses camelCase properties; serialization-helper converts to/from snake_case for PostgreSQL.
 */

import type { LedgerEntryModel } from '@starships/protocol';
import { Expose } from 'class-transformer';
import { IsISO8601, IsIn, IsOptional, IsString, Length, Matches, validate, ValidationError } from 'class-validator';

export class LedgerEntryEntity implements LedgerEntryModel {
  @Expose()
  @IsString()
  @Length(1, 255)
  id!: string;

  @Expose()
  @IsString()
  @Length(1, 255)
  walletId!: string;

  @Expose()
  @IsIn(['TOPUP', 'USAGE', 'REFUND', 'ADJUSTMENT'])
  type!: 'TOPUP' | 'USAGE' | 'REFUND' | 'ADJUSTMENT';

  // DECIMAL(18,6) represented as string to preserve precision
  @Expose()
  @IsString()
  @Matches(/^-?\d+(\.\d{1,6})?$/, { message: 'amount must be a decimal string with up to 6 decimal places' })
  amount!: string;

  // DECIMAL(18,6) represented as string to preserve precision
  @Expose()
  @IsString()
  @Matches(/^-?\d+(\.\d{1,6})?$/, { message: 'balanceAfter must be a decimal string with up to 6 decimal places' })
  balanceAfter!: string;

  @Expose()
  @IsOptional()
  meta?: Record<string, unknown>;

  @Expose()
  @IsISO8601()
  createdAt!: string;

  /**
   * Simple validation function using class-validator
   */
  static async validate(data: unknown, operation: 'create' | 'update' = 'create'): Promise<void> {
    if (!data || typeof data !== 'object') {
      throw new Error('Data must be an object');
    }

    const entity = new LedgerEntryEntity();
    Object.assign(entity, data);

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

export default LedgerEntryEntity;
