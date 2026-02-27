/**
 * TaskCard Entity
 */

import type { TaskCardModel } from '@starships/protocol';
import { Expose, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  validate,
  ValidationError,
} from 'class-validator';

export class TaskCardEntity implements TaskCardModel {
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
  @Length(1, 255)
  columnId!: string;

  @Expose()
  @IsString()
  @MaxLength(300)
  title!: string;

  @Expose()
  @IsString()
  @MaxLength(50_000)
  description!: string;

  @Expose()
  @IsNumber()
  pos!: number;

  @Expose()
  @IsOptional()
  @IsInt()
  @Transform(({ value }) => value ?? null)
  priority?: number | null;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  @Transform(({ value }) => value ?? null)
  assigneeAgentId?: string | null;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  @Transform(({ value }) => value ?? null)
  assigneeUserId?: string | null;

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
    const entity = new TaskCardEntity();

    if (operation === 'create') {
      const now = new Date().toISOString();
      Object.assign(entity, {
        id: rec.id || 'temp-id',
        boardId: rec.boardId || 'temp-board-id',
        columnId: rec.columnId || 'temp-column-id',
        title: rec.title || '',
        description: typeof rec.description === 'string' ? rec.description : '',
        pos: typeof rec.pos === 'number' ? rec.pos : 0,
        priority: rec.priority ?? null,
        assigneeAgentId: rec.assigneeAgentId ?? null,
        assigneeUserId: rec.assigneeUserId ?? null,
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

export default TaskCardEntity;

