/**
 * Native Tool API Key Entity - Layer 2
 *
 * Bridges between database records and domain models with validation and transformation capabilities.
 * Follows the layered architecture pattern established by ConversationEntity and other entities.
 */

import { Transformers } from '@/helpers/serializer';
import type { NativeToolApiKeyModel } from '@starships/protocol';
import { Expose, instanceToPlain, plainToInstance, Transform } from 'class-transformer';
import { IsISO8601, IsString, Length, validate, ValidationError } from 'class-validator';

/**
 * Custom transformers for the NativeToolApiKeyEntity
 */
export class NativeToolApiKeyTransformers {
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
  @Transformers.DateTransform()
  @IsISO8601()
  createdAt!: string;

  @Expose()
  @Transformers.DateTransform()
  @IsISO8601()
  updatedAt!: string;

  /**
   * Static factory method for creating NativeToolApiKeyEntity from raw data
   */
  static deserialize(data: Record<string, unknown>): NativeToolApiKeyEntity {
    return plainToInstance(NativeToolApiKeyEntity, data, {
      strategy: 'excludeAll',
      excludeExtraneousValues: true,
    });
  }

  /**
   * Instance method for converting entity to plain object for storage
   */
  serialize(): Record<string, unknown> {
    return instanceToPlain(this, {
      strategy: 'excludeAll',
      excludeExtraneousValues: true,
    });
  }

  /**
   * Simple validation function using class-validator
   * This replaces the manual validation approach with a decorator-based solution
   */
  static async validate(data: unknown, operation: 'create' | 'update' = 'create'): Promise<void> {
    if (!data || typeof data !== 'object') {
      throw new Error('Data must be an object');
    }
    const dataRecord = data as Record<string, unknown>;
    const entity = new NativeToolApiKeyEntity();

    // For create operations, validate all required fields
    if (operation === 'create') {
      Object.assign(entity, {
        id: dataRecord.id || 'temp-id', // Will be replaced by auto-generated ID
        starshipId: dataRecord.starshipId || '',
        toolName: dataRecord.toolName || '',
        encryptedApiKey: dataRecord.encryptedApiKey || '',
        createdAt: dataRecord.createdAt || new Date().toISOString(),
        updatedAt: dataRecord.updatedAt || new Date().toISOString(),
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
