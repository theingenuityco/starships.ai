/**
 * Starship Invite Token Entity - Layer 2
 *
 * Represents an email-link invite token to join a starship.
 */

import { Expose, Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsEnum, IsISO8601, IsOptional, IsString, Length, validate, ValidationError } from 'class-validator';

export type StarshipInviteRole = 'collaborator' | 'admin';

export interface StarshipInviteTokenModel {
  id: string;
  token: string;
  starshipId: string;
  invitedEmail: string;
  invitedByUserId?: string | null;
  role: StarshipInviteRole;
  consumed: boolean;
  createdAt: string;
  expiresAt: string;
  consumedAt?: string | null;
}

export class StarshipInviteTokenTransformers {
  static EmailTransform() {
    return Transform(({ value }) => {
      if (!value || typeof value !== 'string') return value;
      return value.toLowerCase().trim();
    });
  }

  static TokenTransform() {
    return Transform(({ value }) => {
      if (!value || typeof value !== 'string') return value;
      return value.trim();
    });
  }
}

export class StarshipInviteTokenEntity implements StarshipInviteTokenModel {
  @Expose()
  @IsString()
  @Length(1, 255)
  id!: string;

  @Expose()
  @StarshipInviteTokenTransformers.TokenTransform()
  @IsString()
  @Length(64, 64) // Exactly 64 hex chars (32 bytes)
  token!: string;

  @Expose()
  @IsString()
  @Length(1, 255)
  starshipId!: string;

  @Expose()
  @StarshipInviteTokenTransformers.EmailTransform()
  @IsEmail({}, { message: 'invitedEmail must be a valid email address' })
  @Length(1, 255)
  invitedEmail!: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  invitedByUserId?: string | null;

  @Expose()
  @IsEnum(['collaborator', 'admin'])
  role!: StarshipInviteRole;

  @Expose()
  @IsBoolean()
  consumed!: boolean;

  @Expose()
  @IsISO8601()
  createdAt!: string;

  @Expose()
  @IsISO8601()
  expiresAt!: string;

  @Expose()
  @IsOptional()
  @IsISO8601()
  consumedAt?: string | null;

  static async validate(data: unknown, operation: 'create' | 'update' = 'create'): Promise<void> {
    if (!data || typeof data !== 'object') {
      throw new Error('Data must be an object');
    }

    const dataRecord = data as Record<string, unknown>;
    const entity = new StarshipInviteTokenEntity();

    if (operation === 'create') {
      const now = new Date().toISOString();
      // Default expiry is 7 days; can be overridden by passing expiresAt
      const expiresAt = (dataRecord.expiresAt as string | undefined) || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      Object.assign(entity, {
        id: dataRecord.id || 'temp-id',
        token: dataRecord.token || '',
        starshipId: dataRecord.starshipId || '',
        invitedEmail: dataRecord.invitedEmail || '',
        invitedByUserId: (dataRecord.invitedByUserId as string | null | undefined) ?? null,
        role: (dataRecord.role as StarshipInviteRole) || 'collaborator',
        consumed: typeof dataRecord.consumed === 'boolean' ? dataRecord.consumed : false,
        createdAt: dataRecord.createdAt || now,
        expiresAt,
        consumedAt: (dataRecord.consumedAt as string | null | undefined) ?? null,
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

  static createFromInviteData(args: {
    starshipId: string;
    invitedEmail: string;
    token: string;
    role?: StarshipInviteRole;
    invitedByUserId?: string | null;
    expiresAt?: string;
  }): Omit<StarshipInviteTokenModel, 'id'> {
    const now = new Date();
    const expiresAt = args.expiresAt ? new Date(args.expiresAt) : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return {
      token: args.token,
      starshipId: args.starshipId,
      invitedEmail: args.invitedEmail.toLowerCase().trim(),
      invitedByUserId: args.invitedByUserId ?? null,
      role: args.role ?? 'collaborator',
      consumed: false,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      consumedAt: null,
    };
  }
}

