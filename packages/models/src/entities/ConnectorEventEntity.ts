/**
 * ConnectorEvent Entity - Layer 2
 *
 * Normalized, deduped inbound connector events (webhooks / poll results).
 */

import type { ConnectorEventModel, ConnectorProvider } from '@starships/protocol';
import { Expose } from 'class-transformer';
import { IsISO8601, IsObject, IsOptional, IsString, Length, validate, ValidationError } from 'class-validator';

export class ConnectorEventEntity implements ConnectorEventModel {
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
  @Length(1, 255)
  connectorId!: string;

  @Expose()
  @IsString()
  @Length(1, 255)
  provider!: ConnectorProvider;

  @Expose()
  @IsString()
  @Length(1, 255)
  eventType!: string;

  @Expose()
  @IsOptional()
  @IsString()
  externalEventId?: string | null;

  @Expose()
  @IsObject()
  payloadJson!: Record<string, unknown>;

  @Expose()
  @IsOptional()
  @IsObject()
  rawPayloadJson?: Record<string, unknown> | null;

  @Expose()
  @IsOptional()
  @IsObject()
  headersJson?: Record<string, unknown> | null;

  @Expose()
  @IsISO8601()
  receivedAt!: string;

  @Expose()
  @IsOptional()
  @IsISO8601()
  processedAt?: string | null;

  @Expose()
  @IsISO8601()
  createdAt!: string;

  @Expose()
  @IsISO8601()
  updatedAt!: string;

  static async validate(data: unknown, operation: 'create' | 'update' = 'create'): Promise<void> {
    if (!data || typeof data !== 'object') {
      throw new Error('Data must be an object');
    }

    const dataRecord = data as Record<string, unknown>;
    const entity = new ConnectorEventEntity();

    if (operation === 'create') {
      const now = new Date().toISOString();
      Object.assign(entity, {
        id: dataRecord.id || 'temp-id',
        starshipId: dataRecord.starshipId || 'temp-starship-id',
        connectorId: dataRecord.connectorId || 'temp-connector-id',
        provider: dataRecord.provider || 'provider',
        eventType: dataRecord.eventType || 'event',
        payloadJson: (dataRecord.payloadJson as Record<string, unknown>) || {},
        receivedAt: dataRecord.receivedAt || now,
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

export default ConnectorEventEntity;
