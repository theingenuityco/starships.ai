/**
 * Starship Member Entity - Layer 2
 *
 * Represents a user's membership in a starship (non-owner collaborator access).
 */

import { Expose } from 'class-transformer';
import { IsEnum, IsISO8601, IsOptional, IsString, Length, validate, ValidationError } from 'class-validator';

export type StarshipMemberRole = 'collaborator' | 'admin';

export interface StarshipMemberModel {
  starshipId: string;
  userId: string;
  role: StarshipMemberRole;
  createdAt: string;
  createdBy?: string | null;
}

export class StarshipMemberEntity implements StarshipMemberModel {
  @Expose()
  @IsString()
  @Length(1, 255)
  starshipId!: string;

  @Expose()
  @IsString()
  @Length(1, 255)
  userId!: string;

  @Expose()
  @IsEnum(['collaborator', 'admin'])
  role!: StarshipMemberRole;

  @Expose()
  @IsISO8601()
  createdAt!: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  createdBy?: string | null;

  static async validate(data: unknown, operation: 'create' | 'update' = 'create'): Promise<void> {
    if (!data || typeof data !== 'object') {
      throw new Error('Data must be an object');
    }
    const dataRecord = data as Record<string, unknown>;
    const entity = new StarshipMemberEntity();

    if (operation === 'create') {
      Object.assign(entity, {
        starshipId: dataRecord.starshipId || '',
        userId: dataRecord.userId || '',
        role: (dataRecord.role as StarshipMemberRole) || 'collaborator',
        createdAt: dataRecord.createdAt || new Date().toISOString(),
        createdBy: (dataRecord.createdBy as string | null | undefined) ?? null,
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

