/**
 * OAuth Account Entity - Layer 2
 *
 * Bridges between database records and OAuth domain models with validation and transformation capabilities.
 * Follows the layered architecture pattern established by UserEntity and other entities.
 */

import type { OAuthAccountModel } from '@starships/protocol';
import { Expose, Transform } from 'class-transformer';
import { IsString, IsEmail, IsOptional, IsObject, Length, IsIn, IsISO8601, validate, ValidationError } from 'class-validator';

/**
 * OAuth Account Transformers - Following UserEntity pattern exactly
 */
export class OAuthAccountTransformers {
  /**
   * Transform provider to ensure consistency (lowercase)
   */
  static ProviderTransform() {
    return Transform(({ value }) => {
      if (!value) return value;
      if (typeof value === 'string') {
        return value.toLowerCase().trim();
      }
      return value;
    });
  }

  /**
   * Transform email using same pattern as UserEntity
   */
  static EmailTransform() {
    return Transform(({ value }) => {
      if (!value) return value;
      if (typeof value === 'string') {
        return value.toLowerCase().trim();
      }
      return value;
    });
  }

  /**
   * Transform profile data to ensure clean JSON
   */
  static ProfileDataTransform() {
    return Transform(({ value }) => {
      if (!value) return undefined;
      if (typeof value === 'object') {
        const cleaned: Record<string, unknown> = {};
        if (value.name && typeof value.name === 'string') {
          cleaned.name = value.name.trim();
        }
        if (value.avatar && typeof value.avatar === 'string') {
          cleaned.avatar = value.avatar.trim();
        }
        // Preserve other profile data
        Object.entries(value).forEach(([key, val]) => {
          if (key !== 'name' && key !== 'avatar') {
            cleaned[key] = val;
          }
        });
        return Object.keys(cleaned).length > 0 ? cleaned : undefined;
      }
      return value;
    });
  }
}

export class OAuthAccountEntity implements OAuthAccountModel {
  @Expose()
  @IsString()
  @Length(1, 255)
  id!: string;

  @Expose()
  @IsString()
  @Length(1, 255)
  userId!: string;

  @Expose()
  @OAuthAccountTransformers.ProviderTransform()
  @IsString()
  @IsIn(['google', 'github'])
  provider!: 'google' | 'github';

  @Expose()
  @IsString()
  @Length(1, 255)
  providerUserId!: string;

  @Expose()
  @OAuthAccountTransformers.EmailTransform()
  @IsEmail({}, { message: 'Email must be a valid email address' })
  @Length(1, 255)
  email!: string;

  @Expose()
  @IsOptional()
  @OAuthAccountTransformers.ProfileDataTransform()
  @IsObject()
  profileData?: Record<string, unknown>;

  @Expose()
  @IsISO8601()
  createdAt!: string;

  @Expose()
  @IsISO8601()
  updatedAt!: string;

  /**
   * Validation method - Following UserEntity pattern exactly
   */
  static async validate(data: unknown, operation: 'create' | 'update' = 'create'): Promise<void> {
    if (!data || typeof data !== 'object') {
      throw new Error('Data must be an object');
    }
    const dataRecord = data as Record<string, unknown>;
    const entity = new OAuthAccountEntity();

    if (operation === 'create') {
      Object.assign(entity, {
        id: dataRecord.id || 'temp-id',
        createdAt: dataRecord.createdAt || new Date().toISOString(),
        updatedAt: dataRecord.updatedAt || new Date().toISOString(),
        userId: dataRecord.userId,
        provider: dataRecord.provider,
        providerUserId: dataRecord.providerUserId,
        email: dataRecord.email,
        profileData: dataRecord.profileData,
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

  /**
   * Helper method to get display name from profile
   */
  getDisplayName(): string | undefined {
    return this.profileData?.name as string;
  }

  /**
   * Helper method to get avatar from profile
   */
  getAvatarUrl(): string | undefined {
    return this.profileData?.avatar as string;
  }

  /**
   * Create OAuth account entity from profile data
   */
  static createFromProfile(userId: string, profile: { provider: string; providerId: string; email: string; name: string; avatar?: string }): Partial<OAuthAccountModel> {
    return {
      userId,
      provider: profile.provider as 'google' | 'github',
      providerUserId: profile.providerId,
      email: profile.email,
      profileData: {
        name: profile.name,
        avatar: profile.avatar,
      },
    };
  }
}