import { Expose } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  Length,
  IsISO8601,
  IsInt,
  Min,
  validate,
  ValidationError,
} from 'class-validator';
import type {
  ConnectorAuthTypeV2,
  ConnectorAuthV2,
  ConnectorEndpointV2,
  ConnectorProvider,
  ConnectorTemplateRuntimeFieldsV2,
  JsonSchemaObject,
} from '@starships/protocol';

/**
 * ConnectorTemplateEntity
 *
 * Template-level definition of a connector, mirroring the pattern of
 * ToolTemplateEntity and AgentTemplateEntity. Instances of connectors are
 * stored in the connectors table and may reference a specific template +
 * version.
 */
export class ConnectorTemplateEntity {
  @Expose()
  @IsString()
  @Length(1, 255)
  id!: string;

  @Expose()
  @IsString()
  @Length(1, 255)
  slug!: string;

  @Expose()
  @IsString()
  @Length(1, 255)
  provider!: ConnectorProvider;

  @Expose()
  @IsString()
  @Length(1, 255)
  name!: string;

  @Expose()
  @IsString()
  @Length(1, 1024)
  description!: string;

  @Expose()
  @IsString()
  @IsIn(['oauth2', 'api_key', 'basic', 'platform_jwt', 'none'])
  authType!: ConnectorAuthTypeV2;

  /**
   * V2 runtime fields (stored as root columns on connector_templates).
   *
   * IMPORTANT: These must never contain raw secret values; only secret references.
   */
  @Expose()
  @IsString()
  @Length(1, 2048)
  baseUrl!: string;

  @Expose()
  @IsObject()
  authJson!: ConnectorAuthV2;

  @Expose()
  @IsOptional()
  @IsArray()
  variablesJson?: NonNullable<ConnectorTemplateRuntimeFieldsV2['variables']>;

  @Expose()
  @IsArray()
  endpointsJson!: ConnectorEndpointV2[];

  @Expose()
  @IsOptional()
  @IsObject()
  rateLimitJson?: NonNullable<ConnectorTemplateRuntimeFieldsV2['rateLimit']>;

  @Expose()
  @IsOptional()
  @IsObject()
  metadataSchemaJson?: JsonSchemaObject;

  // Versioning / metadata

  @Expose()
  @IsString()
  @Length(1, 20)
  version!: string;

  @Expose()
  @IsString()
  @Length(1, 100)
  category!: string;

  @Expose()
  @IsInt()
  @Min(0)
  usageCount!: number;

  @Expose()
  @IsBoolean()
  isEnabled!: boolean;

  @Expose()
  @IsISO8601()
  createdAt!: string;

  @Expose()
  @IsISO8601()
  updatedAt!: string;

  static async validate(data: unknown): Promise<void> {
    if (!data || typeof data !== 'object') {
      throw new Error('Data must be an object');
    }

    const dataRecord = data as Record<string, unknown>;
    const entity = new ConnectorTemplateEntity();

    Object.assign(entity, {
      id: dataRecord.id || 'temp-id',
      slug: dataRecord.slug || (dataRecord.provider as string | undefined) || '',
      provider: (dataRecord.provider as string) || '',
      name: dataRecord.name || '',
      description: dataRecord.description || '',
      authType:
        (dataRecord.authType as ConnectorAuthTypeV2) ||
        (((dataRecord.authJson as { type?: string } | undefined)?.type as ConnectorAuthTypeV2 | undefined) ?? 'oauth2'),
      baseUrl: (dataRecord.baseUrl as string) || '',
      authJson: (dataRecord.authJson as ConnectorAuthV2) || ({ type: 'none' } as ConnectorAuthV2),
      variablesJson: dataRecord.variablesJson as NonNullable<ConnectorTemplateRuntimeFieldsV2['variables']> | undefined,
      endpointsJson: (dataRecord.endpointsJson as ConnectorEndpointV2[]) || [],
      rateLimitJson: dataRecord.rateLimitJson as NonNullable<ConnectorTemplateRuntimeFieldsV2['rateLimit']> | undefined,
      metadataSchemaJson: dataRecord.metadataSchemaJson as JsonSchemaObject | undefined,
      version: (dataRecord.version as string) || '1.0.0',
      category: (dataRecord.category as string) || 'connector',
      usageCount: (dataRecord.usageCount as number) ?? 0,
      isEnabled: (dataRecord.isEnabled as boolean) ?? true,
      createdAt: dataRecord.createdAt || new Date().toISOString(),
      updatedAt: dataRecord.updatedAt || new Date().toISOString(),
    });

    const errors = await validate(entity, {
      skipMissingProperties: false,
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    if (errors.length > 0) {
      const errorMessages = errors.map((error: ValidationError) => Object.values(error.constraints || {}).join(', ')).join('; ');
      throw new Error(`Validation failed: ${errorMessages}`);
    }
  }
}
