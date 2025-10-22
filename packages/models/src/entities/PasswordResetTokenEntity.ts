/**
 * Password Reset Token Entity - Database-backed password reset
 * 
 * Follows the established Entity pattern for password reset token management.
 * Similar to EmailVerificationTokenEntity but with 1-hour expiry for security.
 */

import { Expose, Transform } from 'class-transformer';
import { IsString, IsEmail, IsBoolean, IsISO8601, Length, validate, ValidationError } from 'class-validator';

/**
 * Password Reset Token domain model for protocol sharing
 */
export interface PasswordResetTokenModel {
  id: string;
  token: string;
  userId: string;
  email: string;
  consumed: boolean;
  createdAt: string;
  expiresAt: string;
}

/**
 * Password Reset Token Transformers - Following established patterns
 */
export class PasswordResetTokenTransformers {
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
   * Transform token to ensure consistency
   */
  static TokenTransform() {
    return Transform(({ value }) => {
      if (!value || typeof value !== 'string') return value;
      return value.trim();
    });
  }
}

export class PasswordResetTokenEntity implements PasswordResetTokenModel {
  @Expose()
  @IsString()
  @Length(1, 255)
  id!: string;

  @Expose()
  @PasswordResetTokenTransformers.TokenTransform()
  @IsString()
  @Length(64, 64) // Exactly 64 characters for hex-encoded 32 bytes
  token!: string;

  @Expose()
  @IsString()
  @Length(1, 255)
  userId!: string;

  @Expose()
  @PasswordResetTokenTransformers.EmailTransform()
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
    const entity = new PasswordResetTokenEntity();

    if (operation === 'create') {
      // Set defaults for creation
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

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
      throw new Error(`Password Reset Token validation failed: ${errorMessages}`);
    }
  }

  /**
   * Create from user data - factory method
   */
  static createFromUserData(userId: string, email: string, token: string): Partial<PasswordResetTokenModel> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour

    return {
      userId,
      email,
      token,
      consumed: false,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
  }
}