/**
 * View Entity - Layer 2
 *
 * Bridges between database records and domain models with validation and transformation capabilities.
 */

import type { ViewModel, ViewRuntimeConfig, WidgetInstanceNode } from '@starships/protocol';
import { Expose } from 'class-transformer';
import { IsISO8601, IsInt, IsObject, IsString, Length, Min, validate, ValidationError } from 'class-validator';

export class ViewEntity implements ViewModel {
  @Expose()
  @IsString()
  @Length(1, 255)
  id!: string;

  @Expose()
  @IsString()
  @Length(1, 100)
  name!: string;

  @Expose()
  @IsString()
  @Length(1, 100)
  slug!: string;

  @Expose()
  @IsString()
  @Length(0, 1000)
  description!: string;

  @Expose()
  @IsObject()
  root!: WidgetInstanceNode;

  @Expose()
  @IsObject()
  runtimeConfig!: ViewRuntimeConfig;

  @Expose()
  @IsInt()
  @Min(1)
  version!: number;

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
    if (!data || typeof data !== 'object') {
      throw new Error('Data must be an object');
    }
    const dataRecord = data as Record<string, unknown>;
    const entity = new ViewEntity();

    if (operation === 'create') {
      Object.assign(entity, {
        id: dataRecord.id || 'temp-id',
        name: dataRecord.name || '',
        slug: dataRecord.slug || '',
        description: dataRecord.description || '',
        root: dataRecord.root || { id: 'root', type: 'Box', props: {}, children: [] },
        runtimeConfig: dataRecord.runtimeConfig || {},
        version: dataRecord.version || 1,
        createdAt: dataRecord.createdAt || new Date().toISOString(),
        updatedAt: dataRecord.updatedAt || new Date().toISOString(),
        starshipId: dataRecord.starshipId || '',
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

