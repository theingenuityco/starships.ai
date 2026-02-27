/**
 * StarshipDatasetRow Entity
 */

import type { StarshipDatasetRowModel } from '@starships/protocol';
import { Expose } from 'class-transformer';
import { IsISO8601, IsObject, IsOptional, IsString, Length, validate, ValidationError } from 'class-validator';

export class StarshipDatasetRowEntity implements StarshipDatasetRowModel {
  @Expose()
  @IsString()
  @Length(1, 255)
  id!: string;

  @Expose()
  @IsString()
  @Length(1, 255)
  datasetId!: string;

  @Expose()
  @IsOptional()
  @IsString()
  rowKey?: string | null;

  @Expose()
  @IsObject()
  data!: Record<string, unknown>;

  @Expose()
  @IsISO8601()
  createdAt!: string;

  @Expose()
  @IsISO8601()
  updatedAt!: string;

  static async validate(data: unknown, operation: 'create' | 'update' = 'create'): Promise<void> {
    if (!data || typeof data !== 'object') throw new Error('Data must be an object');
    const rec = data as Record<string, unknown>;
    const entity = new StarshipDatasetRowEntity();

    if (operation === 'create') {
      const now = new Date().toISOString();
      Object.assign(entity, {
        id: rec.id || 'temp-id',
        datasetId: rec.datasetId || 'temp-dataset-id',
        rowKey: typeof rec.rowKey === 'string' ? rec.rowKey : rec.rowKey === null ? null : undefined,
        data: rec.data && typeof rec.data === 'object' && !Array.isArray(rec.data) ? (rec.data as Record<string, unknown>) : {},
        createdAt: rec.createdAt || now,
        updatedAt: rec.updatedAt || now,
        ...rec,
      });
    } else {
      Object.assign(entity, rec);
    }

    const errors = await validate(entity, {
      skipMissingProperties: operation === 'update',
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    if (errors.length > 0) {
      const msg = errors.map((e: ValidationError) => Object.values(e.constraints || {}).join(', ')).join('; ');
      throw new Error(`Validation failed: ${msg}`);
    }
  }
}

export default StarshipDatasetRowEntity;

