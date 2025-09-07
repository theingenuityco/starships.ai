/**
 * Native Tool API Key Entity - Layer 2
 *
 * Bridges between database records and domain models with validation and transformation capabilities.
 * Follows the layered architecture pattern established by ConversationEntity and other entities.
 */

import type { NativeToolApiKeyModel } from '@starships/protocol';
import { Expose, instanceToPlain, plainToInstance, Transform } from 'class-transformer';
import { IsISO8601, IsString, Length } from 'class-validator';

/**
 * Custom transformers for the NativeToolApiKeyEntity
 */
export class NativeToolApiKeyTransformers {
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
   * Transform tool name to ensure consistency (lowercase, no special chars)
   */
  static ToolNameTransform() {
    return Transform(({ value }) => {
      if (!value) return value;
      if (typeof value === 'string') {
        return value
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9_-]/g, '');
      }
      return value;
    });
  }

  /**
   * Transform starship ID to ensure consistency
   */
  static StarshipIdTransform() {
    return Transform(({ value }) => {
      if (!value) return value;
      if (typeof value === 'string') {
        return value.trim();
      }
      return value;
    });
  }

  /**
   * Transform encrypted API key (ensure it's a string and not empty)
   */
  static EncryptedApiKeyTransform() {
    return Transform(({ value }) => {
      if (!value) return value;
      if (typeof value === 'string') {
        return value.trim();
      }
      return value;
    });
  }
}

export class NativeToolApiKeyEntity implements NativeToolApiKeyModel {
  [key: string]: unknown;

  // Core database fields
  @Expose()
  @IsString()
  @Length(1, 255)
  id!: string;

  @Expose()
  @NativeToolApiKeyTransformers.StarshipIdTransform()
  @IsString()
  @Length(1, 255)
  starshipId!: string;

  @Expose()
  @NativeToolApiKeyTransformers.ToolNameTransform()
  @IsString()
  @Length(1, 100)
  toolName!: string;

  @Expose()
  @NativeToolApiKeyTransformers.EncryptedApiKeyTransform()
  @IsString()
  @Length(1, 1000) // Encrypted keys can be longer
  encryptedApiKey!: string;

  @Expose()
  @NativeToolApiKeyTransformers.DateTransform()
  @IsISO8601()
  createdAt!: string;

  @Expose()
  @NativeToolApiKeyTransformers.DateTransform()
  @IsISO8601()
  updatedAt!: string;

