import { Expose } from 'class-transformer';
import { IsISO8601, IsString, Length, validate, ValidationError } from 'class-validator';

/**
 * ConnectorWebhookBindingEntity
 *
 * Maps (provider, externalAccountId) to one-or-more connector instances.
 */
export interface ConnectorWebhookBindingModel {
  id: string;
  provider: string;
  externalAccountId: string;
  connectorId: string;
  starshipId: string;
  createdAt: string;
  updatedAt: string;
}

export class ConnectorWebhookBindingEntity implements ConnectorWebhookBindingModel {
  @Expose()
  @IsString()
  @Length(1, 255)
  id!: string;

  @Expose()
  @IsString()
  @Length(1, 255)
  provider!: string;

  @Expose()
  @IsString()
  @Length(1, 1024)
  externalAccountId!: string;

  @Expose()
  @IsString()
  @Length(1, 255)
  connectorId!: string;

  @Expose()
  @IsString()
  @Length(1, 255)
  starshipId!: string;

  @Expose()
  @IsISO8601()
  createdAt!: string;

  @Expose()
  @IsISO8601()
  updatedAt!: string;

  static async validate(data: unknown, operation: 'create' | 'update' = 'create'): Promise<void> {
    if (!data || typeof data !== 'object') throw new Error('Data must be an object');

    const dataRecord = data as Record<string, unknown>;
    const entity = new ConnectorWebhookBindingEntity();

    if (operation === 'create') {
      const now = new Date().toISOString();
      Object.assign(entity, {
        id: dataRecord.id || 'temp-id',
        provider: dataRecord.provider || 'provider',
        externalAccountId: dataRecord.externalAccountId || 'external',
        connectorId: dataRecord.connectorId || 'connector',
        starshipId: dataRecord.starshipId || 'starship',
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

export default ConnectorWebhookBindingEntity;

