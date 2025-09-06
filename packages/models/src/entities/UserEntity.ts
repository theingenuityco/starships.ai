/**
 * User Entity - Layer 2
 *
 * Bridges between database records and domain models with validation and transformation capabilities.
 * Follows the layered architecture pattern established by ConversationEntity and AgentEntity.
 */

import type { UserModel } from '@starships/protocol';
import { Expose, instanceToPlain, plainToInstance, Transform } from 'class-transformer';
import { IsEmail, IsISO8601, IsOptional, IsString, Length, Matches } from 'class-validator';

/**
 * Custom transformers for the UserEntity
 */
export class UserTransformers {
  /**
   * Transform date strings to ISO format, handling various input formats
   */
  static DateTransform() {
    return Transform(({ value }) => {
      if (!value) return new Date().toISOString();
      if (typeof value === 'string') return value;
      if (value instanceof Date) return value.toISOString();
      return new Date(value).toISOString();
    });
  }

  /**
   * Transform username to ensure consistency (lowercase, no spaces)
   */
  static UsernameTransform() {
    return Transform(({ value }) => {
      if (!value) return value;
      if (typeof value === 'string') {
        return value.toLowerCase().replace(/\s+/g, '').trim();
      }
      return value;
    });
  }

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
  [key: string]: unknown;

  // Core database fields
  @Expose()
  @IsString()
  @Length(1, 255)
  id!: string;

  @Expose()
  @UserTransformers.DateTransform()
  @IsISO8601()
  createdAt!: string;

  // User profile fields
  @Expose()
  @UserTransformers.UsernameTransform()
  @IsString()
  @Length(1, 50)
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: 'Username can only contain letters, numbers, underscores, and hyphens',
  })
  username!: string;

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
   * Static factory method for creating UserEntity from raw data
   */
  static deserialize(data: Record<string, any>): UserEntity {
    return plainToInstance(UserEntity, data, {
      strategy: 'excludeAll',
      excludeExtraneousValues: true,
    });
  }

  /**
   * Instance method for converting entity to plain object for storage
   */
  serialize(): Record<string, any> {
    return instanceToPlain(this, {
      strategy: 'excludeAll',
      excludeExtraneousValues: true,
    });
  }

  /**
   * Validation method for different contexts
   */
  static async validate(data: any, context: 'create' | 'update' = 'create'): Promise<void> {
    const entity = UserEntity.deserialize(data);

    // Context-specific validation rules
    if (context === 'create') {
      // For creation, certain fields are required
      if (!entity.username) {
        throw new Error('Username is required for user creation');
      }
      if (!entity.email) {
        throw new Error('Email is required for user creation');
      }
    }

    // Business rule validations
    if (entity.username && entity.username.length < 1) {
      throw new Error('Username cannot be empty');
    }

    if (entity.username && entity.username.length > 50) {
      throw new Error('Username cannot exceed 50 characters');
    }

    if (entity.displayName && entity.displayName.length > 100) {
      throw new Error('Display name cannot exceed 100 characters');
    }

    if (entity.password && entity.password.length < 6) {
      throw new Error('Password must be at least 6 characters long');
    }

    // Email format validation (additional business rules)
    if (entity.email && !entity.email.includes('@')) {
      throw new Error('Email must be a valid email address');
    }

    // Username format validation (additional business rules)
    if (entity.username && !/^[a-zA-Z0-9_-]+$/.test(entity.username)) {
      throw new Error('Username can only contain letters, numbers, underscores, and hyphens');
    }

    // Stripe customer ID format validation
    if (entity.stripeCustomerId && !entity.stripeCustomerId.startsWith('cus_')) {
      throw new Error('Invalid Stripe Customer ID format');
    }
  }

  /**
   * Helper method to check if user has a complete profile
   */
  hasCompleteProfile(): boolean {
    return !!(this.email && this.displayName && this.username);
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
    if (this.username) {
      return this.username.charAt(0).toUpperCase();
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
    return this.displayName || this.username || this.email?.split('@')[0] || 'Unknown User';
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
    const serialized = this.serialize();
    const { password, ...safeData } = serialized;
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
   * Helper method to generate username suggestion from email
   */
  static generateUsernameFromEmail(email: string): string {
    const localPart = email.split('@')[0];
    // Remove non-alphanumeric characters except underscore and hyphen
    return localPart.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
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

    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\?]/.test(password)) {
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
