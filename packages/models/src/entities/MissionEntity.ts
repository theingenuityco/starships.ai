/**
 * Mission Entity - Layer 2
 *
 * Bridges between database records and domain models with validation and transformation capabilities.
 * Follows the layered architecture pattern established by ConversationEntity and UserEntity.
 */

import { Transformers } from '@/helpers/serializer';
import type { MissionModel } from '@starships/protocol';
import { Expose, instanceToPlain, plainToInstance, Transform } from 'class-transformer';
import { IsArray, IsEnum, IsISO8601, IsOptional, IsString, Length, validate, ValidationError } from 'class-validator';

/**
 * Custom transformers for the MissionEntity
 */
export class MissionTransformers {
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
  @Transformers.DateTransform()
  @IsISO8601()
  createdAt!: string;

  @Expose()
  @Transformers.DateTransform()
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
  @Transformers.DateTransform()
  @IsISO8601()
  approvedAt?: string;

  /**
   * Static factory method for creating MissionEntity from raw data
   */
  static deserialize(data: Record<string, unknown>): MissionEntity {
    return plainToInstance(MissionEntity, data, {
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
    const entity = new MissionEntity();

    // For create operations, validate all required fields
    if (operation === 'create') {
      Object.assign(entity, {
        id: dataRecord.id || 'temp-id', // Will be replaced by auto-generated ID
        createdAt: dataRecord.createdAt || new Date().toISOString(),
        updatedAt: dataRecord.updatedAt || new Date().toISOString(),
        createdBy: dataRecord.createdBy || '',
        starshipId: dataRecord.starshipId || '',
        name: dataRecord.name || '',
        description: dataRecord.description || '',
        status: dataRecord.status || 'draft',
        phase: dataRecord.phase || 'welcome',
        agentIds: dataRecord.agentIds || [],
        blueprintId: dataRecord.blueprintId,
        approvalStatus: dataRecord.approvalStatus || 'pending',
        approvedAt: dataRecord.approvedAt,
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
