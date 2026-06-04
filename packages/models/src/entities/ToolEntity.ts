/**
 * Tool Entity - Layer 2
 *
 * Bridges between database records and domain models with validation and transformation capabilities.
 * Follows the layered architecture pattern established by AgentEntity.
 */

import type { ToolModel } from '@starships/protocol';
import type { ToolParameterSchema, TransformOperation, Blueprint } from '@starships/protocol';
import { Expose } from 'class-transformer';
import { IsISO8601, IsObject, IsOptional, IsString, Length, validate, ValidationError as ClassValidatorValidationError, IsBoolean, IsArray } from 'class-validator';
import { TOOL_DESCRIPTION_MAX_LENGTH } from '@/constants/toolValidation';
import { ValidationError } from '@starships/errors';

export class ToolEntity implements ToolModel {
  // Core database fields
  @Expose()
  @IsString()
  @Length(1, 255)
  id!: string;

  // Stable content hash used for import/export conflict detection (stored in DB)
  @Expose()
  @IsOptional()
  @IsString()
  @Length(64, 64)
  contentHash?: string;

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

  // Core ToolParams fields
  @Expose()
  @IsString()
  @Length(1, 100)
  name!: string;

  @Expose()
  @IsString()
  @Length(0, TOOL_DESCRIPTION_MAX_LENGTH)
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

  /** Connector providers used by this tool's blueprint (connector_action nodes) */
  @Expose()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredConnectorProviders?: string[];

  /**
   * Simple validation function using class-validator
   * This replaces the manual validation approach with a decorator-based solution
   */
  static async validate(data: unknown, operation: 'create' | 'update' = 'create'): Promise<void> {
    if (!data || typeof data !== 'object') {
      throw new ValidationError('Data must be an object');
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
        throw new ValidationError('Parameters and blueprint must both be provided together when setting either one', 'parameters');
      }

      Object.assign(entity, {
        id: dataRecord.id || 'temp-id', // Will be replaced by auto-generated ID
        slug: dataRecord.slug || '',
        createdAt: dataRecord.createdAt || new Date().toISOString(),
        updatedAt: dataRecord.updatedAt || new Date().toISOString(),
        starshipId: dataRecord.starshipId || '',
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
      const fieldErrors = errors.map((e: ClassValidatorValidationError) => ({
        field: e.property || 'unknown',
        message: Object.values(e.constraints || {}).join(', '),
      }));
      const message = `Validation failed: ${fieldErrors.map((e) => `${e.field}: ${e.message}`).join('; ')}`;
      throw new ValidationError(message, fieldErrors[0]?.field, { fieldErrors });
    }
  }
}