  /**
   * Static factory method for creating NativeToolApiKeyEntity from raw data
   */
  static deserialize(data: Record<string, any>): NativeToolApiKeyEntity {
    return plainToInstance(NativeToolApiKeyEntity, data, {
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
    const entity = NativeToolApiKeyEntity.deserialize(data);

    // Context-specific validation rules
    if (context === 'create') {
      // For creation, certain fields are required
      if (!entity.starshipId) {
        throw new Error('Starship ID is required for native tool API key creation');
      }
      if (!entity.toolName) {
        throw new Error('Tool name is required for native tool API key creation');
      }
      if (!entity.encryptedApiKey) {
        throw new Error('Encrypted API key is required for native tool API key creation');
      }
    }

    // Business rule validations
    if (entity.starshipId && entity.starshipId.length > 255) {
      throw new Error('Starship ID cannot exceed 255 characters');
    }

    if (entity.toolName && entity.toolName.length > 100) {
      throw new Error('Tool name cannot exceed 100 characters');
    }

    if (entity.toolName && !/^[a-z0-9_-]+$/.test(entity.toolName)) {
      throw new Error('Tool name can only contain lowercase letters, numbers, underscores, and hyphens');
    }

    if (entity.encryptedApiKey && entity.encryptedApiKey.length > 1000) {
      throw new Error('Encrypted API key cannot exceed 1000 characters');
    }

    // Validate encrypted key format (basic check for encryption pattern)
    if (entity.encryptedApiKey && !entity.encryptedApiKey.includes(':')) {
      throw new Error('Invalid encrypted API key format');
    }
  }

  /**
   * Helper method to get the age of the API key in milliseconds
   */
  getAge(): number {
    return Date.now() - new Date(this.createdAt).getTime();
  }

  /**
   * Helper method to check if the API key was recently created (within last 24 hours)
   */
  isNew(): boolean {
    const twentyFourHoursInMs = 24 * 60 * 60 * 1000;
    return this.getAge() < twentyFourHoursInMs;
  }

  /**
   * Helper method to check if the API key was recently updated
   */
  wasRecentlyUpdated(): boolean {
    const updatedTime = new Date(this.updatedAt).getTime();
    const createdTime = new Date(this.createdAt).getTime();
    const oneHourInMs = 60 * 60 * 1000;

    // Consider recently updated if updated time is significantly different from created time
    return updatedTime - createdTime > oneHourInMs && Date.now() - updatedTime < oneHourInMs;
  }

  /**
   * Helper method to get tool name display format
   */
  getToolDisplayName(): string {
    // Convert snake_case or kebab-case to Title Case
    return this.toolName
      .split(/[-_]/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Helper method to get tool category based on tool name
   */
  getToolCategory(): 'web' | 'email' | 'storage' | 'communication' | 'analytics' | 'other' {
    const toolName = this.toolName.toLowerCase();

    if (toolName.includes('web') || toolName.includes('scraper') || toolName.includes('browser')) {
      return 'web';
    }
    if (toolName.includes('email') || toolName.includes('smtp') || toolName.includes('mail')) {
      return 'email';
    }
    if (toolName.includes('storage') || toolName.includes('s3') || toolName.includes('drive')) {
      return 'storage';
    }
    if (toolName.includes('slack') || toolName.includes('discord') || toolName.includes('teams')) {
      return 'communication';
    }
    if (toolName.includes('analytics') || toolName.includes('tracking') || toolName.includes('metrics')) {
      return 'analytics';
    }

    return 'other';
  }

  /**
   * Helper method to check if API key needs rotation (older than 90 days)
   */
  needsRotation(): boolean {
    const ninetyDaysInMs = 90 * 24 * 60 * 60 * 1000;
    return this.getAge() > ninetyDaysInMs;
  }

  /**
   * Helper method to get a masked version of the key for display (first 4 chars)
   */
  getMaskedKey(): string {
    // Extract the encrypted part (after the IV and auth tag)
    const parts = this.encryptedApiKey.split(':');
    if (parts.length >= 3) {
      const encryptedPart = parts[2];
      if (encryptedPart.length > 8) {
        return `${encryptedPart.slice(0, 4)}${'*'.repeat(encryptedPart.length - 8)}${encryptedPart.slice(-4)}`;
      }
      return '*'.repeat(encryptedPart.length);
    }
    return '****';
  }

  /**
   * Helper method to get security score based on age and other factors
   */
  getSecurityScore(): { score: number; level: 'high' | 'medium' | 'low'; issues: string[] } {
    const issues: string[] = [];
    let score = 100;

    // Age-based scoring
    const ageInDays = this.getAge() / (1000 * 60 * 60 * 24);
    if (ageInDays > 90) {
      score -= 30;
      issues.push('API key is older than 90 days and should be rotated');
    } else if (ageInDays > 60) {
      score -= 15;
      issues.push('API key is older than 60 days, consider rotation');
    }

    // Tool name validation scoring
    if (!/^[a-z0-9_-]+$/.test(this.toolName)) {
      score -= 10;
      issues.push('Tool name contains invalid characters');
    }

    // Determine security level
    let level: 'high' | 'medium' | 'low' = 'high';
    if (score < 60) level = 'low';
    else if (score < 80) level = 'medium';

    return { score, level, issues };
  }

  /**
   * Helper method to create a composite key for uniqueness
   */
  getCompositeKey(): string {
    return `${this.starshipId}:${this.toolName}`;
  }

  /**
   * Helper method to check if this API key conflicts with another
   */
  conflictsWith(other: NativeToolApiKeyEntity): boolean {
    return this.starshipId === other.starshipId && this.toolName === other.toolName && this.id !== other.id;
  }
}
