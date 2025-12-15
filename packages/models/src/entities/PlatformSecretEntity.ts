/**
 * PlatformSecret Entity - Layer 2
 *
 * Platform-wide secret/config row with encryption at rest.
 * These values are NOT per-starship (unlike environments table).
 */

import { Expose } from 'class-transformer';
import { IsISO8601, IsOptional, IsString, Length, validate, ValidationError } from 'class-validator';

export interface PlatformSecretModel {
  id: string;
  key: string;
  encryptedValue: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export class PlatformSecretEntity implements PlatformSecretModel {
  @Expose()
  @IsString()
  @Length(1, 255)
  id!: string;

  @Expose()
  @IsString()
  @Length(1, 255)
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
  @IsISO8601()
  createdAt!: string;

  @Expose()
  @IsISO8601()
  updatedAt!: string;

  @Expose()
  @IsString()
  @Length(1, 255)
  createdBy!: string;

  @Expose()
  @IsString()
  @Length(1, 255)
  updatedBy!: string;

  static async validate(data: unknown, operation: 'create' | 'update' = 'create'): Promise<void> {
    if (!data || typeof data !== 'object') {
      throw new Error('Data must be an object');
    }

    const dataRecord = data as Record<string, unknown>;
    const entity = new PlatformSecretEntity();

    if (operation === 'create') {
      Object.assign(entity, {
        id: dataRecord.id || 'temp-id',
        key: dataRecord.key || '',
        encryptedValue: dataRecord.encryptedValue || '',
        description: dataRecord.description,
        createdAt: dataRecord.createdAt || new Date().toISOString(),
        updatedAt: dataRecord.updatedAt || new Date().toISOString(),
        createdBy: dataRecord.createdBy || 'system',
        updatedBy: dataRecord.updatedBy || 'system',
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
