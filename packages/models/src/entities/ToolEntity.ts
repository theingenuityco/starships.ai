/**
 * Tool Entity - Layer 2
 *
 * Bridges between database records and domain models with validation and transformation capabilities.
 * Follows the layered architecture pattern established by AgentEntity.
 */

import type { ToolModel } from '@starships/protocol';
import type { ToolParameterSchema, TransformOperation, Blueprint } from '@starships/autopilot';
import { Expose } from 'class-transformer';
import { IsISO8601, IsObject, IsOptional, IsString, Length, validate, ValidationError, IsBoolean, IsArray, IsIn } from 'class-validator';

export class ToolEntity implements ToolModel {
  // Core database fields
  @Expose()
  @IsString()
  @Length(1, 255)
  id!: string;

  @Expose()
  @IsString()
  @Length(1, 100)
  slug!: string;

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

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  sourceTemplateId?: string;

  // Published template linkage (Tool → ToolTemplate)
  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  publishedTemplateId?: string;

  // Core ToolParams fields
  @Expose()
  @IsString()
  @Length(1, 100)
  name!: string;

  @Expose()
  @IsString()
  @Length(0, 4000)
  description!: string;

  @Expose()
  @IsOptional()
  @IsObject()
  parameters?: {
    type: 'object';
    properties: Record<string, ToolParameterSchema>;
    required?: string[];
  };

  @Expose()
  @IsOptional()
  @IsObject()
  blueprint?: Blueprint;

  // BaseParams fields
  @Expose()
  @IsOptional()
  @IsArray()
  transforms?: TransformOperation[];

  @Expose()
  @IsOptional()
  @IsArray()
  mutations?: TransformOperation[];

  @Expose()
  @IsOptional()
  @IsString()
  condition?: string;

  // Tool-specific fields
  @Expose()
  @IsOptional()
  @IsObject()
  configuration?: Record<string, unknown>;

  @Expose()
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @Expose()
  @IsOptional()
  @IsString()
  status?: 'draft' | 'active';

  // Versioning fields
  @Expose()
  @IsString()
  @Length(1, 20)
  version!: string; // Semantic version (e.g., '1.0.2')

  @Expose()
  @IsOptional()
  @IsISO8601()
  templateSnapshotAt?: string; // When tool last synced with template

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
    const entity = new ToolEntity();

    // For create operations, validate all required fields
    if (operation === 'create') {
      const status = (dataRecord.status as 'draft' | 'active' | undefined) || 'active';

      // If either parameters or blueprint is provided, the other must also be provided
      const hasParams = !!dataRecord.parameters;
      const hasBlueprint = !!dataRecord.blueprint;
      if ((hasParams && !hasBlueprint) || (!hasParams && hasBlueprint)) {
        throw new Error('Validation failed: Parameters and blueprint must both be provided together when setting either one');
      }

      Object.assign(entity, {
        id: dataRecord.id || 'temp-id', // Will be replaced by auto-generated ID
        slug: dataRecord.slug || '',
        createdAt: dataRecord.createdAt || new Date().toISOString(),
        updatedAt: dataRecord.updatedAt || new Date().toISOString(),
        starshipId: dataRecord.starshipId || '',
        sourceTemplateId: dataRecord.sourceTemplateId,
        publishedTemplateId: dataRecord.publishedTemplateId,
        name: dataRecord.name || '',
        description: dataRecord.description || '',
        parameters: dataRecord.parameters,
        blueprint: dataRecord.blueprint,
        transforms: dataRecord.transforms,
        mutations: dataRecord.mutations,
        condition: dataRecord.condition,
        configuration: dataRecord.configuration || {},
        isEnabled: dataRecord.isEnabled ?? true,
        status: status,
        version: dataRecord.version || '1.0.0',
        templateSnapshotAt: dataRecord.templateSnapshotAt,
        // Publication workflow default for creates
        publicationStatus: (dataRecord.publicationStatus as ToolModel['publicationStatus']) || 'draft',
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
