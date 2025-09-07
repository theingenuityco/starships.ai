/**
 * Mission Entity - Layer 2
 *
 * Bridges between database records and domain models with validation and transformation capabilities.
 * Follows the layered architecture pattern established by ConversationEntity and UserEntity.
 */

import type { MissionModel } from '@starships/protocol';
import { Expose, instanceToPlain, plainToInstance, Transform } from 'class-transformer';
import { IsArray, IsEnum, IsISO8601, IsOptional, IsString, Length } from 'class-validator';

/**
 * Custom transformers for the MissionEntity
 */
export class MissionTransformers {
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
   * Transform agent IDs array to ensure consistency
   */
  static AgentIdsTransform() {
    return Transform(({ value }) => {
      if (!value) return [];
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') return [value];
      return [];
    });
  }

  /**
   * Transform mission name to ensure proper formatting
   */
  static NameTransform() {
    return Transform(({ value }) => {
      if (!value) return value;
      if (typeof value === 'string') {
        return value.trim();
      }
      return value;
    });
  }

  /**
   * Transform description to ensure proper formatting
   */
  static DescriptionTransform() {
    return Transform(({ value }) => {
      if (!value) return value;
      if (typeof value === 'string') {
        return value.trim();
      }
      return value;
    });
  }
}

export class MissionEntity implements MissionModel {
  [key: string]: unknown;

  // Core database fields
  @Expose()
  @IsString()
  @Length(1, 255)
  id!: string;

  @Expose()
  @MissionTransformers.DateTransform()
  @IsISO8601()
  createdAt!: string;

  @Expose()
  @MissionTransformers.DateTransform()
  @IsISO8601()
  updatedAt!: string;

  @Expose()
  @IsString()
  @Length(1, 255)
  createdBy!: string;

  // Mission core fields
  @Expose()
  @IsString()
  @Length(1, 255)
  starshipId!: string;

  @Expose()
  @MissionTransformers.NameTransform()
  @IsString()
  @Length(1, 200)
  name!: string;

  @Expose()
  @MissionTransformers.DescriptionTransform()
  @IsString()
  @Length(1, 2000)
  description!: string;

  @Expose()
  @IsEnum(['draft', 'active', 'completed', 'failed', 'cancelled'])
  status!: 'draft' | 'active' | 'completed' | 'failed' | 'cancelled';

  @Expose()
  @IsEnum(['welcome', 'analysis', 'plan', 'execute', 'converse'])
  phase!: 'welcome' | 'analysis' | 'plan' | 'execute' | 'converse';

  @Expose()
  @MissionTransformers.AgentIdsTransform()
  @IsArray()
  agentIds!: string[];

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  blueprintId?: string;

  @Expose()
  @IsEnum(['pending', 'approved', 'rejected', 'modified'])
  approvalStatus!: 'pending' | 'approved' | 'rejected' | 'modified';

  @Expose()
  @IsOptional()
  @MissionTransformers.DateTransform()
  @IsISO8601()
  approvedAt?: string;

