/**
 * Starship Entity - Layer 2
 *
 * Bridges between database records and domain models with validation and transformation capabilities.
 * Follows the layered architecture pattern established by ConversationEntity and MessageEntity.
 */

import type { StarshipClass, StarshipModel, StarshipStatus } from '@starships/protocol';
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

  /**
   * Transform max agents based on starship class
   */
  static MaxAgentsTransform() {
    return Transform(({ value, obj }) => {
      if (typeof value === 'number' && value > 0) return value;
      // Auto-calculate based on class if not provided
      switch (obj.class) {
        case 'scout':
          return 3;
        case 'cruiser':
          return 5;
        case 'draught':
          return 10;
        default:
          return 3;
      }
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
  @IsEnum(['scout', 'cruiser', 'draught'])
  class!: StarshipClass;

  @Expose()
  @IsString()
  @Length(1, 100)
  name!: string;

  @Expose()
  @StarshipTransformers.MaxAgentsTransform()
  @IsNumber()
  @Min(1)
  @Max(50) // Reasonable upper limit
  maxAgents!: number;

  @Expose()
  @IsEnum(['active', 'inactive', 'restricted', 'disabled', 'pending_payment'])
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
        class: dataRecord.class || 'scout',
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
   * Helper method to check if starship is restricted
   */
  isRestricted(): boolean {
    return this.status === 'restricted';
  }

  /**
   * Helper method to check if starship has pending payment
   */
  hasPendingPayment(): boolean {
    return this.status === 'pending_payment';
  }

  /**
   * Helper method to check if starship is disabled
   */
  isDisabled(): boolean {
    return this.status === 'disabled';
  }

  /**
   * Helper method to get starship class display name
   */
  getClassDisplayName(): string {
    const classNames = {
      scout: 'Scout Class',
      cruiser: 'Cruiser Class',
      draught: 'Draught Class',
    };
    return classNames[this.class] || 'Unknown Class';
  }

  /**
   * Helper method to get starship status display name
   */
  getStatusDisplayName(): string {
    const statusNames = {
      active: 'Active',
      inactive: 'Inactive',
      restricted: 'Restricted',
      disabled: 'Disabled',
      pending_payment: 'Payment Pending',
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
   * Helper method to check if starship needs attention (e.g., payment issues, inactive)
   */
  needsAttention(): boolean {
    return (
      this.status === 'pending_payment' ||
      this.status === 'restricted' ||
      this.status === 'disabled' ||
      (this.status === 'inactive' && this.getAgeInDays() > 30)
    );
  }
}
