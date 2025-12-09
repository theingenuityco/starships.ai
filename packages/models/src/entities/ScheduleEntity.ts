/**
 * Schedule Entity - Layer 2
 *
 * Bridges between database records and domain models with validation
 * and transformation capabilities, following the existing Entity pattern.
 */

import type { ScheduleModel } from '@starships/protocol';
import { Expose, Transform } from 'class-transformer';
import { IsBoolean, IsISO8601, IsInt, IsOptional, IsString, Length, MaxLength, validate, ValidationError } from 'class-validator';

export class ScheduleEntity implements ScheduleModel {
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
  agentId!: string;

  @Expose()
  @IsString()
  @MaxLength(10000)
  prompt!: string;

  @Expose()
  @IsString()
  @MaxLength(255)
  cronExpression!: string;

  @Expose()
  @IsString()
  @MaxLength(255)
  timezone!: string;

  @Expose()
  @IsISO8601()
  nextRunAt!: string;

  @Expose()
  @IsBoolean()
  isActive!: boolean;

  @Expose()
  @IsBoolean()
  isRecurring!: boolean;

  @Expose()
  @IsOptional()
  @IsISO8601()
  endsAt?: string | null;

  @Expose()
  @IsOptional()
  @IsInt()
  maxOccurrences?: number | null;

  @Expose()
  @IsOptional()
  @IsInt()
  runCount?: number;

  @Expose()
  @IsOptional()
  @IsISO8601()
  lastRunAt?: string | null;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  @Transform(({ value }) => value ?? null)
  lastRunConversationId?: string | null;

  @Expose()
  @IsISO8601()
  createdAt!: string;

  @Expose()
  @IsISO8601()
  updatedAt!: string;

  /**
   * Simple validation function using class-validator.
   */
  static async validate(data: unknown, operation: 'create' | 'update' = 'create'): Promise<void> {
    if (!data || typeof data !== 'object') {
      throw new Error('Data must be an object');
    }

    const dataRecord = data as Record<string, unknown>;
    const entity = new ScheduleEntity();

    if (operation === 'create') {
      const now = new Date().toISOString();
      Object.assign(entity, {
        id: dataRecord.id || 'temp-id',
        starshipId: dataRecord.starshipId || 'temp-starship-id',
        agentId: dataRecord.agentId || 'temp-agent-id',
        prompt: dataRecord.prompt || '',
        cronExpression: dataRecord.cronExpression || '* * * * *',
        timezone: dataRecord.timezone || 'UTC',
        nextRunAt: dataRecord.nextRunAt || now,
        isActive: typeof dataRecord.isActive === 'boolean' ? dataRecord.isActive : true,
        isRecurring: typeof dataRecord.isRecurring === 'boolean' ? dataRecord.isRecurring : false,
        endsAt: dataRecord.endsAt ?? null,
        maxOccurrences: dataRecord.maxOccurrences ?? null,
        runCount: typeof dataRecord.runCount === 'number' ? dataRecord.runCount : 0,
        lastRunAt: dataRecord.lastRunAt ?? null,
        lastRunConversationId: dataRecord.lastRunConversationId ?? null,
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

export default ScheduleEntity;
