import { Expose } from 'class-transformer';
import { IsArray, IsIn, IsObject, IsOptional, IsString, Length, validate, ValidationError } from 'class-validator';

/**
 * ConnectorProviderEntity
 *
 * DB-backed definition of a connector provider (catalog entry).
 * This replaces the static CONNECTOR_CATALOG in the server.
 */
export class ConnectorProviderEntity {
  @Expose()
  @IsString()
  @Length(1, 255)
  id!: string; // e.g. 'linkedin', 'discord', 'google_drive', 'github', 'my_custom'

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
  @IsIn(['oauth2', 'api_key', 'none'])
  authType!: 'oauth2' | 'api_key' | 'none';

  @Expose()
  @IsArray()
  requiredEnvKeys!: string[];

  @Expose()
  @IsArray()
  @IsOptional()
  optionalEnvKeys?: string[];

  @Expose()
  @IsString()
  @IsOptional()
  docsSlug?: string;

  // OAuth2 configuration (for authType = 'oauth2')

  @Expose()
  @IsString()
  @IsOptional()
  oauthAuthorizeUrl?: string;

  @Expose()
  @IsString()
  @IsOptional()
  oauthTokenUrl?: string;

  @Expose()
  @IsArray()
  @IsOptional()
  oauthScopes?: string[];

  @Expose()
  @IsString()
  @IsOptional()
  oauthRedirectPath?: string;

  /**
   * runtimeConfig is an open-ended JSON object that can hold:
   * - env key names for client_id / client_secret
   * - extra OAuth parameters
   * - host runtime hints for http_request connector behavior
   * - optional blueprint identifiers for custom flows
   */
  @Expose()
  @IsObject()
  runtimeConfig!: Record<string, unknown>;

  @Expose()
  @IsString()
  @IsOptional()
  connectBlueprintId?: string;

  @Expose()
  @IsString()
  @IsOptional()
  refreshBlueprintId?: string;

  @Expose()
  @IsString()
  @IsOptional()
  testBlueprintId?: string;

  static async validate(data: unknown): Promise<void> {
    if (!data || typeof data !== 'object') {
      throw new Error('Data must be an object');
    }

    const dataRecord = data as Record<string, unknown>;
    const entity = new ConnectorProviderEntity();

    Object.assign(entity, {
      requiredEnvKeys: [],
      optionalEnvKeys: [],
      oauthScopes: [],
      runtimeConfig: {},
      ...dataRecord,
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


