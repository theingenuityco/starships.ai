/**
 * ConnectorSecret Entity - Layer 2
 *
 * DB-backed encrypted secret scoped to a starship.
 * (Formerly EnvironmentEntity / environments table)
 */

import type { ConnectorSecretModel } from '@starships/protocol';
import { Expose } from 'class-transformer';
import { IsString, Length, IsISO8601, IsOptional, validate, ValidationError } from 'class-validator';

export class ConnectorSecretEntity implements ConnectorSecretModel {
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
  @IsOptional()
  @IsString()
  @Length(1, 255)
  connectorId?: string;

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

  /**
   * Simple validation function using class-validator
   */
  static async validate(data: unknown, operation: 'create' | 'update' = 'create'): Promise<void> {
    if (!data || typeof data !== 'object') {
      throw new Error('Data must be an object');
    }

    const dataRecord = data as Record<string, unknown>;
    const entity = new ConnectorSecretEntity();

    if (operation === 'create') {
      Object.assign(entity, {
        id: dataRecord.id || 'temp-id',
        starshipId: dataRecord.starshipId || '',
        key: dataRecord.key || '',
        encryptedValue: dataRecord.encryptedValue || '',
        description: dataRecord.description,
        connectorId: dataRecord.connectorId,
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
