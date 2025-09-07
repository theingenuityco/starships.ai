/**
 * Starship Entity - Layer 2
 *
 * Bridges between database records and domain models with validation and transformation capabilities.
 * Follows the layered architecture pattern established by ConversationEntity and MessageEntity.
 */

import type { BillingPeriod, StarshipClass, StarshipModel, StarshipStatus } from '@starships/protocol';
import { Expose, instanceToPlain, plainToInstance, Transform } from 'class-transformer';
import { IsEnum, IsISO8601, IsNumber, IsOptional, IsString, Length, Max, Min } from 'class-validator';

/**
 * Custom transformers for the StarshipEntity
 */
export class StarshipTransformers {
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
   * Transform slug to ensure it's URL-safe
   */
  static SlugTransform() {
    return Transform(({ value }) => {
      if (typeof value !== 'string') return value;
      return value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '') // Remove special characters except spaces and hyphens
        .replace(/\s+/g, '-') // Replace spaces with hyphens
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

  /**
   * Transform max active missions based on starship class
   */
  static MaxActiveMissionsTransform() {
    return Transform(({ value, obj }) => {
      if (typeof value === 'number' && value > 0) return value;
      // Auto-calculate based on class if not provided
      switch (obj.class) {
        case 'scout':
          return 3;
        case 'cruiser':
          return 6;
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
  @StarshipTransformers.MaxActiveMissionsTransform()
  @IsNumber()
  @Min(1)
  @Max(50) // Reasonable upper limit
  maxActiveMissions!: number;

  @Expose()
  @IsEnum(['active', 'inactive', 'restricted', 'disabled', 'pending_payment'])
  status!: StarshipStatus;

  @Expose()
  @StarshipTransformers.DateTransform()
  @IsISO8601()
  createdAt!: string;

  @Expose()
  @StarshipTransformers.DateTransform()
  @IsISO8601()
  updatedAt!: string;

  // Stripe integration fields
  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  subscriptionId?: string;

  @Expose()
  @IsOptional()
  @IsEnum(['scout', 'cruiser', 'draught'])
  plan?: StarshipClass;

  @Expose()
  @IsOptional()
  @IsEnum(['monthly', 'yearly'])
  billingPeriod?: BillingPeriod;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  stripeCustomerId?: string;

  /**
   * Static factory method for creating StarshipEntity from raw data
   */
  static deserialize(data: Record<string, any>): StarshipEntity {
    return plainToInstance(StarshipEntity, data, {
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
    const entity = StarshipEntity.deserialize(data);

    // Context-specific validation rules
    if (context === 'create') {
      // For creation, certain fields are required
      if (!entity.name) {
        throw new Error('Name is required for starship creation');
      }
      if (!entity.class) {
        throw new Error('Class is required for starship creation');
      }
      if (!entity.ownerId) {
        throw new Error('Owner ID is required for starship creation');
      }
    }

    // Business rule validations
    if (entity.name && (entity.name.length < 1 || entity.name.length > 100)) {
      throw new Error('Starship name must be between 1 and 100 characters');
    }

    if (entity.slug && (entity.slug.length < 1 || entity.slug.length > 100)) {
      throw new Error('Starship slug must be between 1 and 100 characters');
    }

    // Validate slug format (URL-safe)
    if (entity.slug && !/^[a-z0-9-]+$/.test(entity.slug)) {
      throw new Error('Starship slug must contain only lowercase letters, numbers, and hyphens');
    }

    // Validate class-based limits
    if (entity.class) {
      const expectedMaxAgents = entity.class === 'scout' ? 3 : entity.class === 'cruiser' ? 5 : 10;
      if (entity.maxAgents && entity.maxAgents !== expectedMaxAgents) {
        console.warn(`Max agents (${entity.maxAgents}) doesn't match class expectation (${expectedMaxAgents})`);
      }

      const expectedMaxMissions = entity.class === 'scout' ? 3 : entity.class === 'cruiser' ? 6 : 10;
      if (entity.maxActiveMissions && entity.maxActiveMissions !== expectedMaxMissions) {
        console.warn(`Max missions (${entity.maxActiveMissions}) doesn't match class expectation (${expectedMaxMissions})`);
      }
    }

    // Validate Stripe fields consistency
    if (entity.subscriptionId && !entity.stripeCustomerId) {
      throw new Error('Stripe customer ID is required when subscription ID is provided');
    }

    if (entity.billingPeriod && !entity.subscriptionId) {
      throw new Error('Subscription ID is required when billing period is specified');
    }

    // Validate status transitions (basic rules)
    if (entity.status === 'pending_payment' && entity.subscriptionId) {
      console.warn('Starship has pending payment status but subscription ID exists');
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
   * Helper method to check if starship has Stripe integration
   */
  hasStripeIntegration(): boolean {
    return !!(this.subscriptionId || this.stripeCustomerId);
  }

  /**
   * Helper method to check if starship is on a paid plan
   */
  isPaidPlan(): boolean {
    return this.class !== 'scout' || this.hasStripeIntegration();
  }

  /**
   * Helper method to get billing display info
   */
  getBillingInfo(): { plan: string; period?: string; status: string } {
    return {
      plan: this.plan ? this.getClassDisplayName() : this.getClassDisplayName(),
      period: this.billingPeriod ? (this.billingPeriod === 'monthly' ? 'Monthly' : 'Yearly') : undefined,
      status: this.getStatusDisplayName(),
    };
  }

  /**
   * Helper method to get available agent slots
   */
  getAvailableAgentSlots(currentAgentCount: number = 0): number {
    return Math.max(0, this.maxAgents - currentAgentCount);
  }

  /**
   * Helper method to get available mission slots
   */
  getAvailableMissionSlots(currentMissionCount: number = 0): number {
    return Math.max(0, this.maxActiveMissions - currentMissionCount);
  }

  /**
   * Helper method to check if starship can accommodate more agents
   */
  canAddAgents(currentAgentCount: number = 0): boolean {
    return this.getAvailableAgentSlots(currentAgentCount) > 0;
  }

  /**
   * Helper method to check if starship can accommodate more missions
   */
  canAddMissions(currentMissionCount: number = 0): boolean {
    return this.getAvailableMissionSlots(currentMissionCount) > 0;
  }

  /**
   * Helper method to get starship capacity utilization
   */
  getCapacityUtilization(
    currentAgentCount: number = 0,
    currentMissionCount: number = 0
  ): {
    agents: { used: number; max: number; percentage: number };
    missions: { used: number; max: number; percentage: number };
  } {
    return {
      agents: {
        used: currentAgentCount,
        max: this.maxAgents,
        percentage: Math.round((currentAgentCount / this.maxAgents) * 100),
      },
      missions: {
        used: currentMissionCount,
        max: this.maxActiveMissions,
        percentage: Math.round((currentMissionCount / this.maxActiveMissions) * 100),
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
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters except spaces and hyphens
      .replace(/\s+/g, '-') // Replace spaces with hyphens
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
