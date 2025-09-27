/**
 * Environment Entity - Layer 2
 *
 * Environment variable entity with encryption support
 */

import { Transformers } from '@/helpers/serializer';
import type { EnvironmentModel } from '@starships/protocol';
import { Expose } from 'class-transformer';
import { IsString, Length, IsISO8601, IsOptional, validate, ValidationError } from 'class-validator';

export class EnvironmentEntity implements EnvironmentModel {
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
  @Length(1, 100)
  key!: string;

  @Expose()
  @IsString()
  encryptedValue!: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @Expose()
  @Transformers.DateTransform()
  @IsISO8601()
  createdAt!: string;

  @Expose()
  @Transformers.DateTransform()
  @IsISO8601()
  updatedAt!: string;

  @Expose()
  @IsString()
  @Length(1, 255)
  createdBy!: string;

  /**
   * Simple validation function using class-validator
   */
  static async validate(data: unknown, operation: 'create' | 'update' = 'create'): Promise<void> {
    if (!data || typeof data !== 'object') {
      throw new Error('Data must be an object');
    }

    const dataRecord = data as Record<string, unknown>;
    const entity = new EnvironmentEntity();

    if (operation === 'create') {
      Object.assign(entity, {
        id: dataRecord.id || 'temp-id',
        starshipId: dataRecord.starshipId || '',
        key: dataRecord.key || '',
        encryptedValue: dataRecord.encryptedValue || '',
        description: dataRecord.description,
        createdAt: dataRecord.createdAt || new Date().toISOString(),
        updatedAt: dataRecord.updatedAt || new Date().toISOString(),
        createdBy: dataRecord.createdBy || '',
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