  /**
   * Static factory method for creating MissionEntity from raw data
   */
  static deserialize(data: Record<string, any>): MissionEntity {
    return plainToInstance(MissionEntity, data, {
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
    const entity = MissionEntity.deserialize(data);

    // Context-specific validation rules
    if (context === 'create') {
      // For creation, certain fields are required
      if (!entity.name) {
        throw new Error('Name is required for mission creation');
      }
      if (!entity.description) {
        throw new Error('Description is required for mission creation');
      }
      if (!entity.starshipId) {
        throw new Error('Starship ID is required for mission creation');
      }
      if (!entity.createdBy) {
        throw new Error('Created by user ID is required for mission creation');
      }
    }

    // Business rule validations
    if (entity.name && entity.name.length < 1) {
      throw new Error('Mission name cannot be empty');
    }

    if (entity.name && entity.name.length > 200) {
      throw new Error('Mission name cannot exceed 200 characters');
    }

    if (entity.description && entity.description.length < 1) {
      throw new Error('Mission description cannot be empty');
    }

    if (entity.description && entity.description.length > 2000) {
      throw new Error('Mission description cannot exceed 2000 characters');
    }

    if (entity.agentIds && entity.agentIds.length === 0) {
      throw new Error('At least one agent must be assigned to the mission');
    }

    // Status validation
    const validStatuses = ['draft', 'active', 'completed', 'failed', 'cancelled'];
    if (entity.status && !validStatuses.includes(entity.status)) {
      throw new Error('Invalid mission status');
    }

    // Phase validation
    const validPhases = ['welcome', 'analysis', 'plan', 'execute', 'converse'];
    if (entity.phase && !validPhases.includes(entity.phase)) {
      throw new Error('Invalid mission phase');
    }

    // Approval status validation
    const validApprovalStatuses = ['pending', 'approved', 'rejected', 'modified'];
    if (entity.approvalStatus && !validApprovalStatuses.includes(entity.approvalStatus)) {
      throw new Error('Invalid approval status');
    }
  }

  /**
   * Helper method to check if mission is active
   */
  isActive(): boolean {
    return this.status === 'active';
  }

  /**
   * Helper method to check if mission is completed
   */
  isCompleted(): boolean {
    return this.status === 'completed';
  }

  /**
   * Helper method to check if mission is draft
   */
  isDraft(): boolean {
    return this.status === 'draft';
  }

  /**
   * Helper method to check if mission is cancelled
   */
  isCancelled(): boolean {
    return this.status === 'cancelled';
  }

  /**
   * Helper method to check if mission is failed
   */
  isFailed(): boolean {
    return this.status === 'failed';
  }

  /**
   * Helper method to check if mission is approved
   */
  isApproved(): boolean {
    return this.approvalStatus === 'approved';
  }

  /**
   * Helper method to check if mission is in execution phase
   */
  isExecuting(): boolean {
    return this.phase === 'execute';
  }

  /**
   * Helper method to check if mission is in planning phase
   */
  isPlanning(): boolean {
    return this.phase === 'plan';
  }

  /**
   * Helper method to get mission age in milliseconds
   */
  getAge(): number {
    return Date.now() - new Date(this.createdAt).getTime();
  }

  /**
   * Helper method to get mission duration (if completed)
   */
  getDuration(): number | null {
    if (!this.isCompleted() && !this.isFailed() && !this.isCancelled()) {
      return null;
    }
    return new Date(this.updatedAt).getTime() - new Date(this.createdAt).getTime();
  }

  /**
   * Helper method to check if mission has assigned agents
   */
  hasAssignedAgents(): boolean {
    return this.agentIds.length > 0;
  }

  /**
   * Helper method to get agent count
   */
  getAgentCount(): number {
    return this.agentIds.length;
  }

  /**
   * Helper method to check if mission has blueprint
   */
  hasBlueprint(): boolean {
    return !!this.blueprintId;
  }

  /**
   * Helper method to get mission status display name
   */
  getStatusDisplayName(): string {
    const statusMap = {
      draft: 'Draft',
      active: 'Active',
      completed: 'Completed',
      failed: 'Failed',
      cancelled: 'Cancelled',
    };
    return statusMap[this.status] || 'Unknown';
  }

  /**
   * Helper method to get mission phase display name
   */
  getPhaseDisplayName(): string {
    const phaseMap = {
      welcome: 'Welcome',
      analysis: 'Analysis',
      plan: 'Planning',
      execute: 'Execution',
      converse: 'Conversation',
    };
    return phaseMap[this.phase] || 'Unknown';
  }

  /**
   * Helper method to check if mission is new (created within last 24 hours)
   */
  isNewMission(): boolean {
    const twentyFourHoursInMs = 24 * 60 * 60 * 1000;
    return this.getAge() < twentyFourHoursInMs;
  }
}
