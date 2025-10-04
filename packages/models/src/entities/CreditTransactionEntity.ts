/**
 * Credit Transaction Entity - Layer 2
 *
 * Immutable ledger of all credit transactions for audit trail
 */

import { Expose } from 'class-transformer';
import { IsEnum, IsISO8601, IsNumber, IsOptional, IsString, Length, validate, ValidationError } from 'class-validator';

export type CreditTransactionType = 'purchase' | 'usage' | 'refund' | 'promo';

export class CreditTransactionEntity {
  @Expose()
  @IsString()
  @Length(1, 255)
  id!: string;

  @Expose()
  @IsString()
  @Length(1, 255)
  userId!: string;

  @Expose()
  @IsNumber()
  amount!: number;

  @Expose()
  @IsEnum(['purchase', 'usage', 'refund', 'promo'])
  type!: CreditTransactionType;

  @Expose()
  @IsOptional()
  @IsString()
  description?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  stripePaymentId?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  usageId?: string;

  @Expose()
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  @Expose()
  @IsISO8601()
  createdAt!: string;

  /**
   * Validation method leveraging class-validator
   */
  static async validate(data: unknown, operation: 'create' | 'update' = 'create'): Promise<void> {
    if (!data || typeof data !== 'object') {
      throw new Error('Data must be an object');
    }

    const dataRecord = data as Record<string, unknown>;
    const entity = new CreditTransactionEntity();

    if (operation === 'create') {
      Object.assign(entity, {
        id: dataRecord.id || 'temp-id',
        userId: dataRecord.userId,
        amount: dataRecord.amount,
        type: dataRecord.type,
        description: dataRecord.description,
        stripePaymentId: dataRecord.stripePaymentId,
        usageId: dataRecord.usageId,
        expiresAt: dataRecord.expiresAt,
        createdAt: dataRecord.createdAt || new Date().toISOString(),
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

export default CreditTransactionEntity;
