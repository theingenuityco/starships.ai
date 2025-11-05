/**
 * Email Change Token Entity - Database-backed email change verification
 * 
 * Follows the established Entity pattern for email change token management.
 * Similar to PasswordResetTokenEntity but with old_email and new_email for email change flow.
 */

import { Expose, Transform } from 'class-transformer';
import { IsString, IsEmail, IsBoolean, IsISO8601, Length, validate, ValidationError } from 'class-validator';

/**
 * Email Change Token domain model for protocol sharing
 */
export interface EmailChangeTokenModel {
  id: string;
  token: string;
  userId: string;
  oldEmail: string;
  newEmail: string;
  consumed: boolean;
  createdAt: string;
  expiresAt: string;
}

/**
 * Email Change Token Transformers - Following established patterns
 */
export class EmailChangeTokenTransformers {
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

export class EmailChangeTokenEntity implements EmailChangeTokenModel {
  @Expose()
  @IsString()
  @Length(1, 255)
  id!: string;

  @Expose()
  @EmailChangeTokenTransformers.TokenTransform()
  @IsString()
  @Length(64, 64) // Exactly 64 characters for hex-encoded 32 bytes
  token!: string;

  @Expose()
  @IsString()
  @Length(1, 255)
  userId!: string;

  @Expose()
  @EmailChangeTokenTransformers.EmailTransform()
  @IsEmail({}, { message: 'Old email must be a valid email address' })
  @Length(1, 255)
  oldEmail!: string;

  @Expose()
  @EmailChangeTokenTransformers.EmailTransform()
  @IsEmail({}, { message: 'New email must be a valid email address' })
  @Length(1, 255)
  newEmail!: string;

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
    const entity = new EmailChangeTokenEntity();

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
      throw new Error(`Email Change Token validation failed: ${errorMessages}`);
    }
  }

  /**
   * Create from user data - factory method
   */
  static createFromUserData(userId: string, oldEmail: string, newEmail: string, token: string): Partial<EmailChangeTokenModel> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour

    return {
      userId,
      oldEmail,
      newEmail,
      token,
      consumed: false,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
  }
}

