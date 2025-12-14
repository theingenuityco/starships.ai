import { Expose } from 'class-transformer';
import { IsArray, IsIn, IsObject, IsOptional, IsString, Length, IsISO8601, IsInt, Min, validate, ValidationError } from 'class-validator';
import type { Blueprint } from '@starships/autopilot';
import type { ConnectorAuthType, ConnectorProvider } from '@starships/protocol';

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
  displayName!: string;

  @Expose()
  @IsString()
  @Length(1, 1024)
  description!: string;

  @Expose()
  @IsString()
  @IsIn(['oauth2', 'api_key', 'custom', 'none'])
  authType!: ConnectorAuthType | 'none';

  /**
   * runtimeConfig is an open-ended JSON object that can hold:
   * - env key names for client_id / client_secret
   * - extra OAuth parameters
   * - host runtime hints for http_request connector behavior
   * - any other non-secret configuration
   */
  @Expose()
  @IsObject()
  runtimeConfig!: Record<string, unknown>;

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

  // Inline blueprints for connector flows

  @Expose()
  @IsOptional()
  @IsObject()
  connectBlueprint?: Blueprint;

  @Expose()
  @IsOptional()
  @IsObject()
  refreshBlueprint?: Blueprint;

  @Expose()
  @IsOptional()
  @IsObject()
  testBlueprint?: Blueprint;

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
      displayName: dataRecord.displayName || '',
      description: dataRecord.description || '',
      authType: (dataRecord.authType as ConnectorAuthType) || 'oauth2',
      runtimeConfig: dataRecord.runtimeConfig || {},
      version: (dataRecord.version as string) || '1.0.0',
      category: (dataRecord.category as string) || 'connector',
      usageCount: (dataRecord.usageCount as number) ?? 0,
      connectBlueprint: dataRecord.connectBlueprint as Blueprint | undefined,
      refreshBlueprint: dataRecord.refreshBlueprint as Blueprint | undefined,
      testBlueprint: dataRecord.testBlueprint as Blueprint | undefined,
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
