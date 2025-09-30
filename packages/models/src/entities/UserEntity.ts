/**
 * User Entity - Layer 2
 *
 * Bridges between database records and domain models with validation and transformation capabilities.
 * Follows the layered architecture pattern established by ConversationEntity and AgentEntity.
 */

import type { UserModel } from '@starships/protocol';
import { Expose, Transform } from 'class-transformer';
import { IsEmail, IsISO8601, IsOptional, IsString, Length, Matches, validate, ValidationError } from 'class-validator';

/**
 * Custom transformers for the UserEntity
 */
export class UserTransformers {
  /**
   * Transform email to ensure consistency (lowercase, trim)
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
   * Transform display name to ensure proper capitalization
   */
  static DisplayNameTransform() {
    return Transform(({ value }) => {
      if (!value) return value;
      if (typeof value === 'string') {
        return value.trim();
      }
      return value;
    });
  }

  /**
   * Transform avatar URL to ensure valid format
   */
  static AvatarTransform() {
    return Transform(({ value }) => {
      if (!value) return value;
      if (typeof value === 'string') {
        const trimmed = value.trim();
        // Basic URL validation
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
          return trimmed;
        }
        // If it's a relative path or data URL, return as-is
        if (trimmed.startsWith('/') || trimmed.startsWith('data:')) {
          return trimmed;
        }
        // Invalid format, return undefined
        return undefined;
      }
      return value;
    });
  }
}

export class UserEntity implements UserModel {
  // Core database fields
  @Expose()
  @IsString()
  @Length(1, 255)
  id!: string;

  @Expose()
  @IsISO8601()
  createdAt!: string;

  @Expose()
  @IsISO8601()
  @IsOptional()
  updatedAt?: string;

  // User profile fields
  @Expose()
  @IsOptional()
  @UserTransformers.EmailTransform()
  @IsEmail(
    {},
    {
      message: 'Email must be a valid email address',
    }
  )
  @Length(1, 255)
  email?: string;

  @Expose()
  @IsOptional()
  @UserTransformers.DisplayNameTransform()
  @IsString()
  @Length(1, 100)
  displayName?: string;

  @Expose()
  @IsOptional()
  @UserTransformers.AvatarTransform()
  @IsString()
  @Length(1, 500)
  avatar?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(6, 255) // Minimum password length for security
  password?: string;

  // Stripe integration
  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  @Matches(/^cus_[a-zA-Z0-9]+$/, {
    message: 'Stripe Customer ID must be in format: cus_xxxxxxxx',
  })
  stripeCustomerId?: string;

  /**
   * Simple validation function using class-validator
   * This replaces the manual validation approach with a decorator-based solution
   */
  static async validate(data: unknown, operation: 'create' | 'update' = 'create'): Promise<void> {
    if (!data || typeof data !== 'object') {
      throw new Error('Data must be an object');
    }
    const dataRecord = data as Record<string, unknown>;
    const entity = new UserEntity();

    // For create operations, validate all required fields
    if (operation === 'create') {
      Object.assign(entity, {
        id: dataRecord.id || 'temp-id', // Will be replaced by auto-generated ID
        createdAt: dataRecord.createdAt || new Date().toISOString(),
        email: dataRecord.email,
        displayName: dataRecord.displayName,
        avatar: dataRecord.avatar,
        password: dataRecord.password,
        stripeCustomerId: dataRecord.stripeCustomerId,
        ...dataRecord,
      });
    } else {
      // For update operations, only validate provided fields
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
   * Helper method to check if user has a complete profile
   */
  hasCompleteProfile(): boolean {
    return !!(this.email && this.displayName);
  }

  /**
   * Helper method to check if user has Stripe integration
   */
  hasStripeIntegration(): boolean {
    return !!this.stripeCustomerId;
  }

  /**
   * Helper method to get user's initials for avatar fallback
   */
  getInitials(): string {
    if (this.displayName) {
      return this.displayName
        .split(' ')
        .map((name) => name.charAt(0).toUpperCase())
        .slice(0, 2)
        .join('');
    }
    if (this.email) {
      return this.email.charAt(0).toUpperCase();
    }
    return 'U';
  }

  /**
   * Helper method to get user's display name or fallback
   */
  getDisplayName(): string {
    return this.displayName || this.email?.split('@')[0] || 'Unknown User';
  }

  /**
   * Helper method to get user age in milliseconds
   */
  getAge(): number {
    return Date.now() - new Date(this.createdAt).getTime();
  }

  /**
   * Helper method to check if user is new (registered within last 7 days)
   */
  isNewUser(): boolean {
    const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
    return this.getAge() < sevenDaysInMs;
  }

  /**
   * Helper method to get safe user data (without sensitive fields)
   */
  toSafeObject(): Omit<UserModel, 'password'> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...safeData } = this;
    return safeData as Omit<UserModel, 'password'>;
  }

  /**
   * Helper method to check if email domain is from a known provider
   */
  getEmailProvider(): string {
    if (!this.email) return 'unknown';

    const domain = this.email.split('@')[1]?.toLowerCase();
    if (!domain) return 'unknown';

    const providers: Record<string, string> = {
      'gmail.com': 'Google',
      'outlook.com': 'Microsoft',
      'hotmail.com': 'Microsoft',
      'yahoo.com': 'Yahoo',
      'icloud.com': 'Apple',
      'protonmail.com': 'ProtonMail',
    };

    return providers[domain] || 'Other';
  }

  /**
   * Helper method to validate password strength
   */
  static validatePasswordStrength(password: string): {
    isStrong: boolean;
    score: number;
    issues: string[];
  } {
    const issues: string[] = [];
    let score = 0;

    if (password.length < 6) {
      issues.push('Password must be at least 6 characters long');
    } else if (password.length >= 8) {
      score += 2;
    } else {
      score += 1;
    }

    if (!/[a-z]/.test(password)) {
      issues.push('Password must contain at least one lowercase letter');
    } else {
      score += 1;
    }

    if (!/[A-Z]/.test(password)) {
      issues.push('Password must contain at least one uppercase letter');
    } else {
      score += 1;
    }

    if (!/\d/.test(password)) {
      issues.push('Password must contain at least one number');
    } else {
      score += 1;
    }

    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>?]/.test(password)) {
      issues.push('Password must contain at least one special character');
    } else {
      score += 1;
    }

    return {
      isStrong: issues.length === 0 && score >= 4,
      score,
      issues,
    };
  }
}
