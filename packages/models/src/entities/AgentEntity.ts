/**
 * Agent Entity - Layer 2
 *
 * Bridges between database records and domain models with validation and transformation capabilities.
 * Follows the layered architecture pattern established by ConversationEntity and MessageEntity.
 */

import { AgentState } from '@starships/autopilot';
import { Blueprint } from '@starships/autopilot/src/types';
import type { AgentModel } from '@starships/protocol';
import { Expose } from 'class-transformer';
import {
  IsISO8601,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  validate,
  ValidationError,
  IsArray,
  IsIn,
} from 'class-validator';
import { DEFAULT_AGENT_TIMEOUT_MS } from '@/constants/agentDefaults';

export class AgentEntity implements AgentModel {
  // Core database fields
  @Expose()
  @IsString()
  @Length(1, 255)
  id!: string;

  /**
   * Human-readable role label for this agent (required).
   */
  @Expose()
  @IsString()
  @Length(1, 255)
  role!: string;

  @Expose()
  @IsISO8601()
  createdAt!: string;

  @Expose()
  @IsISO8601()
  updatedAt!: string;

  // Foreign key relationships
  @Expose()
  @IsString()
  @Length(1, 255)
  starshipId!: string;

  // Optional avatar attachment ID (S3-backed image stored via AttachmentService)
  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  avatarAttachmentId?: string;

  // Optional agent-authored avatar prompt used to guide avatar generation
  @Expose()
  @IsOptional()
  @IsString()
  @Length(0, 8000)
  avatarPrompt?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  sourceTemplateId?: string;

  // Core AgentParams fields
  @Expose()
  @IsString()
  @Length(1, 100)
  name!: string;

  @Expose()
  @IsString()
  @Length(1, 100)
  slug!: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @Expose()
  @IsString()
  @Length(1, 100)
  model!: string;

  @Expose()
  @IsOptional()
  @IsString()
  @IsIn(['general', 'coding', 'creative', 'analysis', 'support', 'utility', 'data', 'communication', 'automation'])
  category?: AgentModel['category'];

  @Expose()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @Expose()
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100000)
  maxTokens?: number;

  @Expose()
  @IsOptional()
  @IsObject()
  reasoning?: AgentModel['reasoning'];

  @Expose()
  @IsNumber()
  @Min(1000)
  @Max(600000)
  timeout!: number;

  @Expose()
  @IsOptional()
  @IsString()
  systemPrompt?: string; // System prompt moved to root level

  @Expose()
  @IsOptional()
  @IsObject()
  state?: AgentState; // Runtime state with messages and tools

  @Expose()
  @IsOptional()
  @IsObject()
  blueprint?: Blueprint; // Blueprint - keeping flexible for now

  // Optional example prompts surfaced on agents (usually inherited from template)
  @Expose()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  previewPrompts?: string[];

  // Versioning fields
  @Expose()
  @IsString()
  @Length(1, 20)
  version!: string; // Semantic version (e.g., '1.0.2')

  @Expose()
  @IsOptional()
  @IsISO8601()
  templateSnapshotAt?: string; // When agent last synced with template

  // Publication workflow fields
  @Expose()
  @IsString()
  @IsIn(['draft', 'pending_approval', 'published', 'rejected'])
  publicationStatus!: 'draft' | 'pending_approval' | 'published' | 'rejected';

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  publicationRequestedBy?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  publicationApprovedBy?: string;

  @Expose()
  @IsOptional()
  @IsISO8601()
  publicationApprovedAt?: string;

  // Published template linkage (Agent → Template)
  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  publishedTemplateId?: string;

  // Additional publication metadata (owner-selected)
  @Expose()
  @IsOptional()
  @IsString()
  @IsIn(['patch', 'minor', 'major'])
  publicationVersionBump?: 'patch' | 'minor' | 'major';

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 20)
  publicationRequestedVersion?: string;

  @Expose()
  @IsOptional()
  @IsString()
  publicationChangelog?: string;

  // Update availability info (computed at runtime, not stored in DB)
  @Expose()
  @IsOptional()
  @IsObject()
  updateInfo?: {
    needsUpdate: boolean;
    latestVersion: string;
    templateUpdatedAt?: string;
  };

  /**
   * Simple validation function using class-validator
   * This replaces the manual validation approach with a decorator-based solution
   */
  static async validate(data: unknown, operation: 'create' | 'update' = 'create'): Promise<void> {
    if (!data || typeof data !== 'object') {
      throw new Error('Data must be an object');
    }
    const dataRecord = data as Record<string, unknown>;
    const entity = new AgentEntity();

    // For create operations, validate all required fields
    if (operation === 'create') {
      Object.assign(entity, {
        id: dataRecord.id || 'temp-id', // Will be replaced by auto-generated ID
        createdAt: dataRecord.createdAt || new Date().toISOString(),
        updatedAt: dataRecord.updatedAt || new Date().toISOString(),
        // Require starshipId for creation
        starshipId: (dataRecord.starshipId as string) || '',
        sourceTemplateId: dataRecord.sourceTemplateId,
        name: dataRecord.name || '',
        role: (dataRecord.role as string) || 'Assistant',
        description: dataRecord.description,
        model: dataRecord.model || '',
        temperature: dataRecord.temperature,
        maxTokens: dataRecord.maxTokens,
        reasoning: dataRecord.reasoning,
        timeout: dataRecord.timeout ?? DEFAULT_AGENT_TIMEOUT_MS,
        systemPrompt: dataRecord.systemPrompt,
        state: dataRecord.state || { messages: [], tools: [] },
        blueprint: dataRecord.blueprint || { nodes: [], edges: [] },
        version: dataRecord.version || '1.0.0',
        templateSnapshotAt: dataRecord.templateSnapshotAt,
        // Publication workflow default for creates
        publicationStatus: dataRecord.publicationStatus || 'draft',
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
}
