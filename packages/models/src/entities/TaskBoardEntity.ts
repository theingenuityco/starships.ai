/**
 * TaskBoard Entity
 */

import type { TaskBoardModel } from '@starships/protocol';
import { Expose } from 'class-transformer';
import { IsBoolean, IsISO8601, IsNumber, IsString, Length, MaxLength, validate, ValidationError } from 'class-validator';

export class TaskBoardEntity implements TaskBoardModel {
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
  @MaxLength(200)
  name!: string;

  @Expose()
  @IsString()
  @MaxLength(100)
  slug!: string;

  @Expose()
  @IsString()
  @MaxLength(2000)
  description!: string;

  @Expose()
  @IsNumber()
  pos!: number;

  @Expose()
  @IsBoolean()
  archived!: boolean;

  @Expose()
  @IsISO8601()
  createdAt!: string;

  @Expose()
  @IsISO8601()
  updatedAt!: string;

  static async validate(data: unknown, operation: 'create' | 'update' = 'create'): Promise<void> {
    if (!data || typeof data !== 'object') throw new Error('Data must be an object');
    const rec = data as Record<string, unknown>;
    const entity = new TaskBoardEntity();

    if (operation === 'create') {
      const now = new Date().toISOString();
      Object.assign(entity, {
        id: rec.id || 'temp-id',
        starshipId: rec.starshipId || 'temp-starship-id',
        name: rec.name || '',
        slug: rec.slug || 'temp-slug',
        description: typeof rec.description === 'string' ? rec.description : '',
        pos: typeof rec.pos === 'number' ? rec.pos : 0,
        archived: typeof rec.archived === 'boolean' ? rec.archived : false,
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

export default TaskBoardEntity;

