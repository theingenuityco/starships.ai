/**
 * Promo Redemption Entity - Layer 2
 * Bridges between database records and domain models with validation and transformation.
 */

import type { PromoRedemptionModel } from '@starships/protocol';
import { Expose } from 'class-transformer';
import { IsISO8601, IsIn, IsOptional, IsString, Length, Matches, validate, ValidationError } from 'class-validator';

export class PromoRedemptionEntity implements PromoRedemptionModel {
  @Expose()
  @IsString()
  @Length(1, 255)
  id!: string;

  @Expose()
  @IsString()
  @Length(1, 255)
  userId!: string;

  @Expose()
  @IsString()
  @Length(1, 100)
  promoCode!: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  stripeCouponId?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  stripePromotionId?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Matches(/^-?\d+(\.\d{1,6})?$/, { message: 'rewardAmount must be a decimal string with up to 6 decimals' })
  rewardAmount?: string;

  @Expose()
  @IsIn(['success', 'failed'])
  status!: 'success' | 'failed';

  @Expose()
  @IsOptional()
  @IsString()
  message?: string;

  @Expose()
  @IsISO8601()
  redeemedAt!: string;

  static async validate(data: unknown, operation: 'create' | 'update' = 'create'): Promise<void> {
    if (!data || typeof data !== 'object') {
      throw new Error('Data must be an object');
    }

    const entity = new PromoRedemptionEntity();
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

export default PromoRedemptionEntity;
