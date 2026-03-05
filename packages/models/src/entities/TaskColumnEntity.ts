/**
 * TaskColumn Entity
 */

import type { TaskColumnModel } from '@starships/protocol';
import { Expose, Transform } from 'class-transformer';
import { IsISO8601, IsInt, IsNumber, IsOptional, IsString, Length, MaxLength, validate, ValidationError } from 'class-validator';

export class TaskColumnEntity implements TaskColumnModel {
  @Expose()
  @IsString()
  @Length(1, 255)
  id!: string;

  @Expose()
  @IsString()
  @Length(1, 255)
  boardId!: string;

  @Expose()
  @IsString()
  @MaxLength(200)
  title!: string;

  @Expose()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => value ?? null)
  key?: string | null;

  @Expose()
  @IsNumber()
  pos!: number;

  @Expose()
  @IsOptional()
  @IsInt()
  @Transform(({ value }) => value ?? null)
  wipLimit?: number | null;

  @Expose()
  @IsISO8601()
  createdAt!: string;

  @Expose()
  @IsISO8601()
  updatedAt!: string;

  static async validate(data: unknown, operation: 'create' | 'update' = 'create'): Promise<void> {
    if (!data || typeof data !== 'object') throw new Error('Data must be an object');
    const rec = data as Record<string, unknown>;
    const entity = new TaskColumnEntity();

    if (operation === 'create') {
      const now = new Date().toISOString();
      Object.assign(entity, {
        id: rec.id || 'temp-id',
        boardId: rec.boardId || 'temp-board-id',
        title: rec.title || '',
        key: rec.key ?? null,
        pos: typeof rec.pos === 'number' ? rec.pos : 0,
        wipLimit: rec.wipLimit ?? null,
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

export default TaskColumnEntity;

