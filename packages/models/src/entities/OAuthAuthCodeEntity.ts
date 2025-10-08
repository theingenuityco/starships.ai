/**
 * OAuth Auth Code Entity - Database-backed authorization code storage
 * 
 * Follows the established Entity pattern for OAuth authorization code management.
 * This replaces the vulnerable in-memory storage with production-ready database persistence.
 */

import { Expose, Transform } from 'class-transformer';
import { IsString, IsEmail, IsBoolean, IsISO8601, Length, validate, ValidationError } from 'class-validator';

/**
 * OAuth Auth Code domain model for protocol sharing
 */
export interface OAuthAuthCodeModel {
  id: string;
  code: string;
  userId: string;
  email: string;
  consumed: boolean;
  createdAt: string;
  expiresAt: string;
}

/**
 * OAuth Auth Code Transformers - Following UserEntity pattern
 */
export class OAuthAuthCodeTransformers {
  /**
   * Transform email to ensure consistency
   */
  static EmailTransform() {
    return Transform(({ value }) => {
      if (!value || typeof value !== 'string') return value;
      return value.toLowerCase().trim();
    });
  }

  /**
   * Transform code to ensure consistency
   */
  static CodeTransform() {
    return Transform(({ value }) => {
      if (!value || typeof value !== 'string') return value;
      return value.trim();
    });
  }
}

export class OAuthAuthCodeEntity implements OAuthAuthCodeModel {
  @Expose()
  @IsString()
  @Length(1, 255)
  id!: string;

  @Expose()
  @OAuthAuthCodeTransformers.CodeTransform()
  @IsString()
  @Length(64, 64) // Exactly 64 characters for hex-encoded 32 bytes
  code!: string;

  @Expose()
  @IsString()
  @Length(1, 255)
  userId!: string;

  @Expose()
  @OAuthAuthCodeTransformers.EmailTransform()
  @IsEmail({}, { message: 'Email must be a valid email address' })
  @Length(1, 255)
  email!: string;

  @Expose()
  @IsBoolean()
  consumed!: boolean;

  @Expose()
  @IsISO8601()
  createdAt!: string;

  @Expose()
  @IsISO8601()
  expiresAt!: string;

  /**
   * Validation method - Following established Entity pattern
   */
  static async validate(data: unknown, operation: 'create' | 'update' = 'create'): Promise<void> {
    if (!data || typeof data !== 'object') {
      throw new Error('Data must be an object');
    }

    const dataRecord = data as Record<string, unknown>;
    const entity = new OAuthAuthCodeEntity();

    if (operation === 'create') {
      // Set defaults for creation
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes

      Object.assign(entity, {
        id: dataRecord.id || 'temp-id',
        createdAt: dataRecord.createdAt || now,
        expiresAt: dataRecord.expiresAt || expiresAt,
        consumed: dataRecord.consumed || false,
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
      const errorMessages = errors
        .map((error: ValidationError) => Object.values(error.constraints || {}).join(', '))
        .join('; ');
      throw new Error(`OAuth Auth Code validation failed: ${errorMessages}`);
    }
  }

  // Database handles expiration logic - no client-side methods needed

  /**
   * Create from user data - factory method
   */
  static createFromUserData(userId: string, email: string, code: string): Partial<OAuthAuthCodeModel> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes

    return {
      userId,
      email,
      code,
      consumed: false,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
  }
}