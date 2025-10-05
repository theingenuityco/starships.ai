/**
 * Starship Entity - Layer 2
 *
 * Bridges between database records and domain models with validation and transformation capabilities.
 * Follows the layered architecture pattern established by ConversationEntity and MessageEntity.
 */

import type { StarshipModel, StarshipStatus } from '@starships/protocol';
import { Expose, Transform } from 'class-transformer';
import { IsEnum, IsISO8601, IsNumber, IsString, Length, Max, Min, validate, ValidationError } from 'class-validator';

/**
 * Custom transformers for the StarshipEntity
 */
export class StarshipTransformers {
  /**
   * Transform slug to ensure it's URL-safe
   */
  static SlugTransform() {
    return Transform(({ value }) => {
      if (typeof value !== 'string') return value;
      return value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-_]/g, '') // Remove special characters except spaces, hyphens, and underscores
        .replace(/[\s_]+/g, '-') // Replace spaces and underscores with hyphens
        .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
        .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
    });
  }
}

export class StarshipEntity implements StarshipModel {
  @Expose()
  @IsString()
  @Length(1, 255)
  id!: string;

  @Expose()
  @StarshipTransformers.SlugTransform()
  @IsString()
  @Length(1, 100)
  slug!: string;

  @Expose()
  @IsString()
  @Length(1, 255)
  ownerId!: string;

  @Expose()
  @IsString()
  @Length(1, 100)
  name!: string;

  @Expose()
  @IsNumber()
  @Min(1)
  @Max(50) // Reasonable upper limit
  maxAgents!: number;

  @Expose()
  @IsEnum(['active', 'inactive'])
  status!: StarshipStatus;

  @Expose()
  @IsISO8601()
  createdAt!: string;

  @Expose()
  @IsISO8601()
  updatedAt!: string;

  /**
   * Simple validation function using class-validator
   * This replaces the manual validation approach with a decorator-based solution
   */
  static async validate(data: unknown, operation: 'create' | 'update' = 'create'): Promise<void> {
    if (!data || typeof data !== 'object') {
      throw new Error('Data must be an object');
    }
    const dataRecord = data as Record<string, unknown>;
    const entity = new StarshipEntity();

    // For create operations, validate all required fields
    if (operation === 'create') {
      Object.assign(entity, {
        id: dataRecord.id || 'temp-id', // Will be replaced by auto-generated ID
        slug: dataRecord.slug || '',
        ownerId: dataRecord.ownerId || '',
        name: dataRecord.name || '',
        maxAgents: dataRecord.maxAgents ?? 3,
        status: dataRecord.status || 'active',
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
   * Helper method to check if starship is active
   */
  isActive(): boolean {
    return this.status === 'active';
  }

  /**
   * Helper method to check if starship is disabled
   */
  isDisabled(): boolean {
    return this.status === 'inactive';
  }

  /**
   * Helper method to get starship status display name
   */
  getStatusDisplayName(): string {
    const statusNames: Record<StarshipStatus, string> = {
      active: 'Active',
      inactive: 'Inactive',
    };
    return statusNames[this.status] || 'Unknown Status';
  }

  /**
   * Helper method to get starship age in days
   */
  getAgeInDays(): number {
    return Math.floor((Date.now() - new Date(this.createdAt).getTime()) / (1000 * 60 * 60 * 24));
  }

  /**
   * Helper method to check if starship is new (created within last 7 days)
   */
  isNew(): boolean {
    return this.getAgeInDays() <= 7;
  }

  /**
   * Helper method to get available agent slots
   */
  getAvailableAgentSlots(currentAgentCount: number = 0): number {
    return Math.max(0, this.maxAgents - currentAgentCount);
  }

  /**
   * Helper method to check if starship can accommodate more agents
   */
  canAddAgents(currentAgentCount: number = 0): boolean {
    return this.getAvailableAgentSlots(currentAgentCount) > 0;
  }

  /**
   * Helper method to get starship capacity utilization
   */
  getCapacityUtilization(currentAgentCount: number = 0): {
    agents: { used: number; max: number; percentage: number };
  } {
    return {
      agents: {
        used: currentAgentCount,
        max: this.maxAgents,
        percentage: this.maxAgents === 0 ? 0 : Math.round((currentAgentCount / this.maxAgents) * 100),
      },
    };
  }

  /**
   * Helper method to generate a unique slug candidate
   */
  static generateSlugFromName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-_]/g, '') // Remove special characters except spaces, hyphens, and underscores
      .replace(/[\s_]+/g, '-') // Replace spaces and underscores with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
  }

  /**
   * Helper method to check if starship needs attention (e.g., inactive for too long)
   */
  needsAttention(): boolean {
    return this.status === 'inactive' && this.getAgeInDays() > 30;
  }
}
