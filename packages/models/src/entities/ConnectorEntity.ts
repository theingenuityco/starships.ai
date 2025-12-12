import type { ConnectorModel, ConnectorProvider, ConnectorStatus } from '@starships/protocol';
import { Expose } from 'class-transformer';
import { IsISO8601, IsIn, IsObject, IsOptional, IsString, Length, validate, ValidationError } from 'class-validator';

export class ConnectorEntity implements ConnectorModel {
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
  provider!: ConnectorProvider;

  @Expose()
  @IsString()
  @IsIn(['disconnected', 'pending', 'connected', 'error'] satisfies ConnectorStatus[])
  status!: ConnectorStatus;

  @Expose()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @Expose()
  @IsOptional()
  @IsString()
  lastError?: string;

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
    const entity = new ConnectorEntity();

    if (operation === 'create') {
      Object.assign(entity, {
        id: dataRecord.id || 'temp-id',
        starshipId: dataRecord.starshipId || '',
        provider: dataRecord.provider || 'linkedin',
        status: dataRecord.status || 'disconnected',
        metadata: dataRecord.metadata || {},
        lastError: dataRecord.lastError,
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
